import { HomeAssistantClient } from './homeassistant';
import { MediaPlayer, MediaPlayerState } from '../types/music';

/**
 * Parses a Home Assistant state entity into a MediaPlayer object.
 */
function parseMediaPlayer(entity: {
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
 * Fetches all media_player entities from Home Assistant.
 */
export async function getMediaPlayers(client: HomeAssistantClient): Promise<MediaPlayer[]> {
  const states = await client.getStates();
  return states
    .filter((s) => s.entity_id.startsWith('media_player.'))
    .map(parseMediaPlayer);
}

/**
 * Gets the current state of a specific media player.
 */
export async function getPlayerState(
  client: HomeAssistantClient,
  entityId: string,
): Promise<MediaPlayer | null> {
  const states = await client.getStates();
  const entity = states.find((s) => s.entity_id === entityId);
  return entity ? parseMediaPlayer(entity) : null;
}

export async function play(client: HomeAssistantClient, entityId: string): Promise<void> {
  await client.callService('media_player', 'media_play', entityId);
}

export async function pause(client: HomeAssistantClient, entityId: string): Promise<void> {
  await client.callService('media_player', 'media_pause', entityId);
}

export async function next(client: HomeAssistantClient, entityId: string): Promise<void> {
  await client.callService('media_player', 'media_next_track', entityId);
}

export async function previous(client: HomeAssistantClient, entityId: string): Promise<void> {
  await client.callService('media_player', 'media_previous_track', entityId);
}

export async function setVolume(
  client: HomeAssistantClient,
  entityId: string,
  level: number,
): Promise<void> {
  await client.callService('media_player', 'volume_set', entityId, {
    volume_level: Math.max(0, Math.min(1, level)),
  });
}

/**
 * Subscribes to state changes for media_player entities.
 * The callback fires whenever any media_player entity changes state.
 * Returns a subscription ID that can be used to unsubscribe.
 */
export async function subscribeToPlayer(
  client: HomeAssistantClient,
  entityId: string,
  callback: (player: MediaPlayer) => void,
): Promise<number> {
  return client.subscribeStateChanges((event: Record<string, unknown>) => {
    const data = event as {
      data?: {
        entity_id?: string;
        new_state?: {
          entity_id: string;
          state: string;
          attributes: Record<string, unknown>;
        };
      };
    };
    const newState = data.data?.new_state;
    if (newState && newState.entity_id === entityId) {
      callback(parseMediaPlayer(newState));
    }
  });
}
