import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { media, resetMedia, addPhotos, MEDIA_ROOT, PHOTO_FOLDER } from '../test/fake-media-source';
import {
  listPhotos,
  folderMediaIds,
  resolvePhotoUrl,
  forgetPhotoUrl,
  clearPhotoCaches,
  PHOTO_LIST_TTL_MS,
  PHOTO_URL_MAX_AGE_MS,
} from './photos';

vi.mock('./ha-rest', async () => (await import('../test/fake-media-source')).haRestMock);
vi.mock('../utils/ha-env', () => ({ isAddOn: () => true }));

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  resetMedia();
  clearPhotoCaches();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-26T08:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('listPhotos', () => {
  it('browses each folder once and resolves no photo URLs', async () => {
    addPhotos(20);
    const photos = await listPhotos();
    expect(photos).toHaveLength(20);
    expect(photos[0]).toEqual({ id: `${PHOTO_FOLDER}/photo-1.jpg`, caption: 'photo-1.jpg', source: 'local' });
    expect(media.browses.sort()).toEqual([MEDIA_ROOT, PHOTO_FOLDER].sort());
    expect(media.resolves).toEqual([]);
  });

  it('shares one browse between everything asking, for an hour', async () => {
    addPhotos(3);
    const [a, b] = await Promise.all([listPhotos(), listPhotos()]); // Photos screen + screensaver
    expect(a).toBe(b);
    expect(media.browses).toHaveLength(2);

    vi.setSystemTime(Date.now() + PHOTO_LIST_TTL_MS - 1000);
    await listPhotos();
    expect(media.browses).toHaveLength(2);

    vi.setSystemTime(Date.now() + 2000);
    await listPhotos();
    expect(media.browses).toHaveLength(4);
  });

  it("doesn't keep a list from a failed browse", async () => {
    addPhotos(3);
    media.failBrowse = true;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await listPhotos()).toEqual([]);

    media.failBrowse = false;
    expect(await listPhotos()).toHaveLength(3);
  });

  it("doesn't keep an empty list, so newly added photos show up", async () => {
    expect(await listPhotos()).toEqual([]);
    addPhotos(2);
    expect(await listPhotos()).toHaveLength(2);
  });

  // Settings' Source Directory used to be ignored: the add-on option was
  // read once, at startup.
  it('browses the folder chosen in Settings, and a newly chosen one at once', async () => {
    const garden = `${MEDIA_ROOT}/garden`;
    addPhotos(2, garden);
    addPhotos(3);
    localStorage.setItem('beacon-settings', JSON.stringify({ photoDirectory: '/media/garden' }));
    expect(await listPhotos()).toHaveLength(2);
    expect(media.browses).toContain(garden);

    localStorage.setItem('beacon-settings', JSON.stringify({ photoDirectory: '/media/beacon/photos' }));
    expect(await listPhotos()).toHaveLength(3);
  });

  // "/media/local/…" is the web address HA serves /media/… at. It was
  // taken as a path on disk (/media/local/beacon/photos), so the Photos
  // screen said "No photos available".
  it('finds the folder given as its web address', async () => {
    addPhotos(3);
    localStorage.setItem('beacon-settings', JSON.stringify({ photoDirectory: '/media/local/beacon/photos' }));
    expect(await listPhotos()).toHaveLength(3);
    expect(media.browses).not.toContain(`${MEDIA_ROOT}/local/beacon/photos`);
  });

  it('still finds a folder that is actually named "local"', async () => {
    addPhotos(2, `${MEDIA_ROOT}/local/family`);
    localStorage.setItem('beacon-settings', JSON.stringify({ photoDirectory: '/media/local/family' }));
    expect(await listPhotos()).toHaveLength(2);
  });

  it('lists a photo once when both sources contain it', async () => {
    const [id] = addPhotos(1);
    media.folders.set(MEDIA_ROOT, [id]);
    expect(await listPhotos()).toHaveLength(1);
  });
});

describe('resolvePhotoUrl', () => {
  it('resolves a photo once and reuses its URL', async () => {
    const [id] = addPhotos(1);
    const [a, b] = await Promise.all([resolvePhotoUrl(id), resolvePhotoUrl(id)]);
    const c = await resolvePhotoUrl(id);
    expect(a).toMatch(/^http.*\/media\/local\/beacon\/photos\/photo-1\.jpg\?authSig=sig-1$/);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(media.resolves).toEqual([id]);
  });

  it("resolves again well before HA's 24-hour signature runs out", async () => {
    const [id] = addPhotos(1);
    const first = await resolvePhotoUrl(id);

    vi.setSystemTime(Date.now() + PHOTO_URL_MAX_AGE_MS - 1000);
    expect(await resolvePhotoUrl(id)).toBe(first);

    vi.setSystemTime(Date.now() + 2000);
    const second = await resolvePhotoUrl(id);
    expect(second).not.toBe(first);
    expect(media.resolves).toHaveLength(2);
    expect(PHOTO_URL_MAX_AGE_MS).toBeLessThanOrEqual(12 * HOUR);
  });

  it('resolves again after a URL is forgotten, unless a newer one replaced it', async () => {
    const [id] = addPhotos(1);
    const first = (await resolvePhotoUrl(id))!;
    forgetPhotoUrl(id, first);
    const second = (await resolvePhotoUrl(id))!;
    expect(second).not.toBe(first);

    forgetPhotoUrl(id, first); // stale report: keep the newer URL
    expect(await resolvePhotoUrl(id)).toBe(second);
    expect(media.resolves).toHaveLength(2);
  });
});

describe('folderMediaIds', () => {
  it('reads the folder in any of the forms HA uses for it', () => {
    expect(folderMediaIds('/media/beacon/photos')).toEqual([PHOTO_FOLDER]);
    expect(folderMediaIds('/media/local/beacon/photos')).toEqual([PHOTO_FOLDER, `${MEDIA_ROOT}/local/beacon/photos`]);
    expect(folderMediaIds('beacon/photos/')).toEqual([PHOTO_FOLDER]);
    expect(folderMediaIds(` ${PHOTO_FOLDER} `)).toEqual([PHOTO_FOLDER]);
    expect(folderMediaIds('/media')).toEqual([MEDIA_ROOT]);
    expect(folderMediaIds('/media/local')).toEqual([MEDIA_ROOT, `${MEDIA_ROOT}/local`]);
  });

  it("doesn't take a folder whose name starts with media or local for those", () => {
    expect(folderMediaIds('/mediafiles/photos')).toEqual([`${MEDIA_ROOT}/mediafiles/photos`]);
    expect(folderMediaIds('/media/localphotos')).toEqual([`${MEDIA_ROOT}/localphotos`]);
  });
});
