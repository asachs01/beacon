import { useState, useEffect, useCallback, useRef } from 'react';
import { getConfig } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PhotoSourceType = 'google_photos' | 'immich' | 'local' | 'none';

interface PhotoSourceConfig {
  source: PhotoSourceType;
  immichUrl: string;
  immichApiKey: string;
  intervalSeconds: number;
}

interface UsePhotoSourceReturn {
  currentPhoto: string | null;
  nextPhoto: () => void;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

const { ha_url: HA_URL, ha_token: HA_TOKEN } = getConfig();

function haBaseUrl(): string {
  return HA_URL.replace(/\/$/, '');
}

/**
 * Google Photos via HA media_source browse API.
 * Browses `media-source://google_photos` and returns image URLs.
 */
async function fetchGooglePhotosViaHA(): Promise<string[]> {
  if (!HA_TOKEN) return [];

  try {
    const base = haBaseUrl();
    const res = await fetch(`${base}/api/media_source/browse_media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ media_content_id: 'media-source://google_photos' }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const children: Array<{
      media_content_id: string;
      title: string;
      media_content_type: string;
      thumbnail?: string;
    }> = data.children || [];

    return children
      .filter((item) => item.media_content_type?.startsWith('image'))
      .map((item) => {
        // HA serves media_source thumbnails through a proxy URL
        const contentId = encodeURIComponent(item.media_content_id);
        return `${base}/api/media_source/local/${contentId}`;
      });
  } catch {
    console.warn('Beacon: Failed to fetch Google Photos via HA');
    return [];
  }
}

/**
 * Immich — fetches a random asset URL.
 * GET {immichUrl}/api/assets/random with x-api-key header.
 */
async function fetchImmichPhoto(immichUrl: string, apiKey: string): Promise<string | null> {
  if (!immichUrl || !apiKey) return null;

  try {
    const base = immichUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/api/assets/random?count=1`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const assets: Array<{ id: string; type: string }> = Array.isArray(data) ? data : [data];
    const imageAsset = assets.find((a) => a.type === 'IMAGE') || assets[0];

    if (!imageAsset?.id) return null;

    // Immich serves the full image at /api/assets/:id/thumbnail?size=preview
    return `${base}/api/assets/${imageAsset.id}/thumbnail?size=preview&api_key=${apiKey}`;
  } catch {
    console.warn('Beacon: Failed to fetch Immich photo');
    return null;
  }
}

/**
 * Local directory — fetches photos from HA media directory.
 */
async function fetchLocalPhotos(): Promise<string[]> {
  if (!HA_TOKEN) return [];

  const config = getConfig();
  const photosPath = config.photo_directory;

  try {
    const base = haBaseUrl();
    const res = await fetch(
      `${base}/api/media_source/browse_media?media_content_id=${encodeURIComponent(photosPath)}`,
      {
        headers: {
          Authorization: `Bearer ${HA_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!res.ok) return [];

    const data = await res.json();
    const children: Array<{
      media_content_id: string;
      media_content_type: string;
    }> = data.children || [];

    return children
      .filter((item) => item.media_content_type?.startsWith('image'))
      .map((item) => `${base}/api/media_source/local/${item.media_content_id}`);
  } catch {
    console.warn('Beacon: Failed to fetch local photos');
    return [];
  }
}

// ---------------------------------------------------------------------------
// Shuffle utility
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePhotoSource(config: PhotoSourceConfig): UsePhotoSourceReturn {
  const { source, immichUrl, immichApiKey, intervalSeconds } = config;

  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // For google_photos and local, we fetch a list once and rotate through it.
  // For immich, we fetch a new random photo each time.
  const photoListRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNextPhoto = useCallback(async () => {
    if (source === 'none') {
      setCurrentPhoto(null);
      return;
    }

    if (source === 'immich') {
      const url = await fetchImmichPhoto(immichUrl, immichApiKey);
      if (url) {
        // Preload image before showing it
        const img = new Image();
        img.src = url;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
        setCurrentPhoto(url);
      }
      return;
    }

    // google_photos or local: pick a random photo from the cached list
    const list = photoListRef.current;
    if (list.length === 0) return;

    const url = pickRandom(list);
    if (url) {
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
      setCurrentPhoto(url);
    }
  }, [source, immichUrl, immichApiKey]);

  // Initial load: fetch photo list for google_photos / local
  useEffect(() => {
    if (source === 'none') {
      setCurrentPhoto(null);
      photoListRef.current = [];
      return;
    }

    if (source === 'immich') {
      // For immich, just fetch the first photo
      setLoading(true);
      fetchImmichPhoto(immichUrl, immichApiKey).then((url) => {
        setCurrentPhoto(url);
        setLoading(false);
      });
      return;
    }

    // Fetch photo list for google_photos or local
    setLoading(true);
    const fetcher = source === 'google_photos' ? fetchGooglePhotosViaHA : fetchLocalPhotos;
    fetcher().then((photos) => {
      photoListRef.current = photos;
      if (photos.length > 0) {
        setCurrentPhoto(pickRandom(photos) || null);
      }
      setLoading(false);
    });
  }, [source, immichUrl, immichApiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-rotate on interval
  useEffect(() => {
    if (source === 'none') return;

    timerRef.current = setInterval(() => {
      fetchNextPhoto();
    }, intervalSeconds * 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [source, intervalSeconds, fetchNextPhoto]);

  const nextPhoto = useCallback(() => {
    fetchNextPhoto();
  }, [fetchNextPhoto]);

  return {
    currentPhoto,
    nextPhoto,
    loading,
  };
}
