import { useState, useCallback, useRef } from 'react';
import { callHaService } from '../api/ha-rest';
import { getConfig } from '../config';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SearchResultType = 'track' | 'album' | 'artist' | 'playlist' | 'radio';

export interface MusicSearchResult {
  /** Unique id within MA (or media_content_id for HA fallback) */
  uri: string;
  name: string;
  type: SearchResultType;
  artist?: string;
  album?: string;
  image_url?: string;
  duration?: number;
}

export interface QueueItem {
  uri: string;
  name: string;
  artist?: string;
  album?: string;
  image_url?: string;
  duration?: number;
  is_current?: boolean;
}

export interface BrowseItem {
  title: string;
  media_content_id: string;
  media_content_type: string;
  thumbnail?: string;
  can_expand: boolean;
  children?: BrowseItem[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Whether Music Assistant's `mass` domain is available. Cached per session. */
let _massAvailable: boolean | null = null;

async function checkMassAvailable(): Promise<boolean> {
  if (_massAvailable !== null) return _massAvailable;
  try {
    // A lightweight probe: call mass.search with empty query.
    // If the domain doesn't exist HA returns 400/404.
    await callHaService('mass', 'search', { name: '__probe__', limit: 1 }, true);
    _massAvailable = true;
  } catch {
    _massAvailable = false;
  }
  return _massAvailable;
}

function resolveImageUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  const haUrl = getConfig().ha_url.replace(/\/$/, '');
  return `${haUrl}${url}`;
}

/* ------------------------------------------------------------------ */
/*  Parse Music Assistant search response                              */
/* ------------------------------------------------------------------ */

function parseMassResults(data: Record<string, unknown>): MusicSearchResult[] {
  const results: MusicSearchResult[] = [];
  const response = (data as { service_response?: Record<string, unknown> })?.service_response ?? data;

  // MA returns grouped results: tracks, albums, artists, playlists, radio
  const groups: Array<{ key: string; type: SearchResultType }> = [
    { key: 'tracks', type: 'track' },
    { key: 'albums', type: 'album' },
    { key: 'artists', type: 'artist' },
    { key: 'playlists', type: 'playlist' },
    { key: 'radio', type: 'radio' },
  ];

  for (const { key, type } of groups) {
    const items = (response as Record<string, unknown[]>)[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const it = item as Record<string, unknown>;
      results.push({
        uri: (it.uri as string) || (it.media_content_id as string) || '',
        name: (it.name as string) || (it.title as string) || '',
        type,
        artist: (it.artist as string) ||
          ((it.artists as Array<{ name: string }> | undefined)?.[0]?.name) ||
          (it.media_artist as string) ||
          undefined,
        album: (it.album as string) ||
          ((it.album_obj as { name: string } | undefined)?.name) ||
          undefined,
        image_url: resolveImageUrl(
          (it.image_url as string) || (it.thumbnail as string) || (it.entity_picture as string) || null,
        ),
        duration: (it.duration as number) || undefined,
      });
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useMusicSearch(selectedPlayerId: string | null) {
  const [results, setResults] = useState<MusicSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const abortRef = useRef(0);

  /* ---- Search ---- */
  const search = useCallback(async (query: string) => {
    const token = ++abortRef.current;
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const hasMass = await checkMassAvailable();

      if (hasMass) {
        // Use Music Assistant search
        const data = await callHaService('mass', 'search', {
          name: query,
          limit: 25,
        }, true) as Record<string, unknown>;

        if (token !== abortRef.current) return; // stale
        setResults(parseMassResults(data));
      } else {
        // Fallback: no results (basic HA media_player has no search)
        if (token !== abortRef.current) return;
        setResults([]);
      }
    } catch (err) {
      console.warn('Music search failed:', err);
      if (token !== abortRef.current) return;
      setResults([]);
    } finally {
      if (token === abortRef.current) setLoading(false);
    }
  }, []);

  /* ---- Play an item ---- */
  const playItem = useCallback(async (
    uri: string,
    type: SearchResultType,
    enqueue = false,
  ) => {
    if (!selectedPlayerId) return;

    try {
      const hasMass = await checkMassAvailable();

      if (hasMass) {
        await callHaService('mass', 'play_media', {
          entity_id: selectedPlayerId,
          media_id: uri,
          media_type: type,
          enqueue: enqueue ? 'add' : 'play',
        });
      } else {
        // Fallback to standard HA play_media
        await callHaService('media_player', 'play_media', {
          entity_id: selectedPlayerId,
          media_content_id: uri,
          media_content_type: `music`,
          enqueue: enqueue ? 'add' : 'play',
        });
      }
    } catch (err) {
      console.warn('Play item failed:', err);
    }
  }, [selectedPlayerId]);

  /* ---- Fetch queue from player attributes ---- */
  const refreshQueue = useCallback(async () => {
    if (!selectedPlayerId) {
      setQueue([]);
      return;
    }

    try {
      const hasMass = await checkMassAvailable();
      if (!hasMass) {
        setQueue([]);
        return;
      }

      // MA exposes queue via mass.get_queue or the player's queue_items attribute.
      // Try the service first.
      const data = await callHaService('mass', 'get_queue', {
        entity_id: selectedPlayerId,
      }, true) as Record<string, unknown>;

      const response = (data as { service_response?: Record<string, unknown> })?.service_response ?? data;
      const resp = response as Record<string, unknown>;
      const playerResp = resp[selectedPlayerId] as Record<string, unknown> | undefined;
      const items = (resp?.items ?? playerResp?.items ?? []) as unknown[];

      if (Array.isArray(items)) {
        setQueue(items.map((raw: unknown, idx: number) => {
          const it = raw as Record<string, unknown>;
          return {
          uri: (it.uri as string) || (it.media_content_id as string) || `q-${idx}`,
          name: (it.name as string) || (it.title as string) || (it.media_title as string) || 'Unknown',
          artist: (it.artist as string) || (it.media_artist as string) || undefined,
          album: (it.album as string) || undefined,
          image_url: resolveImageUrl(
            (it.image_url as string) || (it.thumbnail as string) || null,
          ),
          duration: (it.duration as number) || undefined,
          is_current: !!(it.is_playing || it.active),
        };
        }));
      } else {
        setQueue([]);
      }
    } catch {
      // mass.get_queue may not exist — that's fine
      setQueue([]);
    }
  }, [selectedPlayerId]);

  /* ---- Browse media library ---- */
  const browse = useCallback(async (mediaContentId?: string) => {
    setBrowseLoading(true);
    try {
      const data = await callHaService('media_source', 'browse_media', {
        media_content_id: mediaContentId || 'media-source://mass',
      }, true) as Record<string, unknown>;

      const response = (data as { service_response?: Record<string, unknown> })?.service_response ?? data;
      const children = (response as { children?: BrowseItem[] })?.children ?? [];

      setBrowseItems(children.map(c => ({
        title: c.title || '',
        media_content_id: c.media_content_id || '',
        media_content_type: c.media_content_type || '',
        thumbnail: resolveImageUrl(c.thumbnail),
        can_expand: !!c.can_expand,
      })));
    } catch {
      setBrowseItems([]);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  return {
    results,
    loading,
    search,
    playItem,
    queue,
    refreshQueue,
    browseItems,
    browseLoading,
    browse,
  };
}
