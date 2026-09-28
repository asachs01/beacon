// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
let parentCookie = '';
const browserPassword = 'long-test-browser-password-123';
const basicAuth = `Basic ${Buffer.from(`beacon:${browserPassword}`).toString('base64')}`;
const haToken = 'server-test-ha-token';

function fetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', basicAuth);
  if (parentCookie) headers.set('Cookie', parentCookie);
  return globalThis.fetch(input, { ...init, headers });
}

function withCookie(cookie: string, input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', basicAuth);
  headers.set('Cookie', cookie);
  return globalThis.fetch(input, { ...init, headers });
}

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
      if (req.headers.authorization !== `Bearer ${haToken}`) return json(401, { message: 'Unauthorized' });
      if (path === '/api/config') return json(200, { time_zone: 'Pacific/Auckland' });
      if (path === '/api/states') return json(200, states);
      if (path === '/api/services/switch/toggle') return json(200, []);
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
      HA_URL: haBase,
      HA_TOKEN: haToken,
      BEACON_PASSWORD: browserPassword,
      BEACON_PARENT_PIN: '654321',
      BEACON_ALLOWED_ENTITIES: 'todo.grocery,todo.chores,calendar.family,light.kitchen,switch.lamp',
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
  const login = await globalThis.fetch(`${base}/beacon-auth/parent`, {
    method: 'POST',
    headers: { Authorization: basicAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '654321' }),
  });
  if (!login.ok) throw new Error(`Parent login failed: ${login.status} ${await login.text()}`);
  parentCookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  if (!parentCookie) throw new Error('No parent session cookie');
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

  it('collapses concurrent collection adds that use the same id', async () => {
    const collection = 'test_idempotent_completions';
    const add = () => fetch(`${base}/beacon-collection/${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'same-round', chore_id: 'c1', member_id: 'kai' }),
    });
    const responses = await Promise.all([add(), add()]);
    expect(responses.every((response) => response.ok)).toBe(true);

    const items = await fetch(`${base}/beacon-collection/${collection}`).then((r) => r.json());
    expect(items).toEqual([{ id: 'same-round', chore_id: 'c1', member_id: 'kai' }]);
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
          + `Authorization: ${basicAuth}\r\n`
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

  it('reports a failed disk write as a server error rather than a bad request', async () => {
    mkdirSync(join(dir, 'data', 'test_write_error.json'));
    const response = await fetch(`${base}/beacon-data/test_write_error`, {
      method: 'PUT', body: '{"theme":"dark"}',
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });

  // Displays ask for these counts to notice changes made on another display.
  it('counts the writes to each stored file', async () => {
    const changes = () => fetch(`${base}/beacon-action/changes`).then((r) => r.json());
    const before = await changes();

    await fetch(`${base}/beacon-collection/test_counted`, { method: 'POST', body: '{"name":"a"}' });
    await fetch(`${base}/beacon-collection/test_counted`);
    await fetch(`${base}/beacon-data/test_counted_settings?merge`, { method: 'PUT', body: '{"theme":"dark"}' });
    await fetch(`${base}/beacon-data/test_counted_settings`, { method: 'PUT', body: '{"theme":"light"}' });

    const after = await changes();
    expect(after.boot).toBe(before.boot);
    expect(after.counts.test_counted).toBe((before.counts.test_counted ?? 0) + 1);
    expect(after.counts.test_counted_settings).toBe((before.counts.test_counted_settings ?? 0) + 2);
  });

  it("doesn't count a write that didn't happen", async () => {
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, 'data', 'test_uncounted.json'), '[{"id":"a"},');
    const changes = () => fetch(`${base}/beacon-action/changes`).then((r) => r.json());
    const before = await changes();

    await fetch(`${base}/beacon-collection/test_uncounted`, { method: 'POST', body: '{"name":"new"}' });
    await fetch(`${base}/beacon-collection/test_other/missing`, { method: 'PUT', body: '{"name":"x"}' });

    const after = await changes();
    expect(after.counts.test_uncounted).toBe(before.counts.test_uncounted);
    expect(after.counts.test_other).toBe(before.counts.test_other);
  });

  // Two first ticks at once (the app and the Google Tasks sync) each added
  // a streak under the member's id, leaving two records with one id.
  it('merges an added item into one with the same id', async () => {
    const add = (body: object) => fetch(`${base}/beacon-collection/test_streaks`, { method: 'POST', body: JSON.stringify(body) });
    await add({ id: 'kai', member_id: 'kai', current: 1 });
    await add({ id: 'kai', member_id: 'kai', current: 2 });
    expect(await fetch(`${base}/beacon-collection/test_streaks`).then((r) => r.json())).toEqual([{ id: 'kai', member_id: 'kai', current: 2 }]);
  });

  // /beacon-data and /beacon-collection share DATA_DIR/<key>.json. A non-array
  // written to a collection's key through /beacon-data would make every
  // collection read of it 500, so the data API refuses collection keys.
  it('refuses to write a collection key through /beacon-data', async () => {
    await fetch(`${base}/beacon-collection/beacon_family_members`, { method: 'POST', body: '{"id":"m1","name":"Alex"}' });

    const blocked = await fetch(`${base}/beacon-data/beacon_family_members`, { method: 'PUT', body: '{}' });
    expect(blocked.status).toBe(409);

    // The collection is untouched and still reads back as an array.
    const read = await fetch(`${base}/beacon-collection/beacon_family_members`);
    expect(read.status).toBe(200);
    expect(await read.json()).toContainEqual(expect.objectContaining({ id: 'm1', name: 'Alex', has_pin: false }));
  });

  it('rejects headerless and password-only HA actions; authorizes a scoped parent session', async () => {
    const body = JSON.stringify({ domain: 'switch', service: 'toggle', data: { entity_id: 'switch.lamp' } });
    const noPassword = await globalThis.fetch(`${base}/beacon-action/service`, { method: 'POST', body });
    expect(noPassword.status).toBe(401);
    const passwordOnly = await globalThis.fetch(`${base}/beacon-action/service`, {
      method: 'POST', headers: { Authorization: basicAuth }, body,
    });
    expect(passwordOnly.status).toBe(401);

    const allowed = await fetch(`${base}/beacon-action/service`, { method: 'POST', body });
    expect(allowed.status).toBe(200);
    const sessionCheck = await fetch(`${base}/beacon-auth/session`);
    expect(await sessionCheck.json()).toMatchObject({ role: 'parent' });
    expect(sessionCheck.headers.get('set-cookie')).toBeNull();
    expect(haCalls.some((call) => call.startsWith('POST /api/services/switch/toggle'))).toBe(true);
    const otherEntity = await fetch(`${base}/beacon-action/service`, {
      method: 'POST',
      body: JSON.stringify({ domain: 'switch', service: 'toggle', data: { entity_id: 'switch.other' } }),
    });
    expect(otherEntity.status).toBe(403);
    expect(haCalls.some((call) => call.includes('switch.other'))).toBe(false);
    const broadenedTarget = await fetch(`${base}/beacon-action/service`, {
      method: 'POST',
      body: JSON.stringify({ domain: 'switch', service: 'toggle',
        data: { entity_id: 'switch.lamp', area_id: 'entire_house' } }),
    });
    expect(broadenedTarget.status).toBe(403);
    expect(haCalls.some((call) => call.includes('entire_house'))).toBe(false);
  });

  it('filters HA discovery and blocks direct access to unlisted entities', async () => {
    const states = await fetch(`${base}/api/states`).then((res) => res.json());
    expect(states).toEqual([
      expect.objectContaining({ entity_id: 'todo.grocery' }),
      expect.objectContaining({ entity_id: 'todo.chores' }),
    ]);
    expect((await fetch(`${base}/api/states/todo.private`)).status).toBe(403);
    expect((await fetch(`${base}/api/services/todo/get_items?return_response`, {
      method: 'POST', body: JSON.stringify({ entity_id: 'todo.private' }),
    })).status).toBe(403);
    expect((await fetch(`${base}/beacon-action/calendar-event`, {
      method: 'POST', body: JSON.stringify({ op: 'delete', entity_id: 'calendar.private', uid: '1' }),
    })).status).toBe(403);
  });

  it('hashes member PINs on disk and never returns or exposes them in general DTOs', async () => {
    const created = await fetch(`${base}/beacon-collection/beacon_family_members`, {
      method: 'POST',
      body: JSON.stringify({ id: 'parent-pin', name: 'Pat', role: 'parent', pin: '123456' }),
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toEqual({ id: 'parent-pin', name: 'Pat', role: 'parent', has_pin: true });
    const raw = readFileSync(join(dir, 'data', 'beacon_family_members.json'), 'utf8');
    expect(raw).not.toContain('123456');
    expect(raw).toMatch(/"pin_hash":"[a-f0-9]{32}:[a-f0-9]{64}"/);
    const memberResponse = await fetch(`${base}/beacon-collection/beacon_family_members`);
    expect(memberResponse.headers.get('cache-control')).toBe('no-store');
    const members = await memberResponse.json();
    expect(members).toContainEqual(expect.objectContaining({ id: 'parent-pin', has_pin: true }));
    expect(JSON.stringify(members)).not.toContain('pin_hash');
    expect((await fetch(`${base}/beacon-data/beacon_family_members`)).status).toBe(409);

    const login = await globalThis.fetch(`${base}/beacon-auth/parent`, {
      method: 'POST', headers: { Authorization: basicAuth },
      body: JSON.stringify({ member_id: 'parent-pin', pin: '123456' }),
    });
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('HttpOnly');

    const removed = await fetch(`${base}/beacon-collection/beacon_family_members/parent-pin`, {
      method: 'PUT', body: JSON.stringify({ pin: '' }),
    });
    expect(await removed.json()).toMatchObject({ id: 'parent-pin', has_pin: false });
    expect(readFileSync(join(dir, 'data', 'beacon_family_members.json'), 'utf8')).not.toContain('pin_hash');
    const memberSession = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect((await withCookie(memberSession, `${base}/beacon-collection/beacon_family_members`)).status).toBe(401);
    expect((await globalThis.fetch(`${base}/beacon-auth/parent`, {
      method: 'POST', headers: { Authorization: basicAuth },
      body: JSON.stringify({ member_id: 'parent-pin', pin: '123456' }),
    })).status).toBe(401);
  });

  it('limits Kid Display to its own chores, routines and completions', async () => {
    await fetch(`${base}/beacon-collection/beacon_family_members`, {
      method: 'POST', body: JSON.stringify({ id: 'kid-pin', name: 'Kai', role: 'child', pin: '2468' }),
    });
    await fetch(`${base}/beacon-collection/beacon_chores`, {
      method: 'POST', body: JSON.stringify({ id: 'kid-chore', name: 'Feed pet', frequency: 'daily', assigned_to: ['kid-pin'] }),
    });
    await fetch(`${base}/beacon-collection/beacon_chores`, {
      method: 'POST', body: JSON.stringify({ id: 'other-chore', name: 'Other', assigned_to: ['someone-else'] }),
    });
    await fetch(`${base}/beacon-collection/beacon_routines`, {
      method: 'POST', body: JSON.stringify({ id: 'kid-routine', member_id: 'kid-pin', tasks: [{ id: 'tidy' }] }),
    });
    const noPin = await globalThis.fetch(`${base}/beacon-auth/session?display=kid-pin`, {
      headers: { Authorization: basicAuth },
    });
    expect(await noPin.json()).toMatchObject({ role: 'none', requiresPin: true });
    const unlock = await globalThis.fetch(`${base}/beacon-auth/child`, {
      method: 'POST', headers: { Authorization: basicAuth },
      body: JSON.stringify({ member_id: 'kid-pin', pin: '2468' }),
    });
    expect(unlock.status).toBe(200);
    const kidCookie = unlock.headers.get('set-cookie')?.split(';')[0];
    expect(kidCookie).toBeTruthy();
    const kid = (path: string, init?: RequestInit) => withCookie(kidCookie!, `${base}${path}`, init);
    expect((await kid('/beacon-action/service', {
      method: 'POST', body: JSON.stringify({ domain: 'switch', service: 'toggle', data: { entity_id: 'switch.lamp' } }),
    })).status).toBe(403);
    expect((await kid('/beacon-data/beacon-settings', { method: 'PUT', body: '{"theme":"dark"}' })).status).toBe(403);
    expect(await (await kid('/beacon-collection/beacon_chores')).json()).toEqual([
      expect.objectContaining({ id: 'kid-chore' }),
    ]);
    expect(await (await kid('/beacon-collection/beacon_family_members')).json()).toEqual([
      expect.objectContaining({ id: 'kid-pin', has_pin: true }),
    ]);
    const forged = await kid('/beacon-collection/beacon_completions', {
      method: 'POST', body: JSON.stringify({ chore_id: 'other-chore', member_id: 'kid-pin' }),
    });
    expect(forged.status).toBe(403);
    const otherMember = await kid('/beacon-collection/beacon_completions', {
      method: 'POST', body: JSON.stringify({ chore_id: 'kid-chore', member_id: 'someone-else' }),
    });
    expect(otherMember.status).toBe(403);
    const completion = await kid('/beacon-collection/beacon_completions', {
      method: 'POST', body: JSON.stringify({ chore_id: 'kid-chore', member_id: 'kid-pin', completed_at: '2000-01-01T00:00:00Z' }),
    });
    expect(completion.status).toBe(200);
    expect((await completion.json()).completed_at).not.toBe('2000-01-01T00:00:00Z');
    expect(await (await kid('/beacon-collection/beacon_streaks')).json()).toEqual([
      expect.objectContaining({ member_id: 'kid-pin', current: 1 }),
    ]);

    const rotated = await fetch(`${base}/beacon-collection/beacon_family_members/kid-pin`, {
      method: 'PUT', body: JSON.stringify({ pin: '8642' }),
    });
    expect(rotated.status).toBe(200);
    expect((await kid('/beacon-collection/beacon_chores')).status).toBe(401);
    expect((await globalThis.fetch(`${base}/beacon-auth/child`, {
      method: 'POST', headers: { Authorization: basicAuth },
      body: JSON.stringify({ member_id: 'kid-pin', pin: '2468' }),
    })).status).toBe(401);
    expect((await globalThis.fetch(`${base}/beacon-auth/child`, {
      method: 'POST', headers: { Authorization: basicAuth },
      body: JSON.stringify({ member_id: 'kid-pin', pin: '8642' }),
    })).status).toBe(200);
  });

  it('enforces the 512-key quota under concurrent first writes', async () => {
    const existing = readdirSync(join(dir, 'data')).filter((name) => name.endsWith('.json')).length;
    const results: Response[] = [];
    for (let start = 0; start < 520; start += 50) {
      const batch = await Promise.all(Array.from({ length: Math.min(50, 520 - start) }, (_, offset) =>
        fetch(`${base}/beacon-data/quota_${start + offset}`, { method: 'PUT', body: '{"saved":true}' })));
      results.push(...batch);
    }
    expect(results.filter((res) => res.ok)).toHaveLength(512 - existing);
    expect(results.filter((res) => res.status === 400)).toHaveLength(520 - (512 - existing));
    expect(readdirSync(join(dir, 'data')).filter((name) => name.endsWith('.json'))).toHaveLength(512);
  }, 30_000);

  it('reports HA availability via a local health probe, not just static HTML', async () => {
    const response = await globalThis.fetch(`${base}/beacon-action/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(haCalls.some((call) => call.startsWith('GET /api/config'))).toBe(true);
    expect((await fetch(`${base}/`)).headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect((await fetch(`${base}/`)).headers.get('x-frame-options')).toBe('DENY');
  });

  it('accepts add-on requests only from the actual HA ingress address, not forged headers', async () => {
    const port = await freePort();
    const ingressData = join(dir, 'ingress-data');
    mkdirSync(ingressData, { recursive: true });
    writeFileSync(join(ingressData, 'beacon_family_members.json'),
      JSON.stringify([{ id: 'legacy', name: 'Lee', role: 'parent', pin: '4455' }]));
    const addOn = spawn(process.execPath, [join(dir, 'server.cjs')], {
      env: {
        PATH: process.env.PATH,
        NODE_PATH: join(repo, 'node_modules'),
        BEACON_PORT: String(port),
        BEACON_DIST: join(dir, 'dist'),
        BEACON_DATA: ingressData,
        BEACON_PARENT_PIN: '654321',
        SUPERVISOR_TOKEN: haToken,
        BEACON_ALLOWED_ENTITIES: 'switch.lamp',
      },
    });
    let startup = '';
    addOn.stdout!.on('data', (chunk) => { startup += chunk; });
    addOn.stderr!.on('data', (chunk) => { startup += chunk; });
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Add-on failed to start: ${startup}`)), 10_000);
        addOn.stdout!.on('data', () => {
          if (startup.includes('listening on port')) {
            clearTimeout(timeout);
            resolve();
          }
        });
        addOn.once('exit', (code) => reject(new Error(`Add-on exited (${code}): ${startup}`)));
      });
      let migrated = '';
      for (let attempt = 0; attempt < 50; attempt++) {
        migrated = readFileSync(join(ingressData, 'beacon_family_members.json'), 'utf8');
        if (migrated.includes('"pin_hash"')) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
      expect(migrated).not.toContain('4455');
      expect(migrated).toMatch(/"pin_hash":"[a-f0-9]{32}:[a-f0-9]{64}"/);
      const spoofed = {
        'X-Remote-User-ID': 'admin',
        'X-Ingress-Path': '/api/hassio_ingress/fake-session',
        'X-Forwarded-For': '172.30.32.2',
        'Sec-Fetch-Site': 'same-origin',
      };
      const direct = await globalThis.fetch(`http://127.0.0.1:${port}/beacon-action/service`, {
        method: 'POST',
        headers: spoofed,
        body: JSON.stringify({ domain: 'switch', service: 'toggle', data: { entity_id: 'switch.lamp' } }),
      });
      expect(direct.status).toBe(403);
      expect((await globalThis.fetch(`http://127.0.0.1:${port}/`, { headers: spoofed })).status).toBe(403);
    } finally {
      if (addOn.exitCode === null && addOn.signalCode === null) {
        await new Promise<void>((resolve) => { addOn.once('exit', () => resolve()); addOn.kill(); });
      }
    }
  });
});
