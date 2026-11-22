import { Photo } from '../types/photos';
import { getConfig } from '../config';
import { haFetch, hasToken } from './ha-rest';
import { DEMO_PHOTOS } from '../demo/fixtures';
import { getIngressBasePath, isAddOn } from '../utils/ha-env';

/**
 * Shuffles an array in place using Fisher-Yates.
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Converts a filesystem-style config path (e.g. "/media/beacon/photos") into
 * the media-source:// content id browse_media actually expects. HA's local
 * media root IS /media, so the id is everything after that prefix.
 */
function toMediaSourceId(path: string): string {
  const trimmed = path.trim();
  // A media-source id can point at any Home Assistant source, not only /media.
  if (trimmed.startsWith('media-source://')) return trimmed;
  const relative = trimmed.replace(/^\/?media\/?/, '').replace(/\/$/, '');
  return relative
    ? `media-source://media_source/local/${relative}`
    : 'media-source://media_source/local';
}

function photoRoot(photoDirectory?: string): string {
  const override = photoDirectory?.trim();
  if (override) return override;
  return getConfig().photo_directory || '/media/beacon/photos';
}

interface BrowseMediaChild {
  media_content_id: string;
  title: string;
  media_content_type: string;
}

interface BrowseMediaResponse {
  children?: BrowseMediaChild[];
}

interface ResolveMediaResponse {
  url: string;
  mime_type?: string;
}

/**
 * Resolves a media_content_id to a signed, playable URL via HA's
 * resolve_media endpoint — the hand-built /api/media_source/local/<id> URL
 * used previously isn't a real HA endpoint.
 */
async function resolvePhotoUrl(mediaContentId: string): Promise<string | null> {
  try {
    const resolved = (await haFetch(
      `/api/media_source/resolve_media/${encodeURIComponent(mediaContentId)}`,
    )) as ResolveMediaResponse;
    return resolved?.url ?? null;
  } catch {
    return null;
  }
}

async function browseAndResolvePhotos(
  mediaContentId: string | null,
  source: 'local' | 'ha_media',
): Promise<Photo[]> {
  if (!hasToken()) return [];

  try {
    const path = mediaContentId
      ? `/api/media_source/browse_media/${encodeURIComponent(mediaContentId)}`
      : '/api/media_source/browse_media';
    const data = (await haFetch(path)) as BrowseMediaResponse;
    const children = data.children || [];

    const images = children.filter((item) => item.media_content_type?.startsWith('image'));

    const resolved = await Promise.all(
      images.map(async (item): Promise<Photo | null> => {
        const url = await resolvePhotoUrl(item.media_content_id);
        if (!url) return null;
        return { url, caption: item.title, source };
      }),
    );

    return resolved.filter((photo): photo is Photo => photo !== null);
  } catch {
    console.warn(`Beacon: Failed to fetch ${source} photos`);
    return [];
  }
}

/**
 * Fetches photos from HA's media browser root.
 */
async function fetchHAMediaPhotos(): Promise<Photo[]> {
  return browseAndResolvePhotos(null, 'ha_media');
}

/**
 * Fetches photos from the configured local directory, served via HA's
 * media source (converted from the filesystem-style photo_directory path).
 */
async function fetchLocalPhotos(photoDirectory?: string): Promise<Photo[]> {
  return browseAndResolvePhotos(toMediaSourceId(photoRoot(photoDirectory)), 'local');
}

/**
 * Photos already downloaded from link-shared Google Photos albums.
 * The browser never talks to Google; server.js serves the local cache.
 */
async function fetchCachedGooglePhotos(): Promise<Photo[]> {
  try {
    const base = isAddOn() ? getIngressBasePath() : '';
    const res = await fetch(`${base}/beacon-api/google-photos/photos`);
    if (!res.ok) return [];
    const data = await res.json() as { photos?: Array<{ url?: string; caption?: string }> };
    const photos = Array.isArray(data?.photos) ? data.photos : [];
    return photos.flatMap((photo): Photo[] => {
      if (!photo.url) return [];
      const url = photo.url.startsWith('http') ? photo.url : `${base}${photo.url}`;
      return [{ url, caption: photo.caption, source: 'google_photos' }];
    });
  } catch {
    return [];
  }
}

/**
 * Gets all photos from configured sources, shuffled.
 */
export async function getPhotos(
  sources: Array<'local' | 'google_photos' | 'ha_media'> = ['ha_media', 'local', 'google_photos'],
  photoDirectory?: string,
): Promise<Photo[]> {
  if (import.meta.env.VITE_DEMO === 'true') return DEMO_PHOTOS;

  const fetchers: Promise<Photo[]>[] = [];

  if (sources.includes('ha_media')) {
    fetchers.push(fetchHAMediaPhotos());
  }
  if (sources.includes('local')) {
    fetchers.push(fetchLocalPhotos(photoDirectory));
  }
  if (sources.includes('google_photos')) {
    fetchers.push(fetchCachedGooglePhotos());
  }

  const results = await Promise.all(fetchers);
  const allPhotos = results.flat();

  return shuffle(allPhotos);
}
