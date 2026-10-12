import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPhotos } from './photos';
import { haFetch, hasToken } from './ha-rest';

vi.mock('./ha-rest', () => ({
  haFetch: vi.fn(),
  hasToken: vi.fn(),
}));

vi.mock('../config', () => ({
  getConfig: () => ({ photo_directory: '/media/beacon/photos' }),
}));

const mockHaFetch = vi.mocked(haFetch);
const mockHasToken = vi.mocked(hasToken);

describe('getPhotos', () => {
  beforeEach(() => {
    mockHaFetch.mockReset();
    mockHasToken.mockReset();
  });

  it('returns no photos when there is no way to authenticate (not add-on, no token)', async () => {
    mockHasToken.mockReturnValue(false);

    const photos = await getPhotos(['local']);

    expect(photos).toEqual([]);
    expect(mockHaFetch).not.toHaveBeenCalled();
  });

  it('browses the configured photo_directory as a media-source:// id, not the raw filesystem path', async () => {
    mockHasToken.mockReturnValue(true);
    mockHaFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/media_source/browse_media/')) {
        return {
          children: [
            { media_content_id: 'media-source://media_source/local/beacon/photos/a.jpg', title: 'a', media_content_type: 'image/jpeg' },
          ],
        };
      }
      if (path.startsWith('/api/media_source/resolve_media/')) {
        return { url: '/api/media_source/local/signed-a', mime_type: 'image/jpeg' };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const photos = await getPhotos(['local']);

    const browseCall = mockHaFetch.mock.calls.find(([p]) => p.includes('browse_media'));
    expect(browseCall?.[0]).toBe(
      `/api/media_source/browse_media/${encodeURIComponent('media-source://media_source/local/beacon/photos')}`,
    );
    expect(photos).toEqual([
      { url: '/api/media_source/local/signed-a', caption: 'a', source: 'local' },
    ]);
  });

  it('resolves each image to a signed URL instead of hand-building one', async () => {
    mockHasToken.mockReturnValue(true);
    mockHaFetch.mockImplementation(async (path: string) => {
      if (path.includes('browse_media')) {
        return {
          children: [
            { media_content_id: 'id-1', title: 'one', media_content_type: 'image/jpeg' },
            { media_content_id: 'id-2', title: 'two', media_content_type: 'image/png' },
          ],
        };
      }
      if (path === `/api/media_source/resolve_media/${encodeURIComponent('id-1')}`) {
        return { url: 'https://ha.local/signed-1' };
      }
      if (path === `/api/media_source/resolve_media/${encodeURIComponent('id-2')}`) {
        return { url: 'https://ha.local/signed-2' };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const photos = await getPhotos(['local']);

    expect(photos.map((p) => p.url).sort()).toEqual([
      'https://ha.local/signed-1',
      'https://ha.local/signed-2',
    ]);
  });

  it('filters out non-image children and drops photos whose resolve_media call fails', async () => {
    mockHasToken.mockReturnValue(true);
    mockHaFetch.mockImplementation(async (path: string) => {
      if (path.includes('browse_media')) {
        return {
          children: [
            { media_content_id: 'ok', title: 'ok', media_content_type: 'image/jpeg' },
            { media_content_id: 'broken', title: 'broken', media_content_type: 'image/jpeg' },
            { media_content_id: 'folder', title: 'folder', media_content_type: 'directory' },
          ],
        };
      }
      if (path === `/api/media_source/resolve_media/${encodeURIComponent('ok')}`) {
        return { url: 'https://ha.local/ok' };
      }
      if (path === `/api/media_source/resolve_media/${encodeURIComponent('broken')}`) {
        throw new Error('resolve failed');
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const photos = await getPhotos(['local']);

    expect(photos).toEqual([{ url: 'https://ha.local/ok', caption: 'ok', source: 'local' }]);
  });

  it('does not blow up the whole call when browse_media itself fails', async () => {
    mockHasToken.mockReturnValue(true);
    mockHaFetch.mockRejectedValue(new Error('network error'));

    const photos = await getPhotos(['local']);

    expect(photos).toEqual([]);
  });
});
