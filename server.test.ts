// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { createServer as createHttpServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * Starts the real add-on server (server.js) with no Home Assistant behind
 * it and talks to it over HTTP. server.js is CommonJS but the repo's
 * package.json says "type": "module", so it runs from a temp copy named
 * .cjs — the same way it runs in the container, where /app has no
 * package.json.
 */

const repo = fileURLToPath(new URL('.', import.meta.url));
let dir: string;
let server: ChildProcess;
let base: string;
let output = '';

/*
 * A small stand-in for Home Assistant's REST API, answering like HA where
 * the tests rely on it: services that return nothing reject
 * ?return_response with a 400.
 */
let fakeHa: Server;
const haCalls: string[] = [];
function startFakeHa(): Promise<string> {
  const states = [
    { entity_id: 'todo.grocery', state: '1', attributes: { friendly_name: 'Grocery' } },
    { entity_id: 'todo.chores', state: '0', attributes: { friendly_name: 'Chores' } },
  ];
  const items: Record<string, object[]> = {
    'todo.grocery': [{ uid: 'g1', summary: 'Milk', status: 'needs_action' }],
    'todo.chores': [],
  };
  fakeHa = createHttpServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      haCalls.push(`${req.method} ${req.url} ${body}`);
      const [path, query = ''] = (req.url ?? '').split('?');
      const json = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (path === '/api/states') return json(200, states);
      if (path === '/api/services/todo/get_items') {
        const id = JSON.parse(body).entity_id;
        return json(200, { changed_states: [], service_response: { [id]: { items: items[id] ?? [] } } });
      }
      if (path === '/api/services/todo/add_item' || path === '/api/services/todo/update_item') {
        if (query.includes('return_response')) return json(400, { message: 'Service does not support responses. Remove return_response from request.' });
        return json(200, []);
      }
      json(404, { message: 'Not found' });
    });
  });
  return new Promise((resolve) => fakeHa.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(fakeHa.address() as { port: number }).port}`)));
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'family-server-'));
  copyFileSync(join(repo, 'server.js'), join(dir, 'server.cjs'));
  copyFileSync(join(repo, 'server-guards.cjs'), join(dir, 'server-guards.cjs'));
  copyFileSync(join(repo, 'chores-sync.cjs'), join(dir, 'chores-sync.cjs'));
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html><div id="root"></div>');

  const haBase = await startFakeHa();
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(dir, 'server.cjs')], {
    env: {
      PATH: process.env.PATH,
      NODE_PATH: join(repo, 'node_modules'),
      BEACON_PORT: String(port),
      BEACON_DIST: join(dir, 'dist'),
      BEACON_DATA: join(dir, 'data'),
      HA_API_BASE_OVERRIDE: haBase,
    },
  });
  server.stdout!.on('data', (chunk) => { output += chunk; });
  server.stderr!.on('data', (chunk) => { output += chunk; });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server didn't start:\n${output}`)), 10_000);
    server.stdout!.on('data', () => {
      if (output.includes('listening on port')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once('exit', (code) => reject(new Error(`server exited (${code}):\n${output}`)));
  });
});

afterAll(() => {
  server?.kill();
  fakeHa?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('add-on server', () => {
  it('answers a malformed collection item id with 400 and keeps running', async () => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await fetch(`${base}/beacon-collection/beacon_chores/%E0%A4%A`, {
        method,
        ...(method === 'PUT' ? { body: '{}' } : {}),
      });
      expect(res.status).toBe(400);
    }
    expect(server.exitCode).toBeNull();
    expect((await fetch(`${base}/`)).status).toBe(200);
  });

  it('stores collection items across requests', async () => {
    const created = await fetch(`${base}/beacon-collection/test_items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Feed the dog' }),
    }).then((r) => r.json());
    expect(created.id).toEqual(expect.any(String));

    const items = await fetch(`${base}/beacon-collection/test_items`).then((r) => r.json());
    expect(items).toEqual([created]);
  });

  // Displays reloaded the whole completion history on every change.
  it('returns only items completed since a given time', async () => {
    const add = (completed_at: string) => fetch(`${base}/beacon-collection/test_completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chore_id: 'c1', completed_at }),
    }).then((r) => r.json());
    await add('2025-01-10T09:00:00.000Z');
    const recent = await add('2026-09-26T09:00:00.000Z');

    const since = encodeURIComponent('2026-09-26T00:00:00.000Z');
    expect(await fetch(`${base}/beacon-collection/test_completions?since=${since}`).then((r) => r.json())).toEqual([recent]);
    // A one-off chore stays done: its completions come whatever their age.
    await fetch(`${base}/beacon-collection/beacon_chores`, { method: 'POST', body: JSON.stringify({ id: 'c1', name: 'Fix bike', frequency: 'once' }) });
    expect(await fetch(`${base}/beacon-collection/test_completions?since=${since}&once_chores`).then((r) => r.json())).toHaveLength(2);
    expect(await fetch(`${base}/beacon-collection/test_completions`).then((r) => r.json())).toHaveLength(2);
  });

  // A save cut off mid-upload (power or Wi-Fi lost) was taken as an empty
  // body and replaced the stored data with {}.
  it('keeps stored data when a save is cut off or empty', async () => {
    const put = (body?: string) => fetch(`${base}/beacon-data/test_settings`, { method: 'PUT', body });
    expect((await put('{"theme":"dark"}')).status).toBe(200);

    await new Promise<void>((resolve) => {
      const port = Number(new URL(base).port);
      const socket = connect(port, '127.0.0.1', () => {
        socket.write('PUT /beacon-data/test_settings HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"the');
        setTimeout(() => { socket.destroy(); resolve(); }, 100);
      });
    });
    await new Promise((r) => setTimeout(r, 200));

    expect((await put()).status).toBe(400);
    expect(await fetch(`${base}/beacon-data/test_settings`).then((r) => r.json())).toEqual({ theme: 'dark' });
  });

  describe('voice to-do commands', () => {
    const say = (text: string) => fetch(`${base}/beacon-action/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then((r) => r.json());
    const serviceCalls = (service: string) => haCalls.filter((c) => c.startsWith(`POST /api/services/todo/${service}`));

    // They asked HA for a response that adding an item doesn't give, and
    // HA answers that with a 400: every to-do voice command failed.
    it('adds an item to the named list', async () => {
      expect(await say('add eggs to the grocery list')).toMatchObject({ success: true, entity_id: 'todo.grocery' });
      expect(serviceCalls('add_item')).toEqual(['POST /api/services/todo/add_item {"item":"eggs","entity_id":"todo.grocery"}']);
    });

    // "Complete milk" names no list, and was sent to HA without one.
    it('completes an item on whichever list has it', async () => {
      expect(await say('complete milk')).toMatchObject({ success: true, entity_id: 'todo.grocery' });
      expect(serviceCalls('update_item')).toEqual(['POST /api/services/todo/update_item {"item":"g1","status":"completed","entity_id":"todo.grocery"}']);
    });

    it('says when there is no such list or item', async () => {
      expect(await say('add eggs to the camping list')).toMatchObject({ success: false, response: "I couldn't find a list called camping list." });
      expect(await say('complete kale')).toMatchObject({ success: false, response: "I couldn't find kale on any list." });
    });
  });

  // Nothing uses a WebSocket to the add-on; the proxy that answered these
  // could hang, or crash the add-on when a client reset mid-upgrade.
  it('refuses WebSocket upgrades, and survives a client resetting one', async () => {
    await new Promise<void>((resolve) => {
      const socket = connect(Number(new URL(base).port), '127.0.0.1', () => {
        socket.write('GET /api/websocket HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
        socket.resetAndDestroy();
        setTimeout(resolve, 200);
      });
      socket.on('error', () => {});
    });

    const answer = await new Promise<string>((resolve) => {
      const socket = connect(Number(new URL(base).port), '127.0.0.1', () => {
        socket.write('GET /api/websocket HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n'
          + 'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
      });
      let data = '';
      socket.on('data', (c) => { data += c; });
      socket.on('close', () => resolve(data));
      setTimeout(() => { socket.destroy(); resolve(data || 'no answer'); }, 2000);
    });
    expect(answer.split('\r\n')[0]).toBe('HTTP/1.1 404 Not Found');
  });

  // A failed read counted as "no data yet", so the next write replaced the
  // whole file: one new chore wiped every other, one setting every other.
  it("doesn't write over a stored file it can't read", async () => {
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, 'data', 'test_broken.json'), '[{"id":"a"},');
    writeFileSync(join(dir, 'data', 'test_broken_settings.json'), '{"theme":');

    const add = await fetch(`${base}/beacon-collection/test_broken`, { method: 'POST', body: '{"name":"new"}' });
    const merge = await fetch(`${base}/beacon-data/test_broken_settings?merge`, { method: 'PUT', body: '{"theme":"dark"}' });

    expect([add.status, merge.status]).toEqual([500, 500]);
    expect(readFileSync(join(dir, 'data', 'test_broken.json'), 'utf8')).toBe('[{"id":"a"},');
    expect(readFileSync(join(dir, 'data', 'test_broken_settings.json'), 'utf8')).toBe('{"theme":');
  });
});
