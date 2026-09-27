import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkForChanges, onDataChanged, resetDataChanges } from './data-changes';

type Answer = { boot: string; counts: Record<string, number> } | 'fail';

function answering(...answers: Answer[]) {
  const queue = [...answers];
  vi.stubGlobal('fetch', vi.fn(async () => {
    const next = queue.shift();
    if (!next || next === 'fail') throw new Error('offline');
    return new Response(JSON.stringify(next), { status: 200 });
  }));
}

beforeEach(() => {
  resetDataChanges();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('data changes', () => {
  it('tells nobody on the first check, which is where counting starts', async () => {
    const listener = vi.fn();
    onDataChanged('beacon_chores', listener);
    answering({ boot: 'b1', counts: { beacon_chores: 3 } });

    await checkForChanges();

    expect(listener).not.toHaveBeenCalled();
  });

  it('tells the subscribers of what changed, once per check', async () => {
    const family = vi.fn();
    const settings = vi.fn();
    onDataChanged(['beacon_chores', 'beacon_completions'], family);
    onDataChanged('beacon-settings', settings);
    answering(
      { boot: 'b1', counts: { beacon_chores: 1, 'beacon-settings': 1 } },
      { boot: 'b1', counts: { beacon_chores: 2, beacon_completions: 1, 'beacon-settings': 1 } },
    );

    await checkForChanges();
    await checkForChanges();

    expect(family).toHaveBeenCalledTimes(1);
    expect(settings).not.toHaveBeenCalled();
  });

  it('tells everyone after the add-on restarts, which starts the counts over', async () => {
    const listener = vi.fn();
    onDataChanged('beacon-settings', listener);
    answering(
      { boot: 'b1', counts: { 'beacon-settings': 4 } },
      { boot: 'b2', counts: {} },
    );

    await checkForChanges();
    await checkForChanges();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('compares with the last answer it got when a check fails', async () => {
    const listener = vi.fn();
    onDataChanged('beacon_chores', listener);
    answering(
      { boot: 'b1', counts: { beacon_chores: 1 } },
      'fail',
      { boot: 'b1', counts: { beacon_chores: 2 } },
    );

    await checkForChanges();
    await checkForChanges();
    expect(listener).not.toHaveBeenCalled();

    await checkForChanges();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops telling a subscriber that unsubscribed', async () => {
    const listener = vi.fn();
    const stop = onDataChanged('beacon_chores', listener);
    answering(
      { boot: 'b1', counts: { beacon_chores: 1 } },
      { boot: 'b1', counts: { beacon_chores: 2 } },
    );

    await checkForChanges();
    stop();
    await checkForChanges();

    expect(listener).not.toHaveBeenCalled();
  });
});
