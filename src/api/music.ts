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

export async function play(client: HomeAssistantClient | null, entityId: string): Promise<void> {
  if (client?.isConnected) {
    await client.callService('media_player', 'media_play', entityId);
  } else {
    await callHaService('media_player', 'media_play', { entity_id: entityId });
  }
}

export async function pause(client: HomeAssistantClient | null, entityId: string): Promise<void> {
  if (client?.isConnected) {
    await client.callService('media_player', 'media_pause', entityId);
  } else {
    await callHaService('media_player', 'media_pause', { entity_id: entityId });
  }
}

export async function next(client: HomeAssistantClient | null, entityId: string): Promise<void> {
  if (client?.isConnected) {
    await client.callService('media_player', 'media_next_track', entityId);
  } else {
    await callHaService('media_player', 'media_next_track', { entity_id: entityId });
  }
}

export async function previous(client: HomeAssistantClient | null, entityId: string): Promise<void> {
  if (client?.isConnected) {
    await client.callService('media_player', 'media_previous_track', entityId);
  } else {
    await callHaService('media_player', 'media_previous_track', { entity_id: entityId });
  }
}

export async function setVolume(
  client: HomeAssistantClient | null,
  entityId: string,
  level: number,
): Promise<void> {
  const data = { entity_id: entityId, volume_level: Math.max(0, Math.min(1, level)) };
  if (client?.isConnected) {
    await client.callService('media_player', 'volume_set', entityId, {
      volume_level: data.volume_level,
    });
  } else {
    await callHaService('media_player', 'volume_set', data);
  }
}
