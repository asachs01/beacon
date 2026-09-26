// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/*
 * Runs real sync passes (chores-sync.cjs, as run by the add-on server)
 * against a fake Home Assistant to-do list and an in-memory stand-in for
 * the server's collection files. Like the real server, the fake assigns
 * its own record ids on add — the sync must not rely on those ids to find
 * its links. Every fake call yields, so passes that ran at the same time
 * would interleave.
 */

const { createChoresSync } = createRequire(import.meta.url)('./chores-sync.cjs');

type Status = 'needs_action' | 'completed';
interface FakeItem { uid: string; summary: string; status: Status; description?: string }
interface Rec { id: string; [key: string]: unknown }

const LINKS = 'beacon_chores_sync_links';

const ha = {
  lists: new Map<string, FakeItem[]>(),
  deletes: [] as string[],
  deleteReasons: [] as string[],
  calls: 0,
  broken: new Set<string>(), // lists whose get_items fails
  failRemove: false, // remove_item fails (Google error)
  failUpdateFor: new Set<string>(), // task uids whose update_item fails
  nextUid: 0,
};

async function callService(domain: string, service: string, data: Record<string, unknown>, opts: { reason?: string } = {}) {
  ha.calls++;
  await Promise.resolve();
  if (domain === 'homeassistant') return null;
  const entity = data.entity_id as string;
  const items = ha.lists.get(entity) ?? [];
  ha.lists.set(entity, items);
  const find = (key: unknown) => items.find((it) => it.uid === key || it.summary === key);
  switch (service) {
    case 'get_items':
      if (ha.broken.has(entity)) throw new Error('get_items failed (HTTP 500)');
      return { service_response: { [entity]: { items: items.map((it) => ({ ...it })) } } };
    case 'add_item':
      items.push({ uid: `task-${++ha.nextUid}`, summary: data.item as string, status: 'needs_action', description: data.description as string });
      return null;
    case 'update_item': {
      if (ha.failUpdateFor.has(data.item as string)) throw new Error('update_item failed (HTTP 500)');
      const it = find(data.item);
      if (!it) throw new Error('item_not_found');
      if (data.rename) it.summary = data.rename as string;
      if (data.status) it.status = data.status as Status;
      if ('description' in data) it.description = (data.description as string | null) ?? undefined;
      return null;
    }
    case 'remove_item': {
      if (ha.failRemove) throw new Error('remove_item failed (HTTP 500)');
      const it = find(data.item);
      if (!it) throw new Error('item_not_found');
      ha.deletes.push(it.uid);
      ha.deleteReasons.push(opts.reason ?? '');
      items.splice(items.indexOf(it), 1);
      return null;
    }
  }
  throw new Error(`unexpected service ${domain}.${service}`);
}

const db = {
  collections: new Map<string, Rec[]>(),
  unreadable: new Set<string>(), // collection files that fail to parse
  nextId: 0,
};
const coll = (name: string) => {
  if (!db.collections.has(name)) db.collections.set(name, []);
  return db.collections.get(name)!;
};
const store = {
  list: async (name: string) => {
    await Promise.resolve();
    if (db.unreadable.has(name)) throw new SyntaxError(`Unexpected end of JSON input (${name}.json)`);
    return coll(name).map((it) => ({ ...it }));
  },
  add: async (name: string, item: Record<string, unknown>) => {
    await Promise.resolve();
    const created = { ...item, id: (item.id as string) || `rec-${++db.nextId}` }; // server-assigned id
    coll(name).push(created);
    return { ...created };
  },
  update: async (name: string, id: string, patch: object) => {
    await Promise.resolve();
    const it = coll(name).find((x) => x.id === id);
    if (!it) return null;
    Object.assign(it, patch);
    return { ...it };
  },
  remove: async (name: string, id: string) => {
    await Promise.resolve();
    const items = coll(name);
    const idx = items.findIndex((x) => x.id === id);
    if (idx >= 0) items.splice(idx, 1);
    return idx >= 0;
  },
};

let settings: Record<string, unknown>;
let timeZone: string | undefined;
let clock: Date;

function makeSync(overrides: Record<string, unknown> = {}) {
  return createChoresSync({
    store,
    callService,
    readSettings: async () => settings,
    getTimeZone: async () => timeZone,
    now: () => new Date(clock),
    ...overrides,
  });
}

// Family-side changes, as the app makes them through the collection API.
const chores = () => coll('beacon_chores');
const addChore = (name: string, assigned_to = ['kai'], frequency = 'daily') =>
  store.add('beacon_chores', { name, assigned_to, frequency, value_cents: 0 });
const complete = (choreId: string, memberId = 'kai', at = clock) =>
  store.add('beacon_completions', { chore_id: choreId, member_id: memberId, completed_at: at.toISOString() });
const completions = () => coll('beacon_completions');

async function setup() {
  const chore = await addChore('Vacuum');
  const sync = makeSync();
  const run = () => sync.runNow({ verbose: true });
  await run();
  return { chore, sync, run, task: () => ha.lists.get('todo.kai')! };
}

beforeEach(() => {
  ha.lists.clear();
  ha.deletes = [];
  ha.deleteReasons = [];
  ha.calls = 0;
  ha.broken.clear();
  ha.failRemove = false;
  ha.failUpdateFor.clear();
  db.collections.clear();
  db.unreadable.clear();
  coll('beacon_family_members').push({ id: 'kai', name: 'Kai', avatar: '', color: '#000', role: 'child' });
  settings = { choresSyncEnabled: true, choresSyncListByMember: { kai: 'todo.kai' } };
  timeZone = 'UTC';
  clock = new Date('2026-09-26T10:00:00Z');
});

describe('chores sync (add-on)', () => {
  it('creates one task per chore and keeps it across passes', async () => {
    const { run, task } = await setup();
    await run();
    await run();
    expect(task()).toHaveLength(1);
    expect(task()[0].summary).toBe('Vacuum');
    expect(ha.deletes).toEqual([]);
    expect(coll(LINKS)).toHaveLength(1);
  });

  it('pushes a completion made in Family to Google without deleting the task', async () => {
    const { chore, sync, run, task } = await setup();
    await complete(chore.id);
    await run();
    expect(task()).toHaveLength(1);
    expect(task()[0].status).toBe('completed');
    expect(ha.deletes).toEqual([]);
    expect(sync.status().lastChangeAt).toBeNull(); // Family's data wasn't changed
  });

  it('pulls a completion made in Google into Family', async () => {
    const { chore, sync, run, task } = await setup();
    task()[0].status = 'completed';
    await run();
    expect(completions().some((c) => c.chore_id === chore.id && c.member_id === 'kai')).toBe(true);
    expect(sync.status().lastChangeAt).not.toBeNull(); // open screens refresh
  });

  it('un-ticks in Google when un-ticked in Family after both sides ticked', async () => {
    const { chore, run, task } = await setup();
    const done = await complete(chore.id);
    task()[0].status = 'completed';
    await run();
    await store.remove('beacon_completions', done.id);
    await run();
    expect(task()[0].status).toBe('needs_action');
    expect(completions()).toHaveLength(0);
  });

  it('writes nothing into the notes of new tasks', async () => {
    const { task } = await setup();
    expect(task()[0].description).toBeUndefined();
  });

  it('strips the legacy [beacon-sync] tag but keeps other notes', async () => {
    const { chore, run, task } = await setup();
    task()[0].description = `Use the upstairs vacuum\n[beacon-sync] chore_id:${chore.id} member_id:kai`;
    await run();
    expect(task()[0].description).toBe('Use the upstairs vacuum');
    task()[0].description = `[beacon-sync] chore_id:${chore.id} member_id:kai`;
    await run();
    expect(task()[0].description).toBeUndefined();
  });

  it('adopts the existing task by title when its link is lost', async () => {
    const { run, task } = await setup();
    db.collections.set(LINKS, []);
    await run();
    expect(task()).toHaveLength(1);
    expect(chores()).toHaveLength(1); // not imported as a new chore
    expect(coll(LINKS)).toHaveLength(1);
  });

  it('keeps a Google tick on a re-linked task', async () => {
    const { chore, run, task } = await setup();
    db.collections.set(LINKS, []);
    task()[0].status = 'completed';
    await run(); // re-link, baseline "needs_action"
    await run(); // the tick now counts as a change made in Google
    expect(task()[0].status).toBe('completed');
    expect(completions().some((c) => c.chore_id === chore.id)).toBe(true);
  });

  it('imports a task added in Google as a new chore', async () => {
    const { run, task } = await setup();
    task().push({ uid: 'mine', summary: 'Feed the cat', status: 'needs_action' });
    await run();
    expect(chores().map((c) => c.name).sort()).toEqual(['Feed the cat', 'Vacuum']);
    expect(chores().find((c) => c.name === 'Feed the cat')).toMatchObject({ assigned_to: ['kai'], frequency: 'once' });
    expect(task()).toHaveLength(2);
  });

  it('imports a new Google task only once, even when passes are requested at the same time', async () => {
    const { sync, task } = await setup();
    task().push({ uid: 'mine', summary: 'Feed the cat', status: 'needs_action' });
    await Promise.all([sync.runNow(), sync.runNow({ verbose: true }), sync.runNow()]);
    expect(chores().filter((c) => c.name === 'Feed the cat')).toHaveLength(1);
    expect(coll(LINKS)).toHaveLength(2);
    expect(task()).toHaveLength(2);
  });

  it('deletes the task when the chore is deleted in Family, saying why in the log', async () => {
    const { chore, run, task } = await setup();
    await store.remove('beacon_chores', chore.id);
    await run();
    expect(task()).toHaveLength(0);
    expect(ha.deleteReasons[0]).toMatch(/no longer matches an assigned chore/);
  });

  // The link was dropped even when deleting the Google task failed, and
  // the task then came back as a new chore.
  it("keeps trying to delete a deleted chore's task until it's gone", async () => {
    const { chore, run, task } = await setup();
    await store.remove('beacon_chores', chore.id);

    ha.failRemove = true;
    await run();
    ha.failRemove = false;
    ha.broken.add('todo.kai');
    await run();
    expect(task()).toHaveLength(1);
    expect(coll(LINKS)).toHaveLength(1);

    ha.broken.clear();
    await run();
    await run();
    expect(task()).toHaveLength(0);
    expect(coll(LINKS)).toHaveLength(0);
    expect(chores()).toHaveLength(0); // not imported back
  });

  // Dropping the link made the next pass create the task again.
  it('leaves a task deleted in Google Tasks deleted, until the chore is reassigned', async () => {
    const { chore, run, task } = await setup();
    task().splice(0, 1);
    await run();
    await run();
    expect(task()).toHaveLength(0);

    await store.update('beacon_chores', chore.id, { assigned_to: [] });
    await run();
    await store.update('beacon_chores', chore.id, { assigned_to: ['kai'] });
    await run();
    expect(task().map((t) => t.summary)).toEqual(['Vacuum']);
  });

  it('syncs a task again when it comes back in Google Tasks', async () => {
    const { chore, run, task } = await setup();
    const [deleted] = task().splice(0, 1);
    await run();
    task().push(deleted);
    await complete(chore.id);
    await run();
    expect(task()[0].status).toBe('completed');
  });

  // One task HA wouldn't update failed the whole pass, every minute, and no
  // chore after it synced again.
  it('keeps syncing the other chores when one task fails', async () => {
    const vacuum = await addChore('Vacuum');
    const dishes = await addChore('Dishes');
    const sync = makeSync();
    await sync.runNow();
    const task = (name: string) => ha.lists.get('todo.kai')!.find((t) => t.summary === name)!;
    ha.failUpdateFor.add(task('Vacuum').uid);
    await complete(vacuum.id);
    await complete(dishes.id);
    await sync.runNow();
    expect(task('Dishes').status).toBe('completed');
  });

  // Every chore counted as daily: the day after, the sync un-ticked weekly
  // chores and finished one-off tasks in Google.
  it('leaves weekly chores ticked for the week and one-offs for good', async () => {
    const weekly = await addChore('Mow lawn', ['kai'], 'weekly');
    const once = await addChore('Fix bike', ['kai'], 'once');
    const daily = await addChore('Feed cat');
    const sync = makeSync();
    await sync.runNow();
    for (const c of [weekly, once, daily]) await complete(c.id); // Saturday 26 Sep
    await sync.runNow();

    const status = (name: string) => ha.lists.get('todo.kai')!.find((t) => t.summary === name)!.status;
    settings = { ...settings, weekStartsOn: 1 };
    clock = new Date('2026-09-27T10:00:00Z'); // Sunday: same week (from Monday)
    await sync.runNow();
    expect([status('Mow lawn'), status('Fix bike'), status('Feed cat')]).toEqual(['completed', 'completed', 'needs_action']);

    clock = new Date('2026-09-28T10:00:00Z'); // Monday: a new week
    await sync.runNow();
    expect([status('Mow lawn'), status('Fix bike')]).toEqual(['needs_action', 'completed']);
  });

  describe('titles', () => {
    // Only the status synced, so a renamed chore kept its old title.
    it('renames the Google task when the chore is renamed in Family', async () => {
      const { chore, run, task } = await setup();
      await store.update('beacon_chores', chore.id, { name: 'Vacuum upstairs' });
      await run();
      expect(task()[0].summary).toBe('Vacuum upstairs');
    });

    it('renames the chore when the task is renamed in Google', async () => {
      const { run, task } = await setup();
      task()[0].summary = 'Vacuum the car';
      await run();
      expect(chores()[0].name).toBe('Vacuum the car');
      await run();
      expect(task()[0].summary).toBe('Vacuum the car');
    });

    it('keeps the Family title when both were renamed', async () => {
      const { chore, run, task } = await setup();
      task()[0].summary = 'Hoover';
      await store.update('beacon_chores', chore.id, { name: 'Vacuum the hall' });
      await run();
      expect([chores()[0].name, task()[0].summary]).toEqual(['Vacuum the hall', 'Vacuum the hall']);
    });
  });

  // The link to an old routine task was dropped even when deleting the task
  // failed, and the task then came back as a new chore.
  it("keeps an old routine task's link until the task is deleted", async () => {
    const { run } = await setup();
    ha.lists.get('todo.kai')!.push({ uid: 'routine-1', summary: 'Brush teeth', status: 'needs_action' });
    coll('beacon_routine_sync_links').push({ id: 'rl-1', member_id: 'kai', uid: 'routine-1' });

    ha.failRemove = true;
    await run();
    expect(coll('beacon_routine_sync_links')).toHaveLength(1);
    expect(chores().map((c) => c.name)).toEqual(['Vacuum']); // not imported

    ha.failRemove = false;
    await run();
    expect(coll('beacon_routine_sync_links')).toHaveLength(0);
    expect(ha.lists.get('todo.kai')!.map((t) => t.summary)).toEqual(['Vacuum']);
  });

  it('cleans up duplicate link records from earlier builds', async () => {
    const { run, task } = await setup();
    const links = coll(LINKS);
    links.push({ ...links[0], id: 'rec-dup' });
    await run();
    expect(links).toHaveLength(1);
    expect(task()).toHaveLength(1);
    expect(ha.deletes).toEqual([]);
  });

  it("decides what counts as today in Home Assistant's time zone", async () => {
    // 1pm UTC on the 25th is 1am on the 26th in Auckland (today there),
    // but 9am on the 25th in New York (yesterday there). Now is 10am UTC
    // on the 26th: 10pm in Auckland, 6am in New York, both on the 26th.
    const { chore, run, task } = await setup();
    await complete(chore.id, 'kai', new Date('2026-09-25T13:00:00Z'));

    timeZone = 'America/New_York';
    await run();
    expect(task()[0].status).toBe('needs_action');

    timeZone = 'Pacific/Auckland';
    await run();
    expect(task()[0].status).toBe('completed');
  });

  it('un-ticks the Google task when a new day starts', async () => {
    const { chore, run, task } = await setup();
    await complete(chore.id);
    await run();
    expect(task()[0].status).toBe('completed');
    clock = new Date('2026-09-27T10:00:00Z');
    await run();
    expect(task()[0].status).toBe('needs_action');
  });

  it("advances an existing streak when a chore is ticked in Google", async () => {
    const { run, task } = await setup();
    coll('beacon_streaks').push({ id: 'kai', member_id: 'kai', current: 2, longest: 2, last_completed: '2026-09-25T09:00:00Z' });
    task()[0].status = 'completed';
    await run();
    expect(coll('beacon_streaks')[0]).toMatchObject({ current: 3, longest: 3 });
  });

  // "Yesterday" was now minus 24 hours: just after midnight following a
  // 23-hour daylight-saving day, that's the day before yesterday.
  it('advances a streak across a daylight-saving change', async () => {
    timeZone = 'America/New_York';
    clock = new Date('2026-03-09T04:30:00Z'); // 00:30 on 9 March, after 8 March lost an hour
    const { run, task } = await setup();
    coll('beacon_streaks').push({ id: 'kai', member_id: 'kai', current: 2, longest: 2, last_completed: '2026-03-08T17:00:00Z' });
    task()[0].status = 'completed';
    await run();
    expect(coll('beacon_streaks')[0]).toMatchObject({ current: 3 });
  });

  it("starts a streak when a chore is ticked in Google by someone who doesn't have one yet", async () => {
    const { run, task } = await setup();
    task()[0].status = 'completed';
    await run();
    expect(coll('beacon_streaks')).toEqual([
      { id: 'kai', member_id: 'kai', current: 1, longest: 1, last_completed: clock.toISOString() },
    ]);
  });

  it("skips a list it can't read, without deleting or importing anything", async () => {
    const { sync, run, task } = await setup();
    await addChore('Dishes');
    ha.broken.add('todo.kai');
    await run();
    expect(task()).toHaveLength(1); // "Dishes" waits until the list can be read
    expect(ha.deletes).toEqual([]);
    expect(coll(LINKS)).toHaveLength(1);
    expect(sync.status().problems).toEqual(["Couldn't read Kai's list"]);

    ha.broken.clear();
    await run();
    expect(task().map((t) => t.summary).sort()).toEqual(['Dishes', 'Vacuum']);
    expect(sync.status().problems).toEqual([]);
  });

  it("stops without touching Google when Family's chores can't be read", async () => {
    const { sync, run, task } = await setup();
    db.unreadable.add('beacon_chores');
    const result = await run();
    expect(result.outcome).toBe('failed');
    expect(task()).toHaveLength(1);
    expect(ha.deletes).toEqual([]);
    expect(coll(LINKS)).toHaveLength(1);
    expect(sync.status().lastError).toMatch(/JSON/);
  });

  it('does nothing while sync is turned off', async () => {
    settings = { choresSyncEnabled: false, choresSyncListByMember: { kai: 'todo.kai' } };
    await addChore('Vacuum');
    const result = await makeSync().runNow();
    expect(result.outcome).toBe('skipped');
    expect(ha.calls).toBe(0);
  });

  it('logs only changes on regular passes, and a repeated warning only once', async () => {
    const lines: string[] = [];
    const sync = makeSync({ log: (line: string) => lines.push(line) });
    await addChore('Vacuum');
    await sync.runNow();
    expect(lines).toEqual([expect.stringMatching(/"Vacuum" for Kai: created Google task/)]);

    lines.length = 0;
    await sync.runNow();
    expect(lines).toEqual([]); // nothing changed

    ha.broken.add('todo.kai');
    await sync.runNow();
    await sync.runNow();
    expect(lines).toEqual([expect.stringMatching(/todo.kai: couldn't read the list/)]);
  });

  describe('timing', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); });
    afterEach(() => { vi.useRealTimers(); });

    const passes = () => ha.calls; // every pass starts by refreshing the list

    it('runs every minute, and a few seconds after something changes in Family', async () => {
      await addChore('Vacuum');
      const sync = makeSync();
      sync.start({ initialDelayMs: 1000 });

      await vi.advanceTimersByTimeAsync(1000);
      const afterFirst = passes();
      expect(afterFirst).toBeGreaterThan(0);

      await vi.advanceTimersByTimeAsync(59_000);
      expect(passes()).toBe(afterFirst); // not yet a minute since the last pass
      await vi.advanceTimersByTimeAsync(1_000);
      const afterSecond = passes();
      expect(afterSecond).toBeGreaterThan(afterFirst);

      // A burst of changes: one pass, 5s after the first of them.
      sync.requestSoon();
      await vi.advanceTimersByTimeAsync(3_000);
      sync.requestSoon();
      expect(passes()).toBe(afterSecond);
      await vi.advanceTimersByTimeAsync(2_000);
      const afterSoon = passes();
      expect(afterSoon).toBeGreaterThan(afterSecond);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(passes()).toBe(afterSoon);

      sync.stop();
    });

    it('syncs soon after the sync settings change, but not after other settings changes', async () => {
      await addChore('Vacuum');
      const sync = makeSync();
      await sync.runNow();
      sync.start({ initialDelayMs: 60_000 });
      const before = passes();

      settings = { ...settings, themeId: 'dark' };
      await sync.settingsChanged();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(passes()).toBe(before);

      settings = { ...settings, choresSyncListByMember: { kai: 'todo.kai_2' } };
      await sync.settingsChanged();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(passes()).toBeGreaterThan(before);
      // The pass used the new list: the old list's task isn't in it, so
      // its link was dropped (the next pass creates the task there).
      expect(coll(LINKS)).toHaveLength(0);

      sync.stop();
    });
  });
});
