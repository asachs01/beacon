import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaPlayer } from '../types/music';
import { HomeAssistantClient } from '../api/homeassistant';
import { refreshWhileAwake } from '../utils/display-sleep';
import {
  getMediaPlayers,
  refreshMediaPlayers,
  parseMediaPlayer,
  play as apiPlay,
  pause as apiPause,
  next as apiNext,
  previous as apiPrevious,
  setVolume as apiSetVolume,
} from '../api/music';

interface UseMusicReturn {
  players: MediaPlayer[];
  activePlayer: MediaPlayer | null;
  play: (entityId?: string) => Promise<void>;
  pause: (entityId?: string) => Promise<void>;
  next: (entityId?: string) => Promise<void>;
  previous: (entityId?: string) => Promise<void>;
  setVolume: (level: number, entityId?: string) => Promise<void>;
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
    const stopPolling = client?.isConnected ? null : refreshWhileAwake(async () => {
      if (cancelled) return;
      try {
        const updated = await refreshMediaPlayers();
        if (!cancelled) setPlayers(updated);
      } catch { /* ignore poll errors */ }
    }, 10_000);

    return () => {
      cancelled = true;
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

  const play = useCallback(
    async (entityId?: string) => {
      const client = getClient();
      const id = resolveEntityId(entityId);
      if (!id) return;
      await apiPlay(client, id);
    },
    [getClient, resolveEntityId],
  );

  const pause = useCallback(
    async (entityId?: string) => {
      const client = getClient();
      const id = resolveEntityId(entityId);
      if (!id) return;
      await apiPause(client, id);
    },
    [getClient, resolveEntityId],
  );

  const next = useCallback(
    async (entityId?: string) => {
      const client = getClient();
      const id = resolveEntityId(entityId);
      if (!id) return;
      await apiNext(client, id);
    },
    [getClient, resolveEntityId],
  );

  const previous = useCallback(
    async (entityId?: string) => {
      const client = getClient();
      const id = resolveEntityId(entityId);
      if (!id) return;
      await apiPrevious(client, id);
    },
    [getClient, resolveEntityId],
  );

  const setVolume = useCallback(
    async (level: number, entityId?: string) => {
      const client = getClient();
      const id = resolveEntityId(entityId);
      if (!id) return;
      await apiSetVolume(client, id, level);
    },
    [getClient, resolveEntityId],
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
    selectedPlayerId,
    selectPlayer,
  };
}
