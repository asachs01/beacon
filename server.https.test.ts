// @vitest-environment node
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { expect, it } from 'vitest';

const repo = fileURLToPath(new URL('.', import.meta.url));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = createNetServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      if (!address || typeof address === 'string') return reject(new Error('No local port'));
      socket.close(() => resolve(address.port));
    });
  });
}

it('proxies REST and WebSocket to an HTTPS Home Assistant without sending its token to browsers', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'family-https-'));
  const certificate = join(temp, 'cert.pem');
  const privateKey = join(temp, 'key.pem');
  const opensslConfig = join(temp, 'openssl.cnf');
  writeFileSync(opensslConfig, [
    '[req]', 'distinguished_name=subject', 'x509_extensions=server', 'prompt=no',
    '[subject]', 'CN=127.0.0.1', '[server]', 'basicConstraints=CA:TRUE',
    'keyUsage=digitalSignature,keyEncipherment,keyCertSign', 'subjectAltName=IP:127.0.0.1',
  ].join('\n'));
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', privateKey, '-out', certificate, '-config', opensslConfig,
  ], { stdio: 'ignore' });
  let child: ChildProcess | undefined;
  let fakeHa: HttpsServer | undefined;
  let websocket: WebSocketServer | undefined;
  const calls: string[] = [];

  try {
    fakeHa = createHttpsServer({
      key: readFileSync(privateKey), cert: readFileSync(certificate),
    }, (req, res) => {
      calls.push(`${req.method} ${req.url} ${req.headers.authorization}`);
      const authenticated = req.headers.authorization === 'Bearer https-test-ha-token';
      const allowed = req.url === '/api/config' || req.url === '/api/services/switch/toggle';
      res.writeHead(authenticated && allowed ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(authenticated && allowed ? { time_zone: 'UTC' } : { error: 'Unauthorized' }));
    });
    websocket = new WebSocketServer({ server: fakeHa, path: '/api/websocket' });
    websocket.on('connection', (socket) => {
      socket.send(JSON.stringify({ type: 'auth_required' }));
      socket.on('message', (raw) => {
        const data = JSON.parse(raw.toString()) as { type: string; access_token?: string; id?: number };
        if (data.type === 'auth') {
          calls.push(`WS AUTH ${data.access_token}`);
          socket.send(JSON.stringify({ type: data.access_token === 'https-test-ha-token' ? 'auth_ok' : 'auth_invalid' }));
        } else if (data.type === 'calendar/event/create') {
          calls.push('WS calendar/event/create');
          socket.send(JSON.stringify({ type: 'result', id: data.id, success: true, result: { uid: 'new-event' } }));
        }
      });
    });
    await new Promise<void>((resolve) => fakeHa!.listen(0, '127.0.0.1', resolve));
    const haAddress = fakeHa.address();
    if (!haAddress || typeof haAddress === 'string') throw new Error('HTTPS mock did not listen');
    const port = await freePort();
    copyFileSync(join(repo, 'server.js'), join(temp, 'server.cjs'));
    copyFileSync(join(repo, 'server-guards.cjs'), join(temp, 'server-guards.cjs'));
    copyFileSync(join(repo, 'chores-sync.cjs'), join(temp, 'chores-sync.cjs'));
    mkdirSync(join(temp, 'dist'));
    writeFileSync(join(temp, 'dist', 'index.html'), '<!doctype html><div id="root"></div>');
    let output = '';
    child = spawn(process.execPath, [join(temp, 'server.cjs')], {
      env: {
        PATH: process.env.PATH,
        NODE_EXTRA_CA_CERTS: certificate,
        NODE_PATH: join(repo, 'node_modules'),
        BEACON_PORT: String(port),
        BEACON_DIST: join(temp, 'dist'),
        BEACON_DATA: join(temp, 'data'),
        BEACON_PASSWORD: 'https-browser-password-123',
        BEACON_PARENT_PIN: '654321',
        BEACON_ALLOWED_ENTITIES: 'switch.lamp,calendar.family',
        HA_URL: `https://127.0.0.1:${haAddress.port}`,
        HA_TOKEN: 'https-test-ha-token',
      },
    });
    child.stdout!.on('data', (chunk) => { output += chunk; });
    child.stderr!.on('data', (chunk) => { output += chunk; });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Family failed to start: ${output}`)), 10_000);
      child!.stdout!.on('data', () => {
        if (output.includes('listening on port')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child!.once('exit', (code) => reject(new Error(`Family exited (${code}): ${output}`)));
    });

    const base = `http://127.0.0.1:${port}`;
    const basic = `Basic ${Buffer.from('beacon:https-browser-password-123').toString('base64')}`;
    const login = await fetch(`${base}/beacon-auth/parent`, {
      method: 'POST', headers: { Authorization: basic },
      body: JSON.stringify({ pin: '654321' }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    const headers = { Authorization: basic, Cookie: cookie };
    expect((await fetch(`${base}/beacon-action/health`)).status).toBe(200);
    const service = await fetch(`${base}/beacon-action/service`, {
      method: 'POST', headers,
      body: JSON.stringify({ domain: 'switch', service: 'toggle', data: { entity_id: 'switch.lamp' } }),
    });
    expect(service.status).toBe(200);
    const calendar = await fetch(`${base}/beacon-action/calendar-event`, {
      method: 'POST', headers,
      body: JSON.stringify({ op: 'create', entity_id: 'calendar.family', event: { summary: 'Test' } }),
    });
    expect(calendar.status).toBe(200);
    expect(calls).toContain('WS AUTH https-test-ha-token');
    expect(calls).toContain('WS calendar/event/create');
    expect(calls.some((call) => call.startsWith('POST /api/services/switch/toggle Bearer https-test-ha-token'))).toBe(true);
    expect(output).not.toContain('https-test-ha-token');
  } finally {
    if (child && child.exitCode === null) {
      await new Promise<void>((resolve) => { child!.once('exit', () => resolve()); child!.kill(); });
    }
    if (websocket) await new Promise<void>((resolve) => websocket!.close(() => resolve()));
    if (fakeHa) await new Promise<void>((resolve) => fakeHa!.close(() => resolve()));
    rmSync(temp, { recursive: true, force: true });
  }
}, 20_000);
