import { HomeAssistantClient } from './homeassistant';
import { MediaPlayer, MediaPlayerState } from '../types/music';
import { haFetch, hasToken, callHaService } from './ha-rest';

/**
 * Parses a Home Assistant state entity into a MediaPlayer object.
 */
export function parseMediaPlayer(entity: {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}): MediaPlayer {
  const attrs = entity.attributes;
  return {
    entity_id: entity.entity_id,
    friendly_name: (attrs.friendly_name as string) || entity.entity_id,
    state: entity.state as MediaPlayerState,
    media_title: attrs.media_title as string | undefined,
    media_artist: attrs.media_artist as string | undefined,
    media_album_name: attrs.media_album_name as string | undefined,
    media_content_id: attrs.media_content_id as string | undefined,
    media_duration: attrs.media_duration as number | undefined,
    media_position: attrs.media_position as number | undefined,
    entity_picture: attrs.entity_picture as string | undefined,
    app_name: attrs.app_name as string | undefined,
    device_class: attrs.device_class as string | undefined,
    volume_level: attrs.volume_level as number | undefined,
    is_volume_muted: attrs.is_volume_muted as boolean | undefined,
  };
}

/**
 * Fetches all media_player entities via WebSocket client or REST API.
 */
/**
 * Deduplicate players with the same friendly_name.
 * Prefer: device_class set > actively playing > lower entity_id suffix.
 */
function deduplicatePlayers(players: MediaPlayer[]): MediaPlayer[] {
  const byName = new Map<string, MediaPlayer>();
  for (const p of players) {
    if (p.state === 'unavailable') continue;
    const existing = byName.get(p.friendly_name);
    if (!existing) {
      byName.set(p.friendly_name, p);
      continue;
    }
    // Prefer the one with device_class (it's the real controllable device)
    if (p.device_class && !existing.device_class) {
      byName.set(p.friendly_name, p);
    } else if (p.state === 'playing' && existing.state !== 'playing' && !existing.device_class) {
      byName.set(p.friendly_name, p);
    }
  }
  return Array.from(byName.values());
}

export async function getMediaPlayers(client?: HomeAssistantClient | null): Promise<MediaPlayer[]> {
  let all: MediaPlayer[] = [];

  if (client?.isConnected) {
    const states = await client.getStates();
    all = states
      .filter((s) => s.entity_id.startsWith('media_player.'))
      .map(parseMediaPlayer);
  } else if (hasToken()) {
    try {
      const states = await haFetch('/api/states') as Array<{
        entity_id: string;
        state: string;
        attributes: Record<string, unknown>;
      }>;
      all = states
        .filter(s => s.entity_id.startsWith('media_player.'))
        .map(parseMediaPlayer);
    } catch (err) {
      console.warn('Failed to fetch media players via REST:', err);
      return [];
    }
  }

  return deduplicatePlayers(all);
}

/** Call a media_player service via WS (if connected) or REST (proxy) */
async function callMedia(
  client: HomeAssistantClient | null,
  service: string,
  entityId: string,
  extraData?: Record<string, unknown>,
): Promise<void> {
  if (client?.isConnected) {
    await client.callService('media_player', service, entityId, extraData);
  } else {
    await callHaService('media_player', service, { entity_id: entityId, ...extraData });
  }
}

export const play = (client: HomeAssistantClient | null, entityId: string) =>
  callMedia(client, 'media_play', entityId)
    .catch(() => callMedia(client, 'media_play_pause', entityId))
    .catch(() => callMedia(client, 'toggle', entityId));

export const pause = (client: HomeAssistantClient | null, entityId: string) =>
  callMedia(client, 'media_pause', entityId)
    .catch(() => callMedia(client, 'media_play_pause', entityId))
    .catch(() => callMedia(client, 'toggle', entityId));

export const next = (client: HomeAssistantClient | null, entityId: string) =>
  callMedia(client, 'media_next_track', entityId);

export const previous = (client: HomeAssistantClient | null, entityId: string) =>
  callMedia(client, 'media_previous_track', entityId);

export const setVolume = (client: HomeAssistantClient | null, entityId: string, level: number) =>
  callMedia(client, 'volume_set', entityId, { volume_level: Math.max(0, Math.min(1, level)) });
