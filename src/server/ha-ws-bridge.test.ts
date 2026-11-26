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
});
