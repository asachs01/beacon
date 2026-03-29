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
    volume_level: attrs.volume_level as number | undefined,
    is_volume_muted: attrs.is_volume_muted as boolean | undefined,
  };
}

/**
 * Fetches all media_player entities via WebSocket client or REST API.
 */
export async function getMediaPlayers(client?: HomeAssistantClient | null): Promise<MediaPlayer[]> {
  // Try WebSocket client first
  if (client?.isConnected) {
    const states = await client.getStates();
    return states
      .filter((s) => s.entity_id.startsWith('media_player.'))
      .map(parseMediaPlayer);
  }

  // Fall back to REST API (proxy mode)
  if (hasToken()) {
    try {
      const states = await haFetch('/api/states') as Array<{
        entity_id: string;
        state: string;
        attributes: Record<string, unknown>;
      }>;
      return states
        .filter(s => s.entity_id.startsWith('media_player.'))
        .map(parseMediaPlayer);
    } catch (err) {
      console.warn('Failed to fetch media players via REST:', err);
      return [];
    }
  }

  return [];
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
  callMedia(client, 'media_play', entityId);

export const pause = (client: HomeAssistantClient | null, entityId: string) =>
  callMedia(client, 'media_pause', entityId);

export const next = (client: HomeAssistantClient | null, entityId: string) =>
  callMedia(client, 'media_next_track', entityId);

export const previous = (client: HomeAssistantClient | null, entityId: string) =>
  callMedia(client, 'media_previous_track', entityId);

export const setVolume = (client: HomeAssistantClient | null, entityId: string, level: number) =>
  callMedia(client, 'volume_set', entityId, { volume_level: Math.max(0, Math.min(1, level)) });
