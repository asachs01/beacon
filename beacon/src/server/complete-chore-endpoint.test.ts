import http from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleCompleteChore } from '../../lib/complete-chore.cjs';

const NOW = new Date('2026-07-04T15:00:00Z');

interface SideEffect {
  events: Array<{ event: string; data: Record<string, unknown> }>;
  decisions: Array<{ entityId: string; service: string }>;
}

function seed() {
  return {
    members: [
      { id: 'ada', name: 'Ada', role: 'child', privilegeEntityId: 'switch.ada_wifi' },
      { id: 'ben', name: 'Ben', role: 'child', privilegeEntityId: 'switch.ben_wifi' },
    ],
    chores: [
      { id: 'dishes', name: 'Dishes', assigned_to: ['ada', 'ben'], frequency: 'daily', value_cents: 100 },
      { id: 'vacuum', name: 'Vacuum', assigned_to: ['ada'], frequency: 'daily', value_cents: 50 },
    ],
    completions: [],
    streaks: [],
  };
}

async function writeSeed(dataDir: string, data = seed()) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'beacon_family_members.json'), JSON.stringify(data.members));
  await writeFile(join(dataDir, 'beacon_chores.json'), JSON.stringify(data.chores));
  await writeFile(join(dataDir, 'beacon_completions.json'), JSON.stringify(data.completions));
  await writeFile(join(dataDir, 'beacon_streaks.json'), JSON.stringify(data.streaks));
}

async function start(dataDir: string, side: SideEffect) {
  const server = http.createServer((req, res) => {
    const url = req.url || '';
    if (url.split('?')[0] === '/beacon-action/complete-chore') {
      handleCompleteChore(req, res, {
        dataDir,
        now: () => NOW,
        timeZone: 'UTC',
        publishEvents: async (events: SideEffect['events']) => {
          side.events.push(...events);
        },
        applyPrivileges: async (decisions: SideEffect['decisions']) => {
          side.decisions.push(...decisions);
        },
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return { server, port: address.port };
}

async function post(port: number, body: unknown, method = 'POST') {
  const res = await fetch(`http://127.0.0.1:${port}/beacon-action/complete-chore`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

describe('POST /beacon-action/complete-chore', () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    })));
  });

  it('completes a unique chore, stores it, and fires the privilege path', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-chore-'));
    await writeSeed(dataDir);
    const side: SideEffect = { events: [], decisions: [] };
    const started = await start(dataDir, side);
    servers.push(started.server);

    const res = await post(started.port, { chore: 'vacuum' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      success: true,
      ambiguous: false,
      action: 'complete_chore',
      response: 'Marked Vacuum as done for Ada.',
      chore_id: 'vacuum',
      member_id: 'ada',
    });
    expect(side.events.map((event) => event.event)).toEqual(['beacon_chore_completed']);
    expect(side.events[0].data).toMatchObject({
      member_id: 'ada',
      member_name: 'Ada',
      chore_id: 'vacuum',
      chore_title: 'Vacuum',
      completed: true,
      local_date: '2026-07-04',
    });
    expect(side.decisions).toEqual([
      expect.objectContaining({ entityId: 'switch.ada_wifi', service: 'turn_off' }),
    ]);

    const rest = await post(started.port, { chore: 'dishes', name: 'Ada' });
    expect(rest.json.success).toBe(true);
    expect(side.events.map((event) => event.event)).toEqual([
      'beacon_chore_completed',
      'beacon_chore_completed',
      'beacon_all_chores_done',
    ]);
    expect(side.decisions.at(-1)).toMatchObject({ entityId: 'switch.ada_wifi', service: 'turn_on' });

    const saved = JSON.parse(await readFile(join(dataDir, 'beacon_completions.json'), 'utf8'));
    expect(saved).toEqual([
      expect.objectContaining({ chore_id: 'vacuum', member_id: 'ada' }),
      expect.objectContaining({ chore_id: 'dishes', member_id: 'ada' }),
    ]);
  });

  it('asks which person and does not write when the title is shared', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-chore-'));
    await writeSeed(dataDir);
    const side: SideEffect = { events: [], decisions: [] };
    const started = await start(dataDir, side);
    servers.push(started.server);

    const res = await post(started.port, { chore: 'dishes' });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(false);
    expect(res.json.ambiguous).toBe(true);
    expect(res.json.response).toBe('Dishes is assigned to Ada and Ben. Who finished it?');
    expect(side.events).toEqual([]);
    const saved = JSON.parse(await readFile(join(dataDir, 'beacon_completions.json'), 'utf8'));
    expect(saved).toEqual([]);

    const named = await post(started.port, { chore: 'dishes', name: 'Ben' });
    expect(named.json).toMatchObject({ success: true, member_id: 'ben', chore_id: 'dishes' });
    expect(side.decisions.at(-1)).toMatchObject({ entityId: 'switch.ben_wifi', service: 'turn_on' });
  });

  it('leaves a family PIN hash in place when a chore is completed', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-chore-'));
    const pinHash = 'scrypt$16384$8$1$c2FsdHNhbHRzYWx0c2E=$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGE=';
    const data = seed();
    data.members[0] = { ...data.members[0], pinHash, color: '#112233' } as typeof data.members[0];
    await writeSeed(dataDir, data);
    const started = await start(dataDir, { events: [], decisions: [] });
    servers.push(started.server);

    const res = await post(started.port, { chore: 'vacuum' });
    expect(res.json.success).toBe(true);
    const stored = JSON.parse(await readFile(join(dataDir, 'beacon_family_members.json'), 'utf8'));
    expect(stored[0]).toMatchObject({
      id: 'ada',
      name: 'Ada',
      color: '#112233',
      pinHash,
    });
    expect(stored[0].pin).toBeUndefined();
  });

  it('rejects the wrong method and bad JSON', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-chore-'));
    await writeSeed(dataDir);
    const started = await start(dataDir, { events: [], decisions: [] });
    servers.push(started.server);

    const wrong = await post(started.port, {}, 'GET');
    expect(wrong.status).toBe(405);
    const bad = await post(started.port, '{', 'POST');
    expect(bad.status).toBe(400);
    const missing = await post(started.port, {});
    expect(missing.status).toBe(400);
  });
});
