import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addToCollection, getCollection, removeFromCollection, updateInCollection } from './beacon-collection';
import { onSaveFailed, saveThen, SaveFailedError } from '../utils/save-errors';

vi.mock('../utils/ha-env', async (importOriginal) => ({
  ...await importOriginal<typeof import('../utils/ha-env')>(),
  isAddOn: () => true,
}));

/*
 * Add-on mode: the server's copy is the real one. A write the server didn't
 * take used to go into this device's local cache and count as saved, until
 * the next read put the server's copy back.
 */
describe('collection writes in add-on mode', () => {
  let failures: SaveFailedError[];
  let stopListening: () => void;

  beforeEach(() => {
    localStorage.clear();
    failures = [];
    stopListening = onSaveFailed((err) => failures.push(err));
  });

  afterEach(() => {
    stopListening();
    vi.unstubAllGlobals();
  });

  it.each([
    ['the server is unreachable', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['the server answers with an error', () => Promise.resolve(new Response('{}', { status: 500 }))],
  ])('reports a failed write when %s, and keeps nothing', async (_, answer) => {
    vi.stubGlobal('fetch', vi.fn(answer));

    await expect(addToCollection('beacon_completions', { chore_id: 'c1' })).rejects.toBeInstanceOf(SaveFailedError);
    await expect(updateInCollection('beacon_chores', 'c1', { name: 'x' })).rejects.toBeInstanceOf(SaveFailedError);
    await expect(removeFromCollection('beacon_chores', 'c1')).rejects.toBeInstanceOf(SaveFailedError);

    expect(failures).toHaveLength(3);
    expect(localStorage.getItem('beacon_completions')).toBeNull();
  });

  it('caches what the server stored', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x1', chore_id: 'c1' }), { status: 201 })));
    await addToCollection('beacon_completions', { chore_id: 'c1' });
    expect(JSON.parse(localStorage.getItem('beacon_completions')!)).toEqual([{ id: 'x1', chore_id: 'c1' }]);
    expect(failures).toEqual([]);
  });

  it('asks the server for recent completions only', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 'new', completed_at: '2026-09-26T09:00:00.000Z' }])));
    vi.stubGlobal('fetch', fetchMock);

    const since = new Date('2026-09-26T00:00:00.000Z');
    expect(await getCollection('beacon_completions', { since })).toEqual([{ id: 'new', completed_at: '2026-09-26T09:00:00.000Z' }]);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/beacon-collection/beacon_completions?since=2026-09-26T00%3A00%3A00.000Z'));

    // One-off chores are looked up by the server: their ids don't go in the URL.
    await getCollection('beacon_completions', { since, onceChoreIds: ['once-1', 'once-2'] });
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringMatching(/&once_chores$/));
  });

  // Once every read asked for recent completions, this device's copy was
  // never refreshed: offline it showed only its own ticks, and it grew.
  it("refreshes this device's copy of recent completions, and drops old ones", async () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
    localStorage.setItem('beacon_completions', JSON.stringify([
      { id: 'ancient', completed_at: daysAgo(100) },
      { id: 'last-month', completed_at: daysAgo(40) },
      { id: 'undone-elsewhere', completed_at: daysAgo(1) },
    ]));
    const fresh = { id: 'from-another-display', completed_at: daysAgo(2) };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([fresh]))));

    await getCollection('beacon_completions', { since: new Date(Date.now() - 7 * 86400000) });
    expect(JSON.parse(localStorage.getItem('beacon_completions')!).map((c: { id: string }) => c.id)).toEqual(['last-month', 'from-another-display']);
  });

  it('reads still fall back to the local copy when the server is unreachable', async () => {
    localStorage.setItem('beacon_chores', JSON.stringify([{ id: 'c1' }]));
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await getCollection('beacon_chores')).toEqual([{ id: 'c1' }]);
  });
});

describe('saveThen', () => {
  it('refreshes after a failed save without passing the reported error on', async () => {
    const refresh = vi.fn();
    await saveThen(() => Promise.reject(new SaveFailedError('x')), refresh);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('passes other errors on, after refreshing', async () => {
    const refresh = vi.fn();
    await expect(saveThen(() => Promise.reject(new Error('bug')), refresh)).rejects.toThrow('bug');
    expect(refresh).toHaveBeenCalledOnce();
  });
});
