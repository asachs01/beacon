import { getIngressBasePath, isAddOn } from '../utils/ha-env';

export interface GoogleAlbumStatus {
  url: string;
  hash: string;
  title: string | null;
  count: number;
  lastSuccess: string | null;
  lastError: 'fetch_failed' | 'parse_failed' | 'partial' | null;
  warning: boolean;
}

export interface GooglePhotoStatus {
  refreshHours: number;
  refreshing: boolean;
  albums: GoogleAlbumStatus[];
}

function apiUrl(path: string): string {
  const base = isAddOn() ? getIngressBasePath() : '';
  return `${base}${path}`;
}

/** Public share links only. The add-on rejects anything else. */
export function isGoogleShareUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.hostname === 'photos.app.goo.gl') {
    return /^\/[A-Za-z0-9_-]{4,}\/?$/.test(url.pathname);
  }
  if (url.hostname === 'photos.google.com') {
    return /^\/share\/[A-Za-z0-9_-]{4,}\/?$/.test(url.pathname);
  }
  return false;
}

export async function loadGoogleAlbums(): Promise<GooglePhotoStatus | null> {
  try {
    const res = await fetch(apiUrl('/beacon-api/google-photos'));
    if (!res.ok) return null;
    return await res.json() as GooglePhotoStatus;
  } catch {
    return null;
  }
}

export async function saveGoogleAlbums(urls: string[]): Promise<GooglePhotoStatus | null> {
  const res = await fetch(apiUrl('/beacon-api/google-photos'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  if (res.status === 400) {
    const error = new Error('invalid');
    (error as Error & { code?: string }).code = 'invalid_url';
    throw error;
  }
  if (!res.ok) return null;
  return await res.json() as GooglePhotoStatus;
}

export async function refreshGoogleAlbums(): Promise<GooglePhotoStatus | null> {
  try {
    const res = await fetch(apiUrl('/beacon-api/google-photos/refresh'), { method: 'POST' });
    if (!res.ok) return null;
    return await res.json() as GooglePhotoStatus;
  } catch {
    return null;
  }
}
