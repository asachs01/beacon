import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaPlayer } from '../types/music';
import { HomeAssistantClient } from '../api/homeassistant';
import {
  getMediaPlayers,
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

export function useMusic(
  getClient: () => HomeAssistantClient | null,
  connected: boolean,
): UseMusicReturn {
  const [players, setPlayers] = useState<MediaPlayer[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const subscriptionRef = useRef<number | null>(null);

  // Find the active player: the one currently playing, or the selected one
  const activePlayer =
    players.find((p) => p.state === 'playing') ||
    players.find((p) => p.entity_id === selectedPlayerId) ||
    null;

  // Fetch players and subscribe to state changes
  useEffect(() => {
    if (!connected) return;
    const client = getClient();
    if (!client) return;

    let cancelled = false;

    async function init() {
      // Initial fetch
      const initialPlayers = await getMediaPlayers(client!);
      if (!cancelled) {
        setPlayers(initialPlayers);
      }

      // Subscribe to state changes
      const subId = await client!.subscribeStateChanges((event: Record<string, unknown>) => {
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

      if (!cancelled) {
        subscriptionRef.current = subId;
      }
    }

    init().catch(console.error);

    return () => {
      cancelled = true;
      if (subscriptionRef.current !== null) {
        client.unsubscribe(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [connected, getClient]);

  const resolveEntityId = useCallback(
    (entityId?: string) => entityId || activePlayer?.entity_id || selectedPlayerId,
    [activePlayer, selectedPlayerId],
  );

  const play = useCallback(
    async (entityId?: string) => {
      const client = getClient();
      const id = resolveEntityId(entityId);
      if (!client || !id) return;
      await apiPlay(client, id);
    },
    [getClient, resolveEntityId],
  );

  const pause = useCallback(
    async (entityId?: string) => {
      const client = getClient();
      const id = resolveEntityId(entityId);
      if (!client || !id) return;
      await apiPause(client, id);
    },
    [getClient, resolveEntityId],
  );

  const next = useCallback(
    async (entityId?: string) => {
      const client = getClient();
      const id = resolveEntityId(entityId);
      if (!client || !id) return;
      await apiNext(client, id);
    },
    [getClient, resolveEntityId],
  );

  const previous = useCallback(
    async (entityId?: string) => {
      const client = getClient();
      const id = resolveEntityId(entityId);
      if (!client || !id) return;
      await apiPrevious(client, id);
    },
    [getClient, resolveEntityId],
  );

  const setVolume = useCallback(
    async (level: number, entityId?: string) => {
      const client = getClient();
      const id = resolveEntityId(entityId);
      if (!client || !id) return;
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
