import { Photo } from '../types/photos';
import { getConfig } from '../config';

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
 * Fetches photos from HA media browser API.
 */
async function fetchHAMediaPhotos(): Promise<Photo[]> {
  const { ha_url, ha_token } = getConfig();
  if (!ha_token) return [];

  try {
    const baseUrl = ha_url.replace(/\/$/, '');
    const response = await fetch(
      `${baseUrl}/api/media_source/browse_media`,
      {
        headers: {
          Authorization: `Bearer ${ha_token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) return [];

    const data = await response.json();
    const children: Array<{
      media_content_id: string;
      title: string;
      media_content_type: string;
      thumbnail?: string;
    }> = data.children || [];

    return children
      .filter((item) => item.media_content_type?.startsWith('image'))
      .map((item) => ({
        url: `${baseUrl}/api/media_source/local/${item.media_content_id}`,
        caption: item.title,
        source: 'ha_media' as const,
      }));
  } catch {
    console.warn('Beacon: Failed to fetch HA media photos');
    return [];
  }
}

/**
 * Fetches photos from a local directory served by HA.
 */
async function fetchLocalPhotos(): Promise<Photo[]> {
  const { ha_url, ha_token, photo_directory } = getConfig();
  if (!ha_token) return [];

  try {
    const baseUrl = ha_url.replace(/\/$/, '');
    const response = await fetch(
      `${baseUrl}/api/media_source/browse_media?media_content_id=${encodeURIComponent(photo_directory)}`,
      {
        headers: {
          Authorization: `Bearer ${ha_token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) return [];

    const data = await response.json();
    const children: Array<{
      media_content_id: string;
      title: string;
      media_content_type: string;
    }> = data.children || [];

    return children
      .filter((item) => item.media_content_type?.startsWith('image'))
      .map((item) => ({
        url: `${baseUrl}/api/media_source/local/${item.media_content_id}`,
        caption: item.title,
        source: 'local' as const,
      }));
  } catch {
    console.warn('Beacon: Failed to fetch local photos');
    return [];
  }
}

/**
 * Gets all photos from configured sources, shuffled.
 */
export async function getPhotos(sources: Array<'local' | 'google_photos' | 'ha_media'> = ['ha_media', 'local']): Promise<Photo[]> {
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
