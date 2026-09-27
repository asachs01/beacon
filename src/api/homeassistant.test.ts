import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HomeAssistantClient } from './homeassistant';

/** A WebSocket stand-in the test drives by hand. */
class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  closed = false;
  constructor() { FakeSocket.all.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; queueMicrotask(() => this.onclose?.()); }
  receive(msg: object) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  drop() { this.onclose?.(); }
}

const latest = () => FakeSocket.all[FakeSocket.all.length - 1];

async function connected() {
  const client = new HomeAssistantClient('http://ha.local:8123', 'token');
  const done = client.connect();
  latest().receive({ type: 'auth_required' });
  latest().receive({ type: 'auth_ok' });
  await done;
  return client;
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HomeAssistantClient', () => {
  // Closing the socket scheduled a reconnect, so a client disposed of on
  // unmount came back a second later and stayed connected.
  it('stays disconnected after disconnect()', async () => {
    const client = await connected();
    client.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  // Requests in flight when the connection dropped never finished.
  it('fails requests that were waiting when the connection drops', async () => {
    const client = await connected();
    const request = client.callService('light', 'toggle', 'light.kitchen');
    latest().drop();
    await expect(request).rejects.toThrow('Connection to Home Assistant lost');
  });

  // The event reminders' notify.notify call went with an empty entity id,
  // which Home Assistant refuses.
  it('sends a service call without a target when it has no entity', async () => {
    const client = await connected();
    void client.callService('notify', 'notify', '', { message: 'Soccer in 10 minutes' });
    void client.callService('light', 'toggle', 'light.kitchen');

    const [notify, toggle] = latest().sent.filter((m) => m.type === 'call_service');
    expect(notify).not.toHaveProperty('target');
    expect(notify.service_data).toEqual({ message: 'Soccer in 10 minutes' });
    expect(toggle.target).toEqual({ entity_id: 'light.kitchen' });
  });

  // connect() never failed when the socket closed before logging in, so
  // retries never backed off while Home Assistant was down.
  it('backs off between reconnects while Home Assistant is down', async () => {
    const client = new HomeAssistantClient('http://ha.local:8123', 'token');
    await expect((async () => { const p = client.connect(); latest().drop(); await p; })()).rejects.toThrow('closed');

    const attemptsAt: number[] = [];
    for (let t = 0; t < 16_000; t += 250) {
      const before = FakeSocket.all.length;
      await vi.advanceTimersByTimeAsync(250);
      if (FakeSocket.all.length > before) {
        attemptsAt.push(t + 250);
        latest().drop();
      }
    }
    // 1s, then 2s, 4s, 8s after each failure (not every second)
    expect(attemptsAt).toEqual([1000, 3000, 7000, 15000]);
    client.disconnect();
  });

  // A refused token was retried forever, which can get the display banned
  // by Home Assistant's login attempt limit.
  it("doesn't retry a token Home Assistant refuses", async () => {
    const client = new HomeAssistantClient('http://ha.local:8123', 'revoked');
    const done = client.connect().catch((err: Error) => err.message);
    latest().receive({ type: 'auth_required' });
    latest().receive({ type: 'auth_invalid' });
    latest().drop();
    expect(await done).toBe('Invalid Home Assistant token');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  // Ending a subscription only dropped the handler here; HA kept sending.
  it('ends a subscription at Home Assistant', async () => {
    const client = await connected();
    const id = await client.subscribeStateChanges(() => {});
    client.unsubscribe(id);
    expect(latest().sent.at(-1)).toMatchObject({ type: 'unsubscribe_events', subscription: id });
  });
});
