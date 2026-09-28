import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onSaveFailed, SaveFailedError } from '../utils/save-errors';
import { loadData, loadServerData, saveData, saveDataPatch } from './beacon-store';

const mode = vi.hoisted(() => ({ addOn: true }));
vi.mock('../utils/ha-env', () => ({
  isAddOn: () => mode.addOn,
  getIngressBasePath: () => '/ingress/family',
}));

describe('beacon data writes', () => {
  let failures: SaveFailedError[];
  let stopListening: () => void;

  beforeEach(() => {
    mode.addOn = true;
    localStorage.clear();
    failures = [];
    stopListening = onSaveFailed((err) => failures.push(err));
  });

  afterEach(() => {
    stopListening();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('waits for an acknowledged PUT before updating the local cache', async () => {
    localStorage.setItem('settings', '{"saved":1}');
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    const saving = saveData('settings', { saved: 2 });
    expect(localStorage.getItem('settings')).toBe('{"saved":1}');
    expect(fetchMock).toHaveBeenCalledWith('/ingress/family/beacon-data/settings', expect.objectContaining({
      method: 'PUT',
      body: '{"saved":2}',
      keepalive: true,
    }));

    finish(new Response('{"ok":true}'));
    await saving;
    expect(localStorage.getItem('settings')).toBe('{"saved":2}');
    expect(failures).toEqual([]);
  });

  it.each([
    ['the server rejects it', () => Promise.resolve(new Response('{}', { status: 500 }))],
    ['the connection fails', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('reports %s and keeps the last confirmed cache value', async (_, reply) => {
    localStorage.setItem('settings', '{"saved":1}');
    const fetchMock = vi.fn(reply);
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveData('settings', { saved: 2 })).rejects.toBeInstanceOf(SaveFailedError);
    await expect(saveDataPatch('settings', { saved: 2 }, { saved: 2 })).rejects.toBeInstanceOf(SaveFailedError);

    expect(localStorage.getItem('settings')).toBe('{"saved":1}');
    expect(failures).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends only the patch and caches the merged value after it is accepted', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);

    await saveDataPatch('settings', { updated: true }, { existing: 1, updated: true });

    expect(fetchMock).toHaveBeenCalledWith('/ingress/family/beacon-data/settings?merge', expect.objectContaining({
      method: 'PUT',
      body: '{"updated":true}',
    }));
    expect(JSON.parse(localStorage.getItem('settings')!)).toEqual({ existing: 1, updated: true });
  });

  it('discards a stale cache when the server says the key has no data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null')));
    localStorage.setItem('settings', '{"stale":true}');

    expect(await loadData('settings', { fresh: true })).toEqual({ fresh: true });
    expect(localStorage.getItem('settings')).toBeNull();

    localStorage.setItem('settings', '{"stale":true}');
    expect(await loadServerData('settings')).toEqual({ ok: true, data: null });
    expect(localStorage.getItem('settings')).toBeNull();
  });

  it('reports a failed standalone localStorage write instead of claiming it was saved', async () => {
    mode.addOn = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveData('settings', { saved: 2 })).rejects.toBeInstanceOf(SaveFailedError);
    await expect(saveDataPatch('settings', { saved: 2 }, { saved: 2 })).rejects.toBeInstanceOf(SaveFailedError);

    expect(failures).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
