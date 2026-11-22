import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGooglePhotoCache } from '../../lib/google-photos-cache.cjs';
import { albumHash } from '../../lib/google-photos-album.cjs';

const SHARE = 'https://photos.app.goo.gl/abc123XYZ';

function albumPage(ids: string[]) {
  const items = ids.map((id) => (
    `["${id}", ["https://lh3.googleusercontent.com/pw/${id}", 1200, 800], 1710000000000, "d", 0, 1710000001000]`
  )).join(', ');
  return `<html><head><title>Picnic - Google Photos</title></head><body>
    <script>AF_initDataCallback({key: 'ds:1', data:[null, [${items}]], sideChannel: {}});</script>
    </body></html>`;
}

function jpeg(label: string) {
  return Buffer.from(`jpeg-bytes-${label}-${'x'.repeat(40)}`);
}

function fakeFetch(pages: { html: string; fail?: boolean; imageFail?: boolean }) {
  const seen: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = async (url: string) => {
    seen.push(url);
    if (pages.fail) throw new Error('network down');
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    if (url.startsWith('https://lh3.googleusercontent.com/')) {
      if (pages.imageFail) return { status: 500, headers: {}, body: Buffer.from('') };
      const id = url.split('/pw/')[1]?.split('=')[0] || 'photo';
      return {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
        body: jpeg(id),
      };
    }
    return { status: 200, headers: { 'content-type': 'text/html' }, body: pages.html };
  };
  return { fetchImpl, seen, maxInFlight: () => maxInFlight };
}

async function setup(html: string, extra?: { fail?: boolean; imageFail?: boolean }) {
  const dataDir = await mkdtemp(join(tmpdir(), 'beacon-photos-'));
  const net = fakeFetch({ html, ...extra });
  const cache = createGooglePhotoCache({ dataDir, fetchImpl: net.fetchImpl, concurrency: 3 });
  return { dataDir, cache, net };
}

describe('google photo cache', () => {
  it('downloads photos into a hashed directory and serves them from that cache', async () => {
    const { dataDir, cache, net } = await setup(albumPage(['AF1QipPhotoOne', 'AF1QipPhotoTwo']));
    await cache.setUrls([SHARE]);
    await cache.refresh();

    const hash = albumHash(SHARE);
    const names = (await readdir(join(dataDir, hash))).sort();
    expect(names).toEqual(['AF1QipPhotoOne.jpg', 'AF1QipPhotoTwo.jpg']);
    const bytes = await readFile(join(dataDir, hash, 'AF1QipPhotoOne.jpg'));
    expect(bytes.includes(Buffer.from('AF1QipPhotoOne'))).toBe(true);
    expect(net.seen.some((url) => url.endsWith('=w2560'))).toBe(true);
    expect(net.maxInFlight()).toBeLessThanOrEqual(3);
    expect(net.seen.every((url) => (
      url.startsWith('https://photos.app.goo.gl/') || url.startsWith('https://lh3.googleusercontent.com/')
    ))).toBe(true);

    const listed = await cache.listPhotos();
    expect(listed).toHaveLength(2);
    expect(listed[0].url).toContain(`/beacon-api/google-photos/file/${hash}/`);
    expect(listed[0].source).toBe('google_photos');
    const status = await cache.status();
    expect(status.refreshHours).toBe(6);
    expect(status.albums[0].count).toBe(2);
    expect(status.albums[0].lastError).toBeNull();
    expect(status.albums[0].title).toBe('Picnic');
  });

  it('drops a photo that left the album on the next successful refresh', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-photos-'));
    const first = fakeFetch({ html: albumPage(['AF1QipPhotoOne', 'AF1QipPhotoTwo']) });
    const cache = createGooglePhotoCache({ dataDir, fetchImpl: first.fetchImpl });
    await cache.setUrls([SHARE]);
    await cache.refresh();

    const second = fakeFetch({ html: albumPage(['AF1QipPhotoTwo']) });
    const again = createGooglePhotoCache({ dataDir, fetchImpl: second.fetchImpl });
    await again.refresh();

    const hash = albumHash(SHARE);
    expect(await readdir(join(dataDir, hash))).toEqual(['AF1QipPhotoTwo.jpg']);
    expect((await again.listPhotos())).toHaveLength(1);
  });

  it('keeps the last good cache when the album page cannot be fetched', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-photos-'));
    const first = fakeFetch({ html: albumPage(['AF1QipPhotoOne']) });
    const cache = createGooglePhotoCache({ dataDir, fetchImpl: first.fetchImpl });
    await cache.setUrls([SHARE]);
    await cache.refresh();
    const before = await cache.status();

    const failed = createGooglePhotoCache({
      dataDir,
      fetchImpl: fakeFetch({ html: albumPage(['AF1QipPhotoOne']), fail: true }).fetchImpl,
    });
    await failed.refresh();

    const hash = albumHash(SHARE);
    expect(await readdir(join(dataDir, hash))).toEqual(['AF1QipPhotoOne.jpg']);
    const after = await failed.status();
    expect(after.albums[0].warning).toBe(true);
    expect(after.albums[0].lastError).toBe('fetch_failed');
    expect(after.albums[0].lastSuccess).toBe(before.albums[0].lastSuccess);
    expect(after.albums[0].count).toBe(1);
    expect((await failed.listPhotos())).toHaveLength(1);
  });

  it('keeps the last good cache when the page no longer parses', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-photos-'));
    const cache = createGooglePhotoCache({
      dataDir,
      fetchImpl: fakeFetch({ html: albumPage(['AF1QipPhotoOne']) }).fetchImpl,
    });
    await cache.setUrls([`${SHARE}`]);
    await cache.refresh();

    const broken = createGooglePhotoCache({
      dataDir,
      fetchImpl: fakeFetch({ html: '<html><body>changed</body></html>' }).fetchImpl,
    });
    await broken.refresh();
    const status = await broken.status();
    expect(status.albums[0].lastError).toBe('parse_failed');
    expect(status.albums[0].count).toBe(1);
    expect(await readdir(join(dataDir, albumHash(SHARE)))).toEqual(['AF1QipPhotoOne.jpg']);
  });

  it('rejects a file name that escapes the cache directory', async () => {
    const { cache } = await setup(albumPage(['AF1QipPhotoOne']));
    await cache.setUrls([SHARE]);
    await cache.refresh();
    const hash = albumHash(SHARE);
    expect(await cache.resolveFile(hash, '../index.json')).toBeNull();
    expect(await cache.resolveFile('../etc', 'passwd')).toBeNull();
    expect(await cache.resolveFile(hash, 'AF1QipPhotoOne.jpg')).toContain(hash);
  });

  it('refuses album urls that are not Google Photos share links', async () => {
    const { cache } = await setup(albumPage(['AF1QipPhotoOne']));
    await expect(cache.setUrls(['https://evil.example/album'])).rejects.toMatchObject({ code: 'invalid_url' });
  });
});
