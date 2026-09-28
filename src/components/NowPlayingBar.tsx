import { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MediaPlayer } from '../types/music';
import { getConfig } from '../config';
import { positionAt } from '../api/music';
import { useVolumeDrag } from '../hooks/useVolumeDrag';

interface NowPlayingBarProps {
  player: MediaPlayer | null;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSetVolume: (level: number) => void;
  onToggleMute: (muted: boolean) => void;
  onExpand?: () => void;
}

/** The bar's volume, set as the slider moves (see useVolumeDrag). */
function BarVolumeSlider({ level, onChange }: { level: number; onChange: (level: number) => void }) {
  const volume = useVolumeDrag(level, onChange);
  return (
    <input
      type="range"
      className="now-playing-volume-slider"
      min={0}
      max={1}
      step={0.02}
      value={volume.value}
      onChange={(e) => volume.set(parseFloat(e.target.value))}
      onPointerDown={volume.onPointerDown}
      onPointerUp={volume.onPointerUp}
      onPointerCancel={volume.onPointerCancel}
      aria-label="Volume"
    />
  );
}

export function NowPlayingBar({
  player,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onSetVolume,
  onToggleMute,
  onExpand,
}: NowPlayingBarProps) {
  // Where the track is, counted on from when Home Assistant measured it (it
  // doesn't update the position while playing), as on the Music screen. It
  // was counted from when the bar appeared, so a track that had played for
  // minutes showed as just started.
  const [now, setNow] = useState(() => Date.now());
  const playing = player?.state === 'playing';
  useEffect(() => {
    if (!playing) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [playing]);
  const position = (player && positionAt(player, now)) ?? 0;

  if (!player || (player.state !== 'playing' && player.state !== 'paused')) {
    return null;
  }

  const isPlaying = player.state === 'playing';
  const duration = player.media_duration ?? 0;
  const progressPct = duration > 0 ? Math.min(position / duration, 1) * 100 : 0;
  const haUrl = getConfig().ha_url.replace(/\/$/, '');
  const artSrc = player.entity_picture
    ? (player.entity_picture.startsWith('http')
      ? player.entity_picture
      : `${haUrl}${player.entity_picture}`)
    : null;

  return (
    <div className="now-playing-bar" role="region" aria-label="Now playing">
      {/* Thin progress bar across the top */}
      {duration > 0 && (
        <div className="now-playing-progress">
          <div className="now-playing-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      )}
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
            {player.media_title || player.app_name || player.friendly_name}
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
          onClick={() => onToggleMute(!player.is_volume_muted)}
          aria-label={player.is_volume_muted ? 'Unmute' : 'Mute'}
        >
          {player.is_volume_muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        {/* Per speaker: another one starting to play doesn't keep this one's drag */}
        <BarVolumeSlider
          key={player.entity_id}
          level={player.is_volume_muted ? 0 : (player.volume_level ?? 0.5)}
          onChange={onSetVolume}
        />
      </div>
    </div>
  );
}
