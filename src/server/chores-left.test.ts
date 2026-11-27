import http from 'node:http';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleChoresLeft, listChoresLeft, listStoredChores } from '../../lib/chores-left.cjs';

const NOW = new Date('2026-07-05T03:30:00Z'); // 2026-07-04 23:30 in New York

function chart() {
  return {
    members: [
      { id: 'ada', name: 'Ada', role: 'child' },
      { id: 'bo', name: 'Bo', role: 'child' },
      { id: 'adam', name: 'Adam', role: 'child' },
    ],
    chores: [
      { id: 'dishes', name: 'Dishes', assigned_to: ['ada', 'bo'], frequency: 'daily', value_cents: 0 },
      { id: 'vacuum', name: 'Vacuum', assigned_to: ['ada'], frequency: 'daily', value_cents: 0 },
      { id: 'plants', name: 'Water plants', assigned_to: [], frequency: 'daily', value_cents: 0 },
    ],
  };
}

describe('listChoresLeft', () => {
  it('lists unfinished assignments for the household local day', () => {
    const { members, chores } = chart();
    const result = listChoresLeft({
      members,
      chores,
      completions: [
        { chore_id: 'dishes', member_id: 'ada', completed_at: '2026-07-05T02:00:00Z' },
        { chore_id: 'vacuum', member_id: 'ada', completed_at: '2026-07-04T03:00:00Z' },
      ],
      now: NOW,
      timeZone: 'America/New_York',
    });
    expect(result.date).toBe('2026-07-04');
    expect(result.success).toBe(true);
    expect(result.left.map((entry: { chore_id: string; member_id: string }) => (
      `${entry.chore_id}:${entry.member_id}`
    ))).toEqual(['dishes:bo', 'vacuum:ada', 'plants:']);
    expect(result.response).toBe(
      '3 chores left: Dishes for Bo, Vacuum for Ada, and Water plants, unassigned.',
    );
  });

  it('limits the list to one member and skips chores already done today', () => {
    const { members, chores } = chart();
    const result = listChoresLeft({
      members,
      chores,
      completions: [
        { chore_id: 'dishes', member_id: 'ada', completed_at: '2026-07-05T02:00:00Z' },
      ],
      name: 'Ada',
      now: NOW,
      timeZone: 'America/New_York',
    });
    expect(result.member_name).toBe('Ada');
    expect(result.left).toEqual([
      { chore_id: 'vacuum', chore_title: 'Vacuum', member_id: 'ada', member_name: 'Ada' },
    ]);
    expect(result.response).toBe('Ada has 1 chore left: Vacuum.');
  });

  it('says when that person is finished or has no chores', () => {
    const { members, chores } = chart();
    const done = listChoresLeft({
      members,
      chores,
      completions: [
        { chore_id: 'dishes', member_id: 'bo', completed_at: '2026-07-05T01:00:00Z' },
      ],
      name: 'bo',
      now: NOW,
      timeZone: 'America/New_York',
    });
    expect(done.response).toBe("Bo is done with today's chores.");

    const none = listChoresLeft({
      members: [{ id: 'cam', name: 'Cam', role: 'child' }],
      chores,
      completions: [],
      name: 'Cam',
      now: NOW,
      timeZone: 'America/New_York',
    });
    expect(none.response).toBe("Cam doesn't have any chores.");
  });

  it('asks which person when the name matches more than one, and writes nothing', () => {
    const result = listChoresLeft({
      members: [
        { id: 'chris', name: 'Chris', role: 'child' },
        { id: 'christine', name: 'Christine', role: 'child' },
      ],
      chores: [
        { id: 'dishes', name: 'Dishes', assigned_to: ['chris', 'christine'], frequency: 'daily', value_cents: 0 },
      ],
      completions: [],
      name: 'Chri',
      now: NOW,
      timeZone: 'UTC',
    });
    expect(result.ambiguous).toBe(true);
    expect(result.success).toBe(false);
    expect(result.left).toEqual([]);
    expect(result.response).toBe('Which person? I found Chris and Christine.');
  });

  it('keeps a 23:00 completion done at 00:30 when reset is 04:00, and open again at 04:00', () => {
    const members = [{ id: 'ada', name: 'Ada', role: 'child' }];
    const chores = [
      { id: 'dishes', name: 'Dishes', assigned_to: ['ada'], frequency: 'daily', value_cents: 0 },
    ];
    const completions = [
      { chore_id: 'dishes', member_id: 'ada', completed_at: '2026-11-21T06:00:00.000Z' },
    ];
    const early = listChoresLeft({
      members,
      chores,
      completions,
      name: 'Ada',
      now: new Date('2026-11-21T07:30:00.000Z'),
      timeZone: 'America/Phoenix',
      resetTime: '04:00',
    });
    expect(early.date).toBe('2026-11-20');
    expect(early.left).toEqual([]);
    expect(early.response).toBe("Ada is done with today's chores.");

    const reset = listChoresLeft({
      members,
      chores,
      completions,
      name: 'Ada',
      now: new Date('2026-11-21T11:00:00.000Z'),
      timeZone: 'America/Phoenix',
      resetTime: '04:00',
    });
    expect(reset.date).toBe('2026-11-21');
    expect(reset.left).toEqual([
      { chore_id: 'dishes', chore_title: 'Dishes', member_id: 'ada', member_name: 'Ada' },
    ]);

    const unset = listChoresLeft({
      members,
      chores,
      completions,
      name: 'Ada',
      now: new Date('2026-11-21T07:30:00.000Z'),
      timeZone: 'America/Phoenix',
    });
    expect(unset.date).toBe('2026-11-21');
    expect(unset.left).toHaveLength(1);
  });

  it('reports an unknown name and an empty chart', () => {
    const missing = listChoresLeft({
      members: chart().members,
      chores: chart().chores,
      completions: [],
      name: 'Zoe',
      now: NOW,
      timeZone: 'UTC',
    });
    expect(missing.response).toBe("I couldn't find a family member named Zoe.");

    const empty = listChoresLeft({
      members: [],
      chores: [],
      completions: [],
      now: NOW,
      timeZone: 'UTC',
    });
    expect(empty.response).toBe('There are no chores on the chart.');
  });
});

describe('stored chore reset time', () => {
  it('reads choresResetTime from beacon-settings.json', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-left-'));
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, 'beacon_family_members.json'), JSON.stringify([
      { id: 'ada', name: 'Ada', role: 'child' },
    ]));
    await writeFile(join(dataDir, 'beacon_chores.json'), JSON.stringify([
      { id: 'dishes', name: 'Dishes', assigned_to: ['ada'], frequency: 'daily', value_cents: 0 },
    ]));
    await writeFile(join(dataDir, 'beacon_completions.json'), JSON.stringify([
      { chore_id: 'dishes', member_id: 'ada', completed_at: '2026-11-21T06:00:00.000Z' },
    ]));
    await writeFile(join(dataDir, 'beacon-settings.json'), JSON.stringify({ choresResetTime: '04:00' }));

    const result = await listStoredChores({
      dataDir,
      now: () => new Date('2026-11-21T07:30:00.000Z'),
      timeZone: 'America/Phoenix',
    }, 'Ada');
    expect(result.date).toBe('2026-11-20');
    expect(result.left).toEqual([]);
  });
});

describe('GET /beacon-action/chores-left', () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    })));
  });

  async function start() {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-left-'));
    await mkdir(dataDir, { recursive: true });
    const { members, chores } = chart();
    await writeFile(join(dataDir, 'beacon_family_members.json'), JSON.stringify(members));
    await writeFile(join(dataDir, 'beacon_chores.json'), JSON.stringify(chores));
    await writeFile(join(dataDir, 'beacon_completions.json'), JSON.stringify([
      { chore_id: 'dishes', member_id: 'ada', completed_at: '2026-07-05T02:00:00Z' },
    ]));
    const server = http.createServer((req, res) => {
      if ((req.url || '').split('?')[0] === '/beacon-action/chores-left') {
        handleChoresLeft(req, res, {
          dataDir,
          now: () => NOW,
          timeZone: 'America/New_York',
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    return address.port;
  }

  it('answers a member query from the stored chart', async () => {
    const port = await start();
    const res = await fetch(`http://127.0.0.1:${port}/beacon-action/chores-left?member=Ada`);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.response).toBe('Ada has 1 chore left: Vacuum.');
    expect(json.action).toBe('chores_left');
  });

  it('rejects methods other than GET and POST', async () => {
    const port = await start();
    const res = await fetch(`http://127.0.0.1:${port}/beacon-action/chores-left`, { method: 'PUT' });
    expect(res.status).toBe(405);
  });
});
