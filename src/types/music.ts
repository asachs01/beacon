export type MediaPlayerState = 'playing' | 'paused' | 'idle' | 'off' | 'unavailable';

export interface MediaPlayer {
  entity_id: string;
  friendly_name: string;
  state: MediaPlayerState;
  media_title?: string;
  media_artist?: string;
  media_album_name?: string;
  media_content_id?: string;
  media_duration?: number;
  media_position?: number;
  /** When media_position was measured (ISO time); HA doesn't update it while playing. */
  media_position_updated_at?: string;
  entity_picture?: string;
  app_name?: string;
  device_class?: string;
  volume_level?: number;
  is_volume_muted?: boolean;
  shuffle?: boolean;
  repeat?: MediaRepeat;
  /** HA's MediaPlayerEntityFeature bits: what the player can do. */
  supported_features?: number;
}

export type MediaRepeat = 'off' | 'all' | 'one';

export interface QueueItem {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  image_url?: string;
}

export interface MusicQueue {
  items: QueueItem[];
}
