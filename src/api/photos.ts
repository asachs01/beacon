import { Photo } from '../types/photos';
import { getConfig } from '../config';
import { haFetch, hasToken } from './ha-rest';

const { photo_directory: PHOTOS_PATH } = getConfig();

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
  const relative = path.replace(/^\/?media\/?/, '').replace(/\/$/, '');
  return relative
    ? `media-source://media_source/local/${relative}`
    : 'media-source://media_source/local';
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
async function fetchLocalPhotos(): Promise<Photo[]> {
  return browseAndResolvePhotos(toMediaSourceId(PHOTOS_PATH), 'local');
}

/**
 * Gets all photos from configured sources, shuffled.
 */
export async function getPhotos(
  sources: Array<'local' | 'google_photos' | 'ha_media'> = ['ha_media', 'local'],
): Promise<Photo[]> {
  const fetchers: Promise<Photo[]>[] = [];

  if (sources.includes('ha_media')) {
    fetchers.push(fetchHAMediaPhotos());
  }
  if (sources.includes('local')) {
    fetchers.push(fetchLocalPhotos());
  }
  // google_photos would require OAuth — not implemented yet

  const results = await Promise.all(fetchers);
  const allPhotos = results.flat();

  return shuffle(allPhotos);
}
