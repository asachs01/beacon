import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

interface Running {
  child: ChildProcess;
  port: number;
  code: string;
  output: string;
  logs: { text: string };
  dataDir: string;
}

async function startDummyHa(): Promise<{ url: string; paths: string[]; close: () => Promise<void> }> {
  const paths: string[] = [];
  const server = http.createServer((req, res) => {
    paths.push(req.url || '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ dummy: true }));
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', () => { /* hold the connection open */ });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('dummy HA has no port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    paths,
    close: () => new Promise((resolve, reject) => {
      wss.close();
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

async function startBeacon(env: Record<string, string>): Promise<Running> {
  const dir = await mkdtemp(join(tmpdir(), 'beacon-http-'));
  const dataDir = join(dir, 'data');
  const dist = join(dir, 'dist');
  await mkdir(dataDir, { recursive: true });
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>Beacon</title>');
  await writeFile(join(dist, 'favicon.svg'), '<svg id="beacon-icon"></svg>');
  await writeFile(join(dist, 'manifest.json'), '{"name":"Beacon"}');
  await writeFile(join(dist, 'runtime-config.js'), 'window.__BEACON_RUNTIME__=1');
  await writeFile(join(dist, 'sw.js'), '/* beacon-sw */');
  await writeFile(join(dist, 'assets', 'index.js'), '/* beacon-asset */');
  await writeFile(join(dist, 'assets', 'inter.woff2'), 'woff2');
  await writeFile(join(dataDir, 'beacon_family_members.json'), JSON.stringify([
    { name: 'Ada', pin: '1234' },
  ]));
  await cp(join(root, 'server.js'), join(dir, 'server.js'));
  await cp(join(root, 'lib'), join(dir, 'lib'), { recursive: true });

  const child = spawn(process.execPath, ['server.js'], {
    cwd: dir,
    env: {
      ...process.env,
      BEACON_SECRETS_PATH: join(dir, 'missing-parent', 'secrets.yaml'),
      ...env,
      BEACON_DATA: dataDir,
      BEACON_DIST: dist,
      BEACON_PORT: '0',
      BEACON_DISABLE_JOBS: '1',
      NODE_PATH: join(root, 'node_modules'),
    },
  });

  const logs = { text: '' };
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not listen\n${logs.text}`)), 8000);
    const onData = (chunk: Buffer) => {
      logs.text += chunk.toString('utf8');
      const match = /Beacon server listening on port (\d+)/.exec(logs.text);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}\n${logs.text}`));
    });
  });

  const codeMatch = /Beacon pairing code: (\d{6})/.exec(logs.text);
  if (!codeMatch) throw new Error(`pairing code missing\n${logs.text}`);
  return { child, port, code: codeMatch[1], output: '', logs, dataDir };
}

async function stop(child: ChildProcess) {
  if (child.killed || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 2000);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const FORGED_INGRESS = {
  'X-Ingress-Path': '/api/hassio_ingress/not-a-real-token',
  'X-Forwarded-For': '172.30.32.2',
  'X-Hass-Source': 'core',
};

describe('device pairing on the Beacon server', () => {
  const children: ChildProcess[] = [];
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
    await Promise.all(children.splice(0).map((child) => stop(child)));
  });

  async function boot() {
    const ha = await startDummyHa();
    closers.push(ha.close);
    const beacon = await startBeacon({
      SUPERVISOR_TOKEN: 'supervisor-token',
      HA_BROWSER_TOKEN: 'browser-token-do-not-publish',
      HA_API_BASE_OVERRIDE: ha.url,
      HA_WS_URL_OVERRIDE: ha.url.replace(/^http/, 'ws') + '/api/websocket',
    });
    children.push(beacon.child);
    return { ...beacon, haPaths: ha.paths };
  }

  it('requires a session for protected routes and ignores a forged ingress header', async () => {
    const beacon = await boot();
    expect(beacon.logs.text).toContain('HA_BROWSER_TOKEN is no longer used and is ignored; the browser now goes through Beacon\'s server');

    const base = `http://127.0.0.1:${beacon.port}`;
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const home = await fetch(`${base}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('Beacon');

    const session = await fetch(`${base}/beacon-auth/session`);
    expect(await session.json()).toEqual({ paired: false, ingress: false });

    const protectedPaths = [
      '/api/states',
      '/api/services/conversation/process',
      '/api/conversation/process',
      '/api/media_source/browse_media',
      '/beacon-data/beacon_settings',
      '/beacon-data/beacon_family_members',
      '/beacon-data/beacon_chores',
      '/beacon-data/beacon_meal_plans',
      '/beacon-data/beacon_streaks',
      '/beacon-data/beacon_completions',
      '/beacon-action/voice',
      '/beacon-action/service',
      '/beacon-action/media-upload',
      '/beacon-action/media-browse',
      '/beacon-action/media-remove',
      '/beacon-action/complete-chore',
      '/beacon-action/chores-left',
      '/beacon-action/chore-events',
      '/beacon-action/calendar-event',
      '/beacon-api/google-photos',
      '/beacon-api/google-photos/photos',
      '/beacon-api/google-photos/file/abc/one.jpg',
      '/beacon-auth/devices',
      '/beacon-auth/pairing-code',
      '/beacon-auth/pairing-code/rotate',
      '/beacon-auth/access-tokens',
      '/v1/admin',
      '/beacon-export',
      '/.env',
    ];
    for (const path of protectedPaths) {
      const res = await fetch(`${base}${path}`, { headers: FORGED_INGRESS });
      expect(res.status, path).toBe(401);
      expect(await res.json(), path).toEqual({ error: 'pairing_required' });
    }

    const upgrade = await new Promise<string>((resolve, reject) => {
      const request = http.request({
        hostname: '127.0.0.1',
        port: beacon.port,
        path: '/api/websocket',
        headers: { Connection: 'Upgrade', Upgrade: 'websocket', ...FORGED_INGRESS },
      });
      request.on('upgrade', () => reject(new Error('unpaired websocket was accepted')));
      request.on('response', (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(`${res.statusCode} ${Buffer.concat(chunks).toString('utf8')}`));
      });
      request.on('error', reject);
      request.end();
    });
    expect(upgrade).toContain('401');
    expect(upgrade).toContain('pairing_required');

    const bridge = await new Promise<string>((resolve, reject) => {
      const request = http.request({
        hostname: '127.0.0.1',
        port: beacon.port,
        path: '/beacon-ws/ha',
        headers: { Connection: 'Upgrade', Upgrade: 'websocket', ...FORGED_INGRESS },
      });
      request.on('upgrade', () => reject(new Error('unpaired sensor socket was accepted')));
      request.on('response', (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(`${res.statusCode} ${Buffer.concat(chunks).toString('utf8')}`));
      });
      request.on('error', reject);
      request.end();
    });
    expect(bridge).toContain('pairing_required');
  });

  it('pairs with a family PIN or the pairing code, then revokes the open socket', async () => {
    const beacon = await boot();
    const base = `http://127.0.0.1:${beacon.port}`;

    const wrong = await fetch(`${base}/beacon-auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: '999999', label: 'Intruder' }),
    });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'pairing_failed' });
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const paired = await fetch(`${base}/beacon-auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ secret: '12-34', label: 'Kitchen tablet' }),
    });
    expect(paired.status).toBe(200);
    const body = await paired.json() as { token: string; device: { id: string; label: string } };
    expect(body.device.label).toBe('Kitchen tablet');
    const cookies = paired.headers.getSetCookie?.() ?? [paired.headers.get('set-cookie') || ''];
    const setCookie = cookies.find((value) => value.includes('beacon_session=')) || '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('beacon_session=');
    const attemptCookie = cookies.find((value) => value.includes('beacon_pair_attempt=')) || '';
    expect(attemptCookie).toContain('beacon_pair_attempt=');
    expect(attemptCookie).not.toContain('HttpOnly');
    expect(attemptCookie).toContain('SameSite=Lax');
    const sessions = await readFile(join(beacon.dataDir, 'device-sessions.json'), 'utf8');
    expect(sessions).not.toContain(body.token);

    const authed = await fetch(`${base}/api/states`, {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(authed.status).toBe(200);
    const withSessionQuery = await fetch(`${base}/api/states?session=${encodeURIComponent(body.token)}`, {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(withSessionQuery.status).toBe(200);
    expect(beacon.haPaths.some((path) => path.includes(body.token))).toBe(false);

    const byCookie = await fetch(`${base}/beacon-auth/devices`, {
      headers: { cookie: setCookie.split(';')[0] },
    });
    expect(byCookie.status).toBe(200);
    const devices = await byCookie.json() as { pairingCode: string; devices: Array<{ id: string; current: boolean }> };
    expect(devices.pairingCode).toBe(beacon.code);
    expect(devices.devices.some((device) => device.current)).toBe(true);

    const ws = new WebSocket(`ws://127.0.0.1:${beacon.port}/beacon-ws/ha?session=${encodeURIComponent(body.token)}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const closed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`revoked websocket stayed open ready=${ws.readyState}`)), 2000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      if (ws.readyState === WebSocket.CLOSED) {
        done();
        return;
      }
      ws.once('close', done);
      ws.once('error', () => { /* close follows */ });
    });
    const revoked = await fetch(`${base}/beacon-auth/devices/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${body.token}`,
      },
      body: JSON.stringify({ id: body.device.id }),
    });
    expect(revoked.status).toBe(200);
    await closed;

    const after = await fetch(`${base}/api/states`, {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(after.status).toBe(401);
    expect(await after.json()).toEqual({ error: 'pairing_required' });

    const byCode = await fetch(`${base}/beacon-auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: beacon.code, label: 'Hall' }),
    });
    expect(byCode.status).toBe(200);
  });

  it('creates, lists, and revokes an access token accepted on /beacon-action', async () => {
    const beacon = await boot();
    const base = `http://127.0.0.1:${beacon.port}`;
    const paired = await fetch(`${base}/beacon-auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: '1234', label: 'Kitchen tablet' }),
    });
    const session = await paired.json() as { token: string };
    expect(paired.status).toBe(200);

    const anonymous = await fetch(`${base}/beacon-auth/access-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'should fail' }),
    });
    expect(anonymous.status).toBe(401);

    const created = await fetch(`${base}/beacon-auth/access-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ label: 'Home Assistant automations' }),
    });
    expect(created.status).toBe(200);
    const createdCookies = created.headers.getSetCookie?.() ?? [created.headers.get('set-cookie') || ''];
    expect(createdCookies.join('\n')).not.toContain('beacon_session=');
    const tokenBody = await created.json() as { token: string; device: { id: string; label: string; kind: string } };
    expect(tokenBody.device).toMatchObject({ label: 'Home Assistant automations', kind: 'token' });
    expect(beacon.logs.text).not.toContain(tokenBody.token);
    const stored = await readFile(join(beacon.dataDir, 'device-sessions.json'), 'utf8');
    expect(stored).not.toContain(tokenBody.token);
    expect(stored).toContain('"kind":"token"');

    const listed = await fetch(`${base}/beacon-auth/devices`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const devices = await listed.json() as { devices: Array<{ id: string; kind: string; label: string }> };
    expect(devices.devices).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: tokenBody.device.id, kind: 'token', label: 'Home Assistant automations' }),
    ]));

    const actionPaths = [
      '/beacon-action/voice',
      '/beacon-action/complete-chore',
      '/beacon-action/chores-left',
      '/beacon-action/chore-events',
      '/beacon-action/calendar-event',
    ];
    for (const path of actionPaths) {
      const res = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${tokenBody.token}` },
      });
      expect(res.status, path).not.toBe(401);
    }

    const forgedCore = {
      'X-Forwarded-For': '172.30.32.1',
      'X-Real-IP': '::ffff:172.30.32.1',
      'X-Hass-Source': 'core',
      'X-Ingress-Path': '/api/hassio_ingress/not-a-real-token',
    };
    for (const path of ['/beacon-action/chores-left', '/api/states', '/beacon-data/beacon_settings', '/beacon-auth/devices']) {
      const res = await fetch(`${base}${path}`, { headers: forgedCore });
      expect(res.status, path).toBe(401);
      expect(await res.json(), path).toEqual({ error: 'pairing_required' });
    }

    const revoked = await fetch(`${base}/beacon-auth/devices/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ id: tokenBody.device.id }),
    });
    expect(revoked.status).toBe(200);
    const after = await fetch(`${base}/beacon-action/chores-left`, {
      headers: { Authorization: `Bearer ${tokenBody.token}` },
    });
    expect(after.status).toBe(401);
    expect(await after.json()).toEqual({ error: 'pairing_required' });
  });

  it('mints beacon_token once for the add-on and does not log the token', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'beacon-ha-secrets-'));
    const secretsPath = join(dir, 'secrets.yaml');
    await writeFile(secretsPath, 'other_secret: keep\n');
    const ha = await startDummyHa();
    closers.push(ha.close);
    const beacon = await startBeacon({
      SUPERVISOR_TOKEN: 'supervisor-token',
      HA_API_BASE_OVERRIDE: ha.url,
      HA_WS_URL_OVERRIDE: ha.url.replace(/^http/, 'ws') + '/api/websocket',
      BEACON_SECRETS_PATH: secretsPath,
    });
    children.push(beacon.child);
    expect(beacon.logs.text).toContain('added beacon_token to secrets.yaml');
    const written = await readFile(secretsPath, 'utf8');
    expect(written.startsWith('other_secret: keep\n')).toBe(true);
    const match = /beacon_token: "Bearer ([^"]+)"/.exec(written);
    expect(match?.[1]).toBeTruthy();
    expect(beacon.logs.text).not.toContain(match?.[1]);
    const stored = await readFile(join(beacon.dataDir, 'device-sessions.json'), 'utf8');
    expect(stored).not.toContain(match?.[1]);
    expect(stored).toContain('Home Assistant automations (installer)');

    beacon.child.kill('SIGTERM');
    await new Promise((resolve) => beacon.child.once('exit', resolve));
    const again = await startBeacon({
      SUPERVISOR_TOKEN: 'supervisor-token',
      HA_API_BASE_OVERRIDE: ha.url,
      HA_WS_URL_OVERRIDE: ha.url.replace(/^http/, 'ws') + '/api/websocket',
      BEACON_SECRETS_PATH: secretsPath,
      BEACON_DATA: beacon.dataDir,
    });
    children.push(again.child);
    expect(again.logs.text).not.toContain('added beacon_token to secrets.yaml');
    expect(await readFile(secretsPath, 'utf8')).toBe(written);
  });

  it('never treats 172.30.32.1 as trusted in standalone mode', async () => {
    const ha = await startDummyHa();
    closers.push(ha.close);
    const beacon = await startBeacon({
      SUPERVISOR_TOKEN: '',
      HA_URL: ha.url,
      HA_TOKEN: 'long-lived-token',
    });
    children.push(beacon.child);
    const base = `http://127.0.0.1:${beacon.port}`;
    const res = await fetch(`${base}/beacon-action/chores-left`, {
      headers: {
        'X-Forwarded-For': '172.30.32.1',
        'X-Real-IP': '172.30.32.1',
      },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'pairing_required' });
    expect(beacon.logs.text).toContain('Mode: standalone');
  });

  it('serves the pairing shell without a session and accepts a bearer token on an unknown path', async () => {
    const beacon = await boot();
    const base = `http://127.0.0.1:${beacon.port}`;
    const publicPaths = [
      ['/', 'Beacon'],
      ['/index.html', 'Beacon'],
      ['/favicon.svg', 'beacon-icon'],
      ['/manifest.json', 'Beacon'],
      ['/runtime-config.js', '__BEACON_RUNTIME__'],
      ['/assets/index.js', 'beacon-asset'],
      ['/assets/inter.woff2', 'woff2'],
      ['/sw.js', 'beacon-sw'],
    ];
    for (const [path, body] of publicPaths) {
      const res = await fetch(`${base}${path}`);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).toContain(body);
    }
    const pair = await fetch(`${base}/beacon-auth/pair`);
    expect(pair.status).toBe(405);

    const unknown = await fetch(`${base}/v1/admin`, { headers: FORGED_INGRESS });
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({ error: 'pairing_required' });

    const paired = await fetch(`${base}/beacon-auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: beacon.code, label: 'Kitchen tablet' }),
    });
    expect(paired.status).toBe(200);
    const session = await paired.json() as { token: string };
    const authed = await fetch(`${base}/v1/admin`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(authed.status).toBe(200);
    expect(await authed.text()).toContain('Beacon');
  });

  it('rotates the pairing code for a signed-in caller and rejects the old code', async () => {
    const beacon = await boot();
    const base = `http://127.0.0.1:${beacon.port}`;

    const anonymous = await fetch(`${base}/beacon-auth/pairing-code/rotate`, { method: 'POST' });
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: 'pairing_required' });

    const paired = await fetch(`${base}/beacon-auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: beacon.code, label: 'Kitchen tablet' }),
    });
    expect(paired.status).toBe(200);
    const session = await paired.json() as { token: string; device: { id: string } };

    const created = await fetch(`${base}/beacon-auth/access-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ label: 'Home Assistant automations' }),
    });
    expect(created.status).toBe(200);
    const access = await created.json() as { token: string; device: { id: string } };

    const rotated = await fetch(`${base}/beacon-auth/pairing-code/rotate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(rotated.status).toBe(200);
    const rotatedBody = await rotated.json() as { pairingCode: string };
    expect(rotatedBody.pairingCode).toMatch(/^\d{6}$/);
    expect(rotatedBody.pairingCode).not.toBe(beacon.code);
    await expect.poll(() => beacon.logs.text).toContain('Beacon pairing code rotated');
    expect(beacon.logs.text).not.toContain(rotatedBody.pairingCode);

    const oldCode = await fetch(`${base}/beacon-auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: beacon.code, label: 'Old code' }),
    });
    expect(oldCode.status).toBe(401);
    expect(await oldCode.json()).toEqual({ error: 'pairing_failed' });

    const deviceStill = await fetch(`${base}/api/states`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(deviceStill.status).toBe(200);
    const tokenStill = await fetch(`${base}/beacon-action/chores-left`, {
      headers: { Authorization: `Bearer ${access.token}` },
    });
    expect(tokenStill.status).not.toBe(401);

    const listed = await fetch(`${base}/beacon-auth/devices`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const devices = await listed.json() as { pairingCode: string; devices: Array<{ id: string }> };
    expect(devices.pairingCode).toBe(rotatedBody.pairingCode);
    expect(devices.devices.map((device) => device.id)).toEqual(expect.arrayContaining([
      session.device.id,
      access.device.id,
    ]));

    const withNew = await fetch(`${base}/beacon-auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: rotatedBody.pairingCode, label: 'Hall' }),
    });
    expect(withNew.status).toBe(200);
  });
});
