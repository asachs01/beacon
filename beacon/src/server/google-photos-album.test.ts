import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  albumHash,
  buildBatchexecuteRequest,
  isAllowedShareUrl,
  parseBatchexecutePage,
  parseSharedAlbumHtml,
  sizedImageUrl,
} from '../../lib/google-photos-album.cjs';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const albumHtml = readFileSync(join(fixtureDir, 'shared-album.html'), 'utf8');
const batchBody = readFileSync(join(fixtureDir, 'batchexecute-page.txt'), 'utf8');

describe('parseSharedAlbumHtml', () => {
  const parsed = parseSharedAlbumHtml(albumHtml);

  it('reads photos embedded in the shared-album page and skips videos', () => {
    expect(parsed.ok).toBe(true);
    expect(parsed.title).toBe('Harbor Picnic');
    expect(parsed.photos.map((photo: { id: string }) => photo.id)).toEqual([
      'AF1QipPhotoOne',
      'AF1QipPhotoTwo',
    ]);
    expect(parsed.photos[0].url).toBe('https://lh3.googleusercontent.com/pw/photo-one');
    expect(parsed.photos[0].width).toBe(4032);
    expect(parsed.keys).toEqual({ albumKey: 'AlbumKey123', authKey: 'AuthKey456' });
  });

  it('fails closed when the page has no album data', () => {
    const result = parseSharedAlbumHtml('<html><title>Nope</title><body>sign in</body></html>');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('parse_failed');
    expect(result.photos).toEqual([]);
    expect(result.keys).toBeNull();
  });
});

describe('parseBatchexecutePage', () => {
  it('reads the next page from a saved response and skips videos', () => {
    const page = parseBatchexecutePage(batchBody);
    expect(page.ok).toBe(true);
    expect(page.nextPage).toBe('page-2');
    expect(page.photos.map((photo: { id: string }) => photo.id)).toEqual(['AF1QipPhotoThree']);
  });
});

describe('shared album urls', () => {
  it('accepts the two public share link shapes and rejects everything else', () => {
    expect(isAllowedShareUrl('https://photos.app.goo.gl/abc123XYZ')).toBe(true);
    expect(isAllowedShareUrl('https://photos.google.com/share/AlbumKey123?key=AuthKey456')).toBe(true);
    expect(isAllowedShareUrl('http://photos.app.goo.gl/abc123XYZ')).toBe(false);
    expect(isAllowedShareUrl('https://photos.google.com/share/AlbumKey123')).toBe(true);
    expect(isAllowedShareUrl('https://evil.example/share/AlbumKey123')).toBe(false);
    expect(isAllowedShareUrl('https://photos.google.com/u/0/photo/abc123XYZ')).toBe(false);
    expect(isAllowedShareUrl('https://user:pass@photos.app.goo.gl/abc123XYZ')).toBe(false);
  });

  it('hashes the same link to a stable directory name', () => {
    const a = albumHash('https://photos.app.goo.gl/abc123XYZ/');
    const b = albumHash('https://photos.app.goo.gl/abc123XYZ');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{16}$/);
    expect(albumHash('https://photos.app.goo.gl/different1')).not.toBe(a);
  });

  it('caps image width and drops a size suffix already on the url', () => {
    expect(sizedImageUrl('https://lh3.googleusercontent.com/pw/photo-two=w200-h150')).toBe(
      'https://lh3.googleusercontent.com/pw/photo-two=w2560',
    );
    expect(() => sizedImageUrl('https://evil.example/photo.jpg')).toThrow(/Unexpected image host/);
  });

  it('builds the next-page request from keys taken out of the page', () => {
    const request = buildBatchexecuteRequest(parseSharedAlbumHtml(albumHtml).keys, null);
    expect(request.url).toBe(
      'https://photos.google.com/u/0/_/PhotosUi/data/batchexecute?rpcids=snAcKc&source-path=%2Fshare%2FAlbumKey123',
    );
    expect(request.body).toContain('AlbumKey123');
    expect(request.body).toContain('AuthKey456');
    expect(request.url).not.toContain('AuthKey456');
  });
});
