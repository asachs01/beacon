import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MediaPlayer } from '../types/music';

interface NowPlayingBarProps {
  player: MediaPlayer | null;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSetVolume: (level: number) => void;
  onExpand?: () => void;
}

export function NowPlayingBar({
  player,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onSetVolume,
  onExpand,
}: NowPlayingBarProps) {
  if (!player || (player.state !== 'playing' && player.state !== 'paused')) {
    return null;
  }

  const isPlaying = player.state === 'playing';
  const haUrl = (import.meta.env.VITE_HA_URL || '').replace(/\/$/, '');
  const artSrc = player.entity_picture
    ? (player.entity_picture.startsWith('http')
      ? player.entity_picture
      : `${haUrl}${player.entity_picture}`)
    : null;

  return (
    <div className="now-playing-bar" role="region" aria-label="Now playing">
      {/* Album art + info — tap to expand */}
      <button
        type="button"
        className="now-playing-info"
        onClick={onExpand}
        aria-label="Open music view"
      >
        {artSrc ? (
          <img
            className="now-playing-art"
            src={artSrc}
            alt={player.media_album_name || 'Album art'}
          />
        ) : (
          <div className="now-playing-art now-playing-art--placeholder" />
        )}
        <div className="now-playing-text">
          <span className="now-playing-title">
            {player.media_title || 'Unknown'}
          </span>
          <span className="now-playing-artist">
            {player.media_artist || player.friendly_name}
          </span>
        </div>
      </button>

      {/* Controls */}
      <div className="now-playing-controls">
        <button
          type="button"
          className="now-playing-btn"
          onClick={onPrevious}
          aria-label="Previous track"
        >
          <SkipBack size={18} />
        </button>
        <button
          type="button"
          className="now-playing-btn now-playing-btn--play"
          onClick={isPlaying ? onPause : onPlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          type="button"
          className="now-playing-btn"
          onClick={onNext}
          aria-label="Next track"
        >
          <SkipForward size={18} />
        </button>
      </div>

      {/* Volume */}
      <div className="now-playing-volume">
        <button
          type="button"
          className="now-playing-btn"
          onClick={() => onSetVolume(player.is_volume_muted ? (player.volume_level || 0.5) : 0)}
          aria-label={player.is_volume_muted ? 'Unmute' : 'Mute'}
        >
          {player.is_volume_muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          className="now-playing-volume-slider"
          min={0}
          max={1}
          step={0.02}
          value={player.is_volume_muted ? 0 : (player.volume_level ?? 0.5)}
          onChange={(e) => onSetVolume(parseFloat(e.target.value))}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
