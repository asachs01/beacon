import { PhotoEntry, PhotoSource } from '../types/photos';
import { getConfig } from '../config';
import { hasToken, callBeaconAction } from './ha-rest';
import { isAddOn } from '../utils/ha-env';
import { loadDataSync } from './beacon-store';

/**
 * Settings > Photos > Source Directory (this display's copy of the
 * settings), else the `photo_directory` add-on option. The setting used to
 * be ignored: the option was read once, at startup.
 */
function photoDirectory(): string {
  const chosen = loadDataSync<{ photoDirectory?: string } | null>('beacon-settings', null)?.photoDirectory?.trim();
  return chosen || getConfig().photo_directory;
}

/**
 * How long a browsed photo list is reused. Shared by everything showing
 * photos (the Photos screen and the screensaver), so opening Photos or the
 * screensaver starting doesn't browse the media folders again.
 */
export const PHOTO_LIST_TTL_MS = 60 * 60 * 1000;

/**
 * How long a resolved photo URL is reused. resolve_media signs URLs for
 * CONTENT_AUTH_EXPIRY_TIME (24h, homeassistant/components/media_player/
 * const.py), so they're re-resolved well before they stop working.
 */
export const PHOTO_URL_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Converts a plain filesystem-style path (e.g. "/media/beacon/photos", as
 * configured via the `photo_directory` add-on option) into the
 * `media-source://` content id HA's browse_media/resolve_media APIs
 * actually expect. Leaves already-qualified media-source ids untouched.
 */
function toMediaContentId(path: string): string {
  if (!path) return 'media-source://media_source/local';
  if (path.startsWith('media-source://')) return path;

  const trimmed = path.replace(/^\/+|\/+$/g, ''); // strip leading/trailing slashes
  const withoutMediaPrefix = trimmed.replace(/^media\/?/, ''); // "media/beacon/photos" -> "beacon/photos"

  return withoutMediaPrefix
    ? `media-source://media_source/local/${withoutMediaPrefix}`
    : 'media-source://media_source/local';
}

/**
 * Resolves a browsable media_content_id to a playable/signed URL suitable
 * for an <img src>. browse_media only returns metadata — the actual
 * (possibly auth-signed) URL comes from resolve_media.
 *
 * media_source/resolve_media has no REST endpoint in HA core — it's
 * WebSocket-only (see homeassistant/components/media_source/__init__.py,
 * websocket_resolve_media). In add-on mode we bridge through server.js's
 * /beacon-action/media-source, which opens a short-lived authenticated WS
 * connection. Standalone mode isn't wired up yet (would need access to the
 * shared HomeAssistantClient WS connection) and returns null.
 */
async function resolveImageUrl(mediaContentId: string): Promise<string | null> {
  if (!isAddOn()) return null;

  try {
    const resolved = await callBeaconAction('/beacon-action/media-source', {
      op: 'resolve',
      media_content_id: mediaContentId,
    }) as { result?: { url?: string } };

    const url = resolved?.result?.url;
    if (!url) return null;

    // resolve_media returns a relative, signed path
    // (e.g. "/media/local/...?authSig=..."). This must NOT be routed
    // through server.js's Supervisor-token proxy (http://supervisor/core/*)
    // — that internal proxy blocks /media/* regardless of auth headers
    // (Supervisor restricts which Core paths it forwards for add-on
    // tokens). Instead, since the ingress iframe is same-origin as HA's
    // own web server, fetch it directly from the top-level origin — the
    // authSig query param is a self-contained signature that HA's own
    // server accepts with no further auth, exactly like its own frontend
    // does for media thumbnails.
    if (/^https?:\/\//.test(url)) return url;
    try {
      const topOrigin = window.parent !== window ? window.parent.location.origin : window.location.origin;
      return `${topOrigin}${url}`;
    } catch {
      // Cross-origin parent (shouldn't happen for same-host ingress, but
      // fall back to same-window origin rather than throwing).
      return `${window.location.origin}${url}`;
    }
  } catch {
    return null;
  }
}

/**
 * Browses a media_content_id and lists its image children. Doesn't
 * resolve them — that's done per photo, just before it's shown.
 * Rejects if the browse fails, so a failed browse isn't cached.
 *
 * media_source/browse_media has no REST endpoint either — same WS-only
 * situation as resolve_media above.
 */
async function browsePhotos(mediaContentId: string, source: PhotoSource): Promise<PhotoEntry[]> {
  if (!hasToken()) return [];
  if (!isAddOn()) return []; // standalone WS media browsing not yet implemented

  try {
    const browsed = await callBeaconAction('/beacon-action/media-source', {
      op: 'browse',
      media_content_id: mediaContentId,
    }) as {
      result?: {
        children?: Array<{
          media_content_id: string;
          title: string;
          media_content_type: string;
        }>;
      };
    };

    const children = browsed?.result?.children || [];
    return children
      .filter((item) => item.media_content_type?.startsWith('image') && item.media_content_id)
      .map((item) => ({ id: item.media_content_id, caption: item.title || undefined, source }));
  } catch (err) {
    console.warn(`Beacon: Failed to fetch photos from ${mediaContentId}`);
    throw err;
  }
}

let listCache: { key: string; at: number; entries: Promise<PhotoEntry[]> } | null = null;

/**
 * Every photo in the configured sources (HA's local media root and the
 * photo folder, see photoDirectory), in folder order. Browsed once and shared for
 * PHOTO_LIST_TTL_MS; a list that came back empty or incomplete because a
 * browse failed isn't kept, so the next call tries again.
 */
export function listPhotos(sources: PhotoSource[] = ['ha_media', 'local']): Promise<PhotoEntry[]> {
  const folder = photoDirectory();
  // With the folder, so a different one chosen in Settings is browsed at once.
  const key = `${[...sources].sort().join(',')}|${folder}`;
  if (listCache && listCache.key === key && Date.now() - listCache.at < PHOTO_LIST_TTL_MS) {
    return listCache.entries;
  }

  const browses: Promise<PhotoEntry[]>[] = [];
  if (sources.includes('ha_media')) {
    browses.push(browsePhotos('media-source://media_source/local', 'ha_media'));
  }
  if (sources.includes('local')) {
    browses.push(browsePhotos(toMediaContentId(folder), 'local'));
  }
  // google_photos would require OAuth — not implemented yet

  const entry = {
    key,
    at: Date.now(),
    entries: Promise.allSettled(browses).then((results) => {
      const seen = new Set<string>();
      const entries: PhotoEntry[] = [];
      let failed = false;
      for (const result of results) {
        if (result.status === 'rejected') { failed = true; continue; }
        for (const photo of result.value) {
          // Both sources point at the same folder when photo_directory is
          // the media root; list each photo once.
          if (seen.has(photo.id)) continue;
          seen.add(photo.id);
          entries.push(photo);
        }
      }
      if ((failed || entries.length === 0) && listCache === entry) listCache = null;
      return entries;
    }),
  };
  listCache = entry;
  return entry.entries;
}

const urlCache = new Map<string, { at: number; url: Promise<string | null>; value?: string | null }>();

/**
 * A displayable URL for one photo. Resolved on first use and reused for
 * PHOTO_URL_MAX_AGE_MS; callers asking at the same time share one resolve.
 * A failed resolve (null) isn't kept.
 */
export function resolvePhotoUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached && Date.now() - cached.at < PHOTO_URL_MAX_AGE_MS) return cached.url;

  const entry: { at: number; url: Promise<string | null>; value?: string | null } = {
    at: Date.now(),
    url: resolveImageUrl(id).then((url) => {
      entry.value = url;
      if (!url && urlCache.get(id) === entry) urlCache.delete(id);
      return url;
    }),
  };
  urlCache.set(id, entry);
  return entry.url;
}

/**
 * Drops a photo's resolved URL (e.g. after it failed to load), so the next
 * resolvePhotoUrl() asks HA again. Only drops `url` if that's still the
 * cached one — not a newer resolve that's already replaced it.
 */
export function forgetPhotoUrl(id: string, url: string): void {
  if (urlCache.get(id)?.value === url) urlCache.delete(id);
}

/** Forget all cached photo lists and URLs (for tests). */
export function clearPhotoCaches(): void {
  listCache = null;
  urlCache.clear();
}
