import { describe, expect, it, vi } from 'vitest';
import { createHaWsBridge } from '../../lib/ha-ws-bridge.cjs';

function bridge(token = 'server-token') {
  const toHa: unknown[] = [];
  const toBrowser: unknown[] = [];
  const closeBrowser = vi.fn();
  const closeHa = vi.fn();
  const api = createHaWsBridge({
    token,
    sendToHa: (msg: unknown) => { toHa.push(msg); },
    sendToBrowser: (msg: unknown) => { toBrowser.push(msg); },
    closeBrowser,
    closeHa,
  });
  return { api, toHa, toBrowser, closeBrowser, closeHa };
}

describe('home assistant websocket bridge', () => {
  it('authenticates with the server token and forwards get_states plus state_changed', () => {
    const { api, toHa, toBrowser } = bridge();

    api.onBrowserMessage({ id: 1, type: 'get_states' });
    expect(toHa).toEqual([]);

    api.onHaMessage({ type: 'auth_required' });
    expect(toHa).toEqual([{ type: 'auth', access_token: 'server-token' }]);
    expect(toBrowser).toEqual([]);

    api.onHaMessage({ type: 'auth_ok', ha_version: '2026.11' });
    expect(toBrowser).toEqual([{ type: 'auth_required' }]);

    api.onBrowserMessage({ type: 'auth', access_token: 'browser-token-should-not-forward' });
    expect(toBrowser).toEqual([{ type: 'auth_required' }, { type: 'auth_ok' }]);
    expect(toHa).toEqual([{ type: 'auth', access_token: 'server-token' }]);

    api.onBrowserMessage({ id: 2, type: 'get_states' });
    api.onBrowserMessage({ id: 3, type: 'subscribe_events', event_type: 'state_changed' });
    api.onHaMessage({ id: 2, type: 'result', success: true, result: [{ entity_id: 'sensor.kitchen' }] });
    api.onHaMessage({
      id: 3,
      type: 'event',
      event: { event_type: 'state_changed', data: { entity_id: 'sensor.kitchen' } },
    });

    expect(toHa).toEqual([
      { type: 'auth', access_token: 'server-token' },
      { id: 2, type: 'get_states' },
      { id: 3, type: 'subscribe_events', event_type: 'state_changed' },
    ]);
    expect(JSON.stringify(toBrowser)).not.toContain('server-token');
    expect(JSON.stringify(toBrowser)).not.toContain('browser-token');
    expect(toBrowser.some((msg) => (msg as { type?: string }).type === 'event')).toBe(true);
  });

  it('closes both sockets when the server has no token', () => {
    const { api, toHa, closeBrowser, closeHa } = bridge('');
    api.onHaMessage({ type: 'auth_required' });
    expect(toHa).toEqual([]);
    expect(closeBrowser).toHaveBeenCalled();
    expect(closeHa).toHaveBeenCalled();
  });

  it('rejects commands outside the read-only allowlist and never forwards them', () => {
    const { api, toHa, toBrowser } = bridge();
    api.onHaMessage({ type: 'auth_required' });
    api.onHaMessage({ type: 'auth_ok' });
    api.onBrowserMessage({ type: 'auth', access_token: 'browser-token' });
    toHa.length = 0;
    toBrowser.length = 0;

    const rejected = [
      { id: 10, type: 'call_service', domain: 'light', service: 'turn_on', target: { entity_id: 'light.kitchen' } },
      { id: 11, type: 'subscribe_events' },
      { id: 12, type: 'subscribe_events', event_type: 'call_service' },
      { id: 13, type: 'subscribe_trigger', trigger: { platform: 'state' } },
      { id: 14, type: 'execute_script', sequence: [{ service: 'homeassistant.turn_off' }] },
      { id: 15, type: 'config/core/update', country: 'US' },
      { id: 16, type: 'config/entity_registry/update', entity_id: 'light.kitchen' },
      { id: 17, type: 'unsubscribe_events', subscription: 99 },
    ];

    for (const msg of rejected) api.onBrowserMessage(msg);

    expect(toHa).toEqual([]);
    expect(toBrowser).toEqual(rejected.map((msg) => ({
      id: msg.id,
      type: 'result',
      success: false,
      error: { code: 'not_allowed' },
    })));
  });

  it('forwards ping and unsubscribe only for a state_changed subscription this browser opened', () => {
    const { api, toHa, toBrowser } = bridge();
    api.onHaMessage({ type: 'auth_required' });
    api.onHaMessage({ type: 'auth_ok' });
    api.onBrowserMessage({ type: 'auth', access_token: 'browser-token' });
    toHa.length = 0;
    toBrowser.length = 0;

    api.onBrowserMessage({ id: 4, type: 'ping' });
    api.onBrowserMessage({ id: 5, type: 'subscribe_events', event_type: 'state_changed' });
    api.onBrowserMessage({ id: 6, type: 'unsubscribe_events', subscription: 5 });
    api.onBrowserMessage({ id: 7, type: 'unsubscribe_events', subscription: 5 });
    api.onBrowserMessage({ id: 8, type: 'unsubscribe_events', subscription: 4 });

    expect(toHa).toEqual([
      { id: 4, type: 'ping' },
      { id: 5, type: 'subscribe_events', event_type: 'state_changed' },
      { id: 6, type: 'unsubscribe_events', subscription: 5 },
    ]);
    expect(toBrowser).toEqual([
      { id: 7, type: 'result', success: false, error: { code: 'not_allowed' } },
      { id: 8, type: 'result', success: false, error: { code: 'not_allowed' } },
    ]);
  });
});
