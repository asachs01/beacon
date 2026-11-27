import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHomeSensorGate } from '../../lib/home-sensor-gate.cjs';
import { allowedEntityIdSet } from '../../lib/home-sensor-allowlist.cjs';
import { createHaWsBridge } from '../../lib/ha-ws-bridge.cjs';

function settings(enabled: boolean, ids: string[]) {
  return {
    homeSensorsEnabled: enabled,
    homeSensors: ids.map((entityId) => ({ entityId, name: '', icon: '' })),
  };
}

describe('home sensor allowlist', () => {
  it('is empty when the card is disabled, unset, or has no picks', () => {
    expect(allowedEntityIdSet(null)).toEqual(new Set());
    expect(allowedEntityIdSet({})).toEqual(new Set());
    expect(allowedEntityIdSet({ homeSensorsEnabled: 'true', homeSensors: [{ entityId: 'sensor.a' }] })).toEqual(new Set());
    expect(allowedEntityIdSet(settings(false, ['sensor.kitchen']))).toEqual(new Set());
    expect(allowedEntityIdSet(settings(true, []))).toEqual(new Set());
    expect(allowedEntityIdSet(settings(true, ['camera.porch', 'not-an-entity']))).toEqual(new Set());
  });

  it('keeps picked non-camera entity ids', () => {
    expect(allowedEntityIdSet(settings(true, ['sensor.kitchen', ' sensor.washer ', 'camera.porch', 'sensor.kitchen'])))
      .toEqual(new Set(['sensor.kitchen', 'sensor.washer']));
  });
});

function authedBridge(allowedEntityIds: () => Set<string>) {
  const toBrowser: unknown[] = [];
  const bridge = createHaWsBridge({
    token: 'server-token',
    sendToHa: () => {},
    sendToBrowser: (msg: unknown) => { toBrowser.push(msg); },
    closeBrowser: () => {},
    closeHa: () => {},
    allowedEntityIds,
  });
  bridge.onHaMessage({ type: 'auth_required' });
  bridge.onHaMessage({ type: 'auth_ok' });
  bridge.onBrowserMessage({ type: 'auth', access_token: 'browser' });
  return { bridge, toBrowser };
}

describe('home sensor gate', () => {
  it('loads persisted settings and replaces them on save', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'beacon-sensors-'));
    await writeFile(path.join(dir, 'beacon-settings.json'), JSON.stringify(settings(true, ['sensor.kitchen'])));
    const gate = createHomeSensorGate({
      readSettings: async () => JSON.parse(await readFile(path.join(dir, 'beacon-settings.json'), 'utf8')),
    });
    await gate.load();
    expect(gate.allowedEntityIds()).toEqual(new Set(['sensor.kitchen']));
    gate.applySettings(settings(true, ['binary_sensor.garage']));
    expect(gate.allowedEntityIds()).toEqual(new Set(['binary_sensor.garage']));
    gate.applySettings(settings(false, ['binary_sensor.garage']));
    expect(gate.allowedEntityIds()).toEqual(new Set());
  });

  it('delivers nothing for a disabled card and for an empty selection', () => {
    for (const saved of [settings(false, ['sensor.kitchen']), settings(true, [])]) {
      const gate = createHomeSensorGate();
      gate.applySettings(saved);
      const { bridge, toBrowser } = authedBridge(() => gate.allowedEntityIds());
      toBrowser.length = 0;
      bridge.onBrowserMessage({ id: 2, type: 'get_states' });
      bridge.onHaMessage({
        id: 2,
        type: 'result',
        success: true,
        result: [{ entity_id: 'sensor.kitchen', state: '70', attributes: { friendly_name: 'Kitchen' } }],
      });
      bridge.onHaMessage({
        id: 1,
        type: 'event',
        event: {
          event_type: 'state_changed',
          data: { entity_id: 'sensor.kitchen', new_state: { entity_id: 'sensor.kitchen', state: '71' } },
        },
      });
      expect(toBrowser).toEqual([{ id: 2, type: 'result', success: true, result: [] }]);
      expect(JSON.stringify(toBrowser)).not.toContain('70');
    }
  });

  it('pushes a newly picked entity to the open bridge and ignores a stale fetch', async () => {
    let release: (state: Record<string, unknown> | null) => void = () => {};
    const fetchEntityState = vi.fn((entityId: string) => new Promise<Record<string, unknown> | null>((resolve) => {
      release = resolve;
      void entityId;
    }));
    const gate = createHomeSensorGate({ fetchEntityState });
    const toBrowser: unknown[] = [];
    const bridge = createHaWsBridge({
      token: 'server-token',
      sendToHa: () => {},
      sendToBrowser: (msg: unknown) => { toBrowser.push(msg); },
      closeBrowser: () => {},
      closeHa: () => {},
      allowedEntityIds: () => gate.allowedEntityIds(),
      registerDeliver: (deliver: (state: Record<string, unknown>) => void) => gate.watch(deliver),
    });
    bridge.onHaMessage({ type: 'auth_required' });
    bridge.onHaMessage({ type: 'auth_ok' });
    bridge.onBrowserMessage({ type: 'auth', access_token: 'browser' });
    bridge.onBrowserMessage({ id: 5, type: 'subscribe_events', event_type: 'state_changed' });
    toBrowser.length = 0;

    const pending = gate.applySettings(settings(true, ['sensor.washer']));
    expect(gate.allowedEntityIds()).toEqual(new Set(['sensor.washer']));
    expect(fetchEntityState).toHaveBeenCalledWith('sensor.washer');

    bridge.onHaMessage({
      id: 5,
      type: 'event',
      event: {
        event_type: 'state_changed',
        data: { entity_id: 'sensor.washer', new_state: { entity_id: 'sensor.washer', state: 'running' } },
      },
    });
    expect(toBrowser).toEqual([{
      id: 5,
      type: 'event',
      event: {
        event_type: 'state_changed',
        data: { entity_id: 'sensor.washer', new_state: { entity_id: 'sensor.washer', state: 'running' } },
      },
    }]);

    release({
      entity_id: 'sensor.washer',
      state: 'done',
      attributes: { friendly_name: 'Washer', latitude: 1 },
    });
    await pending;
    expect(toBrowser).toContainEqual({
      id: 5,
      type: 'event',
      event: {
        event_type: 'state_changed',
        data: {
          entity_id: 'sensor.washer',
          new_state: {
            entity_id: 'sensor.washer',
            state: 'done',
            attributes: { friendly_name: 'Washer', latitude: 1 },
          },
        },
      },
    });

    let late: (state: Record<string, unknown> | null) => void = () => {};
    fetchEntityState.mockImplementationOnce(() => new Promise((resolve) => {
      late = resolve;
    }));
    const removed = gate.applySettings(settings(true, ['sensor.other']));
    gate.applySettings(settings(false, ['sensor.other']));
    late({ entity_id: 'sensor.other', state: '1', attributes: {} });
    await removed;
    expect(JSON.stringify(toBrowser)).not.toContain('sensor.other');
    bridge.close();
  });
});
