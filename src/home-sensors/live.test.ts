import { describe, expect, it, vi } from 'vitest';
import {
  applyStateChanged,
  pickHomeSensorSource,
  runHomeSensorSubscription,
  type HaStateSource,
} from './live';
import { proxiedHaSocketUrl } from './socket-url';
import type { HaLiveState } from './types';

function source(initial: HaLiveState[]): HaStateSource & {
  handler: ((event: unknown) => void) | null;
  getStates: ReturnType<typeof vi.fn>;
  subscribeStateChanges: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
} {
  const api = {
    isConnected: true,
    handler: null as ((event: unknown) => void) | null,
    getStates: vi.fn(async () => initial),
    subscribeStateChanges: vi.fn(async (handler: (event: unknown) => void) => {
      api.handler = handler;
      return 4;
    }),
    unsubscribe: vi.fn(),
  };
  return api;
}

describe('home sensor live subscription', () => {
  it('loads get_states and applies state_changed without polling', async () => {
    const intervals: number[] = [];
    const spy = vi.spyOn(global, 'setInterval').mockImplementation(((handler: TimerHandler, ms?: number) => {
      intervals.push(ms ?? 0);
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);
    const api = source([{
      entity_id: 'sensor.kitchen',
      state: '70',
      attributes: { unit_of_measurement: '°F' },
    }]);
    const seen: HaLiveState[][] = [];
    const stop = await runHomeSensorSubscription(api, (entities) => {
      seen.push(entities);
    });

    expect(api.getStates).toHaveBeenCalledTimes(1);
    expect(api.subscribeStateChanges).toHaveBeenCalledTimes(1);
    expect(intervals).toEqual([]);
    expect(seen[0][0].state).toBe('70');

    api.handler?.({
      event_type: 'state_changed',
      data: {
        entity_id: 'sensor.kitchen',
        new_state: {
          entity_id: 'sensor.kitchen',
          state: '71',
          attributes: { unit_of_measurement: '°F' },
          last_updated: '2026-11-25T15:00:00.000Z',
        },
      },
    });
    expect(seen[1][0].state).toBe('71');

    api.handler?.({
      data: { entity_id: 'sensor.kitchen', new_state: null },
    });
    expect(seen[2][0].state).toBe('unavailable');

    stop();
    expect(api.unsubscribe).toHaveBeenCalledWith(4);
    spy.mockRestore();
  });

  it('does not call a service when a state changes', () => {
    const next = applyStateChanged([], {
      data: {
        new_state: { entity_id: 'binary_sensor.garage', state: 'on', attributes: {} },
      },
    });
    expect(next).toEqual([{ entity_id: 'binary_sensor.garage', state: 'on', attributes: {} }]);
  });

  it('uses the connected app client, otherwise the add-on proxy', () => {
    const direct = { isConnected: true, name: 'direct' };
    const proxy = { isConnected: true, name: 'proxy' };
    expect(pickHomeSensorSource({ direct, proxyMode: true, proxy })).toBe(direct);
    expect(pickHomeSensorSource({ direct: { isConnected: false, name: 'direct' }, proxyMode: true, proxy })).toBe(proxy);
    expect(pickHomeSensorSource({ direct: null, proxyMode: false, proxy })).toBeNull();
    expect(proxiedHaSocketUrl({ protocol: 'https:', host: 'ha.local' }, '/api/hassio_ingress/token'))
      .toBe('wss://ha.local/api/hassio_ingress/token/beacon-ws/ha');
  });
});
