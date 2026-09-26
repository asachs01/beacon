import { useState, useEffect, useCallback, useRef } from 'react';
import { Photo, PhotoEntry, PhotoSource } from '../types/photos';
import { listPhotos, resolvePhotoUrl, forgetPhotoUrl, PHOTO_LIST_TTL_MS } from '../api/photos';

interface UsePhotosOptions {
  /** When false, nothing is browsed, resolved or cycled. Default true. */
  enabled?: boolean;
}

interface UsePhotosReturn {
  /** The photo to show, once its URL is resolved. */
  currentPhoto: Photo | null;
  /** The photo after it, once resolved — for preloading. */
  upcomingPhoto: Photo | null;
  nextPhoto: () => void;
  previousPhoto: () => void;
  isActive: boolean;
  setActive: (active: boolean) => void;
  /** Call when a photo's URL failed to load: it's resolved again, once. */
  reportLoadError: (url: string) => void;
  photoCount: number;
  currentIndex: number;
}

const DEFAULT_INTERVAL = 30; // seconds
/** Try again this soon when no photos came back (e.g. HA was restarting). */
const EMPTY_RETRY_MS = 60 * 1000;
/** A photo that fails to load is resolved again at most this often. */
const LOAD_RETRY_GAP_MS = 60 * 60 * 1000;

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

function sameIds(a: PhotoEntry[], b: PhotoEntry[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((p) => p.id));
  return b.every((p) => ids.has(p.id));
}

interface Slideshow {
  entries: PhotoEntry[];
  index: number;
}

/**
 * A shuffled slideshow of the photos in HA's media folders.
 *
 * The folder list is shared (see listPhotos) and refreshed hourly, and
 * only the current and next photos' URLs are resolved — just before
 * they're needed — rather than every photo up front.
 */
export function usePhotos(
  sources: PhotoSource[] = ['ha_media', 'local'],
  intervalSeconds: number = DEFAULT_INTERVAL,
  { enabled = true }: UsePhotosOptions = {},
): UsePhotosReturn {
  const [show, setShow] = useState<Slideshow>({ entries: [], index: 0 });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [retries, setRetries] = useState(0);
  const [isActive, setActive] = useState(true);
  const lastRetry = useRef(new Map<string, number>());
  const urlsRef = useRef(urls);
  useEffect(() => { urlsRef.current = urls; }, [urls]);
  const sourcesKey = sources.join(',');

  // Load the photo list, and look for new photos every hour.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      listPhotos(sourcesKey.split(',') as PhotoSource[]).then((entries) => {
        if (cancelled) return;
        setShow((prev) => {
          if (sameIds(prev.entries, entries)) return prev;
          // New shuffle, keeping the photo on screen where it is.
          const shuffled = shuffle([...entries]);
          const currentId = prev.entries[prev.index]?.id;
          const index = Math.max(0, shuffled.findIndex((p) => p.id === currentId));
          return { entries: shuffled, index };
        });
        timer = setTimeout(load, entries.length ? PHOTO_LIST_TTL_MS : EMPTY_RETRY_MS);
      }).catch(console.error);
    };
    load();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, sourcesKey]);

  const { entries, index } = show;
  const current = entries[index] ?? null;
  const upcoming = entries.length > 1 ? entries[(index + 1) % entries.length] : null;
  const currentId = current?.id;
  const upcomingId = upcoming?.id;

  // Resolve just the current and next photos' URLs.
  useEffect(() => {
    if (!enabled || !currentId) return;
    let cancelled = false;
    const wanted = upcomingId ? [currentId, upcomingId] : [currentId];

    for (const id of wanted) {
      resolvePhotoUrl(id).then((url) => {
        if (cancelled || !url) return;
        setUrls((prev) => {
          if (prev[id] === url && Object.keys(prev).every((k) => wanted.includes(k))) return prev;
          const next: Record<string, string> = {};
          for (const k of wanted) if (prev[k]) next[k] = prev[k];
          next[id] = url;
          return next;
        });
      }).catch(console.error);
    }

    return () => { cancelled = true; };
  }, [enabled, currentId, upcomingId, retries]);

  // Auto-cycle timer
  useEffect(() => {
    if (!enabled || !isActive || entries.length < 2) return;

    // setInterval runs a delay of 0 or less every few milliseconds, which
    // flickers through the whole library (e.g. from imported settings).
    const seconds = intervalSeconds > 0 ? intervalSeconds : DEFAULT_INTERVAL;
    const timer = setInterval(() => {
      setShow((prev) => ({ ...prev, index: (prev.index + 1) % prev.entries.length }));
    }, seconds * 1000);

    return () => clearInterval(timer);
  }, [enabled, isActive, entries.length, intervalSeconds]);

  const nextPhoto = useCallback(() => {
    setShow((prev) => (prev.entries.length === 0
      ? prev
      : { ...prev, index: (prev.index + 1) % prev.entries.length }));
  }, []);

  const previousPhoto = useCallback(() => {
    setShow((prev) => (prev.entries.length === 0
      ? prev
      : { ...prev, index: (prev.index - 1 + prev.entries.length) % prev.entries.length }));
  }, []);

  // A URL that fails to load has most likely expired: resolve it again.
  // A photo that fails again soon after is left blank, not retried.
  const reportLoadError = useCallback((url: string) => {
    const id = Object.keys(urlsRef.current).find((k) => urlsRef.current[k] === url);
    if (!id) return;
    const last = lastRetry.current.get(id);
    if (last !== undefined && Date.now() - last < LOAD_RETRY_GAP_MS) return;
    lastRetry.current.set(id, Date.now());
    forgetPhotoUrl(id, url);
    setUrls((prev) => {
      if (prev[id] !== url) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setRetries((n) => n + 1);
  }, []);

  const toPhoto = (entry: PhotoEntry | null): Photo | null => {
    const url = entry && urls[entry.id];
    return entry && url ? { url, caption: entry.caption, source: entry.source } : null;
  };

  return {
    currentPhoto: toPhoto(current),
    upcomingPhoto: toPhoto(upcoming),
    nextPhoto,
    previousPhoto,
    isActive,
    setActive,
    reportLoadError,
    photoCount: entries.length,
    currentIndex: index,
  };
}
