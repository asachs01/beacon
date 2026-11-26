import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const beaconPort = 18765;

interface Hit { method: string; url: string }

let dataDir = '';
let runDir = '';
let ha: http.Server;
let haPort = 0;
let child: ChildProcess | null = null;
const hits: Hit[] = [];

function beaconRequest(method: string, requestPath: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: beaconPort,
      path: requestPath,
      method,
      headers: payload
        ? { 'content-type': 'application/json', 'content-length': payload.length }
        : {},
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: unknown = text;
        try { json = JSON.parse(text); } catch { /* keep text */ }
        resolve({ status: res.statusCode || 0, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function stopChild() {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
  if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL');
  child = null;
}

describe('Home Assistant proxy allowlist on the server', () => {
  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'beacon-proxy-'));
    await writeFile(path.join(dataDir, 'beacon-settings.json'), JSON.stringify({
      musicDefaultPlayer: 'media_player.living_room',
    }));
    await writeFile(path.join(dataDir, 'beacon-dashboard-layout.json'), JSON.stringify({
      version: 3,
      views: [{
        regions: {
          topbar: [],
          main: [],
          sidebar: [{ type: 'ha-toggle', config: { entity_ids: ['light.kitchen'] } }],
        },
      }],
    }));
    await writeFile(path.join(dataDir, 'beacon_family_members.json'), JSON.stringify([
      { privilegeEntityId: 'switch.ada_wifi' },
    ]));

    ha = http.createServer((req, res) => {
      hits.push({ method: req.method || '', url: req.url || '' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => ha.listen(0, '127.0.0.1', () => resolve()));
    const address = ha.address();
    if (!address || typeof address === 'string') throw new Error('mock Home Assistant did not bind');
    haPort = address.port;

    // The repo package.json marks .js files as ESM. The add-on image runs
    // server.js with no package.json, so it stays CommonJS. Match that here.
    runDir = await mkdtemp(path.join(tmpdir(), 'beacon-server-'));
    await cp(path.join(root, 'server.js'), path.join(runDir, 'server.js'));
    await cp(path.join(root, 'lib'), path.join(runDir, 'lib'), { recursive: true });

    child = spawn(process.execPath, ['server.js'], {
      cwd: runDir,
      env: {
        ...process.env,
        NODE_PATH: path.join(root, 'node_modules'),
        HA_URL: `http://127.0.0.1:${haPort}`,
        HA_TOKEN: 'test-token',
        SUPERVISOR_TOKEN: '',
        BEACON_DATA: dataDir,
        BEACON_PORT: String(beaconPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const log: Buffer[] = [];
    child.stdout?.on('data', (chunk) => log.push(chunk));
    child.stderr?.on('data', (chunk) => log.push(chunk));

    const started = await Promise.race([
      (async () => {
        while (!Buffer.concat(log).toString('utf8').includes('Beacon server listening')) {
          if (child?.exitCode != null) return false;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return true;
      })(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
    ]);
    if (!started) {
      throw new Error(`Beacon server did not start:\n${Buffer.concat(log).toString('utf8')}`);
    }
  }, 15000);

  afterAll(async () => {
    await stopChild();
    if (ha) await new Promise<void>((resolve) => ha.close(() => resolve()));
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    if (runDir) await rm(runDir, { recursive: true, force: true });
  });

  async function expectBlocked(method: string, requestPath: string, body?: unknown) {
    const before = hits.length;
    const response = await beaconRequest(method, requestPath, body);
    expect(response.status).toBe(403);
    expect(response.json).toEqual({
      error: 'not_allowed',
      detail: `${method} ${requestPath} is not allowed by Beacon`,
    });
    expect(hits.length).toBe(before);
  }

  it('forwards an allowlisted read and blocks everything else', async () => {
    await expectBlocked('POST', '/api/services/lock/unlock', { entity_id: 'lock.front_door' });
    await expectBlocked('POST', '/api/services/homeassistant/restart', {});
    await expectBlocked('POST', '/api/services/script/turn_on', { entity_id: 'script.goodnight' });
    await expectBlocked('POST', '/api/services/shell_command/reboot', {});
    await expectBlocked('POST', '/api/services/light/toggle', { entity_id: 'light.bedroom' });
    await expectBlocked('POST', '/api/states', { state: 'on' });
    await expectBlocked('POST', '/api/template', { template: '{{ states("light.kitchen") }}' });
    await expectBlocked('POST', '/api/config/core/check_config', {});
    await expectBlocked('POST', '/api/services/media_player/media_play', { entity_id: 'media_player.bedroom' });

    const states = await beaconRequest('GET', '/api/states');
    expect(states.status).toBe(200);
    expect(hits.at(-1)).toEqual({ method: 'GET', url: '/api/states' });

    const toggle = await beaconRequest('POST', '/api/services/light/toggle', { entity_id: 'light.kitchen' });
    expect(toggle.status).toBe(200);
    expect(hits.at(-1)).toEqual({ method: 'POST', url: '/api/services/light/toggle' });

    const player = await beaconRequest('POST', '/api/services/media_player/media_play', {
      entity_id: 'media_player.living_room',
    });
    expect(player.status).toBe(200);
    expect(hits.at(-1)?.url).toBe('/api/services/media_player/media_play');

    const blockedService = await beaconRequest('POST', '/beacon-action/service', {
      domain: 'lock',
      service: 'unlock',
      data: { entity_id: 'lock.front_door' },
    });
    expect(blockedService.status).toBe(403);
    expect(blockedService.json).toEqual({
      error: 'not_allowed',
      detail: 'POST /api/services/lock/unlock is not allowed by Beacon',
    });
    expect(hits.at(-1)?.url).toBe('/api/services/media_player/media_play');

    const allowedService = await beaconRequest('POST', '/beacon-action/service', {
      domain: 'todo',
      service: 'get_items',
      data: { entity_id: 'todo.grocery' },
      return_response: true,
    });
    expect(allowedService.status).toBe(200);
    expect(hits.at(-1)).toEqual({
      method: 'POST',
      url: '/api/services/todo/get_items?return_response',
    });
  });
});
