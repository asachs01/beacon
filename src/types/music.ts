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
  entity_picture?: string;
  app_name?: string;
  volume_level?: number;
  is_volume_muted?: boolean;
}

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
