import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaPlayer, MediaRepeat } from '../types/music';
import { HomeAssistantClient } from '../api/homeassistant';
import { refreshWhileAwake } from '../utils/display-sleep';
import {
  getMediaPlayers,
  refreshMediaPlayers,
  parseMediaPlayer,
  positionAt,
  play as apiPlay,
  pause as apiPause,
  next as apiNext,
  previous as apiPrevious,
  setVolume as apiSetVolume,
  setMuted as apiSetMuted,
  volumeUp as apiVolumeUp,
  volumeDown as apiVolumeDown,
  seek as apiSeek,
  setShuffle as apiSetShuffle,
  setRepeat as apiSetRepeat,
} from '../api/music';

/** A player stopped or started now, where it had got to. */
const at = (state: MediaPlayer['state']) => (p: MediaPlayer, now: Date): Partial<MediaPlayer> => ({
  state,
  media_position: positionAt(p, now.getTime()) ?? p.media_position,
  media_position_updated_at: now.toISOString(),
});

interface UseMusicReturn {
  players: MediaPlayer[];
  activePlayer: MediaPlayer | null;
  play: (entityId?: string) => Promise<void>;
  pause: (entityId?: string) => Promise<void>;
  next: (entityId?: string) => Promise<void>;
  previous: (entityId?: string) => Promise<void>;
  setVolume: (level: number, entityId?: string) => Promise<void>;
  seek: (position: number, entityId?: string) => Promise<void>;
  /** A step up (+1) or down (-1), for players that can't set a level */
  stepVolume: (direction: 1 | -1, entityId?: string) => Promise<void>;
  setShuffle: (shuffle: boolean, entityId?: string) => Promise<void>;
  setRepeat: (repeat: MediaRepeat, entityId?: string) => Promise<void>;
  selectedPlayerId: string | null;
  selectPlayer: (entityId: string) => void;
}

/**
 * `enabled: false` stops listening for player changes and polling; turning
 * it back on re-reads the players. `defaultPlayerId` (Settings > Default
 * Player) is the player shown until another is picked; it used to be
 * ignored.
 */
export function useMusic(
  getClient: () => HomeAssistantClient | null,
  connected: boolean,
  enabled = true,
  defaultPlayerId = '',
): UseMusicReturn {
  const [players, setPlayers] = useState<MediaPlayer[]>([]);
  const [pickedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const selectedPlayerId = pickedPlayerId ?? (defaultPlayerId.trim() || null);
  const subscriptionRef = useRef<number | null>(null);
  /** Reads the players again shortly (REST mode; live updates need nothing). */
  const refreshSoonRef = useRef<() => void>(() => {});

  const activePlayer =
    players.find((p) => p.state === 'playing') ||
    players.find((p) => p.entity_id === selectedPlayerId) ||
    null;

  // Fetch players and subscribe to state changes (or poll in REST mode)
  useEffect(() => {
    if (!connected || !enabled) return;
    const client = getClient();
    let cancelled = false;

    async function init() {
      // Initial fetch — works via WS or REST
      const initialPlayers = await getMediaPlayers(client);
      if (!cancelled) {
        setPlayers(initialPlayers);
      }

      // If we have a WS client, subscribe to live state changes
      if (client?.isConnected) {
        const subId = await client.subscribeStateChanges((event: Record<string, unknown>) => {
          const data = event as {
            data?: {
              new_state?: {
                entity_id: string;
                state: string;
                attributes: Record<string, unknown>;
              };
            };
          };
          const newState = data.data?.new_state;
          if (!newState || !newState.entity_id.startsWith('media_player.')) return;

          const parsed = parseMediaPlayer(newState);
          setPlayers((prev) => {
            const exists = prev.some((p) => p.entity_id === newState.entity_id);
            if (exists) {
              return prev.map((p) =>
                p.entity_id === newState.entity_id ? parsed : p,
              );
            }
            return [...prev, parsed];
          });
        });

        // Cleaned up while subscribing: end it now, or it would never end.
        if (cancelled) client.unsubscribe(subId);
        else subscriptionRef.current = subId;
      }
    }

    init().catch(console.error);

    // In REST-only mode, poll every 10s (not while hidden or under the
    // screensaver)
    const poll = async () => {
      if (cancelled) return;
      try {
        const updated = await refreshMediaPlayers();
        if (!cancelled) setPlayers(updated);
      } catch { /* ignore poll errors */ }
    };
    const stopPolling = client?.isConnected ? null : refreshWhileAwake(poll, 10_000);
    let soon: ReturnType<typeof setTimeout> | undefined;
    if (!client?.isConnected) {
      refreshSoonRef.current = () => {
        clearTimeout(soon);
        soon = setTimeout(poll, 1000);
      };
    }

    return () => {
      cancelled = true;
      clearTimeout(soon);
      refreshSoonRef.current = () => {};
      if (subscriptionRef.current !== null && client) {
        client.unsubscribe(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      stopPolling?.();
    };
  }, [connected, enabled, getClient]);

  const resolveEntityId = useCallback(
    (entityId?: string) => entityId || activePlayer?.entity_id || selectedPlayerId,
    [activePlayer, selectedPlayerId],
  );

  /**
   * Runs a control on a player. What it's known to do shows at once, and the
   * players are read again a second later for the rest (a new track, say):
   * the add-on reads them only every 10 s, so a tap on pause took up to 10 s
   * to show.
   */
  const control = useCallback(
    async (
      entityId: string | undefined,
      run: (client: HomeAssistantClient | null, id: string) => Promise<void>,
      expected?: (player: MediaPlayer, now: Date) => Partial<MediaPlayer>,
    ) => {
      const client = getClient();
      const id = resolveEntityId(entityId);
      if (!id) return;
      if (expected) {
        const now = new Date();
        setPlayers((prev) => prev.map((p) => (p.entity_id === id ? { ...p, ...expected(p, now) } : p)));
      }
      try {
        await run(client, id);
      } finally {
        refreshSoonRef.current();
      }
    },
    [getClient, resolveEntityId],
  );

  const play = useCallback((entityId?: string) => control(entityId, apiPlay, at('playing')), [control]);
  const pause = useCallback((entityId?: string) => control(entityId, apiPause, at('paused')), [control]);
  const next = useCallback((entityId?: string) => control(entityId, apiNext), [control]);
  const previous = useCallback((entityId?: string) => control(entityId, apiPrevious), [control]);
  // A muted player shows no volume, and setting one leaves most players
  // muted, so the slider fell back to nothing: moving it unmutes too, as on
  // iOS.
  const playersRef = useRef(players);
  playersRef.current = players;
  const setVolume = useCallback(
    (level: number, entityId?: string) => control(
      entityId,
      async (client, id) => {
        await apiSetVolume(client, id, level);
        if (playersRef.current.find((p) => p.entity_id === id)?.is_volume_muted) {
          await apiSetMuted(client, id, false);
        }
      },
      () => ({ volume_level: level, is_volume_muted: false }),
    ),
    [control],
  );
  const stepVolume = useCallback(
    (direction: 1 | -1, entityId?: string) => control(
      entityId,
      direction > 0 ? apiVolumeUp : apiVolumeDown,
    ),
    [control],
  );
  const seek = useCallback(
    (position: number, entityId?: string) => control(
      entityId,
      (client, id) => apiSeek(client, id, position),
      (_p, now) => ({ media_position: position, media_position_updated_at: now.toISOString() }),
    ),
    [control],
  );
  const setShuffle = useCallback(
    (shuffle: boolean, entityId?: string) => control(
      entityId,
      (client, id) => apiSetShuffle(client, id, shuffle),
      () => ({ shuffle }),
    ),
    [control],
  );
  const setRepeat = useCallback(
    (repeat: MediaRepeat, entityId?: string) => control(
      entityId,
      (client, id) => apiSetRepeat(client, id, repeat),
      () => ({ repeat }),
    ),
    [control],
  );

  const selectPlayer = useCallback((entityId: string) => {
    setSelectedPlayerId(entityId);
  }, []);

  return {
    players,
    activePlayer,
    play,
    pause,
    next,
    previous,
    setVolume,
    seek,
    stepVolume,
    setShuffle,
    setRepeat,
    selectedPlayerId,
    selectPlayer,
  };
}
