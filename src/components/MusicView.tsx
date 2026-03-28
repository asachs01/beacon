import { useState, useEffect, useRef } from 'react';
import { getConfig } from '../config';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ChevronDown,
} from 'lucide-react';
import { MediaPlayer } from '../types/music';

interface MusicViewProps {
  players: MediaPlayer[];
  activePlayer: MediaPlayer | null;
  selectedPlayerId: string | null;
  onSelectPlayer: (entityId: string) => void;
  onPlay: (entityId?: string) => void;
  onPause: (entityId?: string) => void;
  onNext: (entityId?: string) => void;
  onPrevious: (entityId?: string) => void;
  onSetVolume: (level: number, entityId?: string) => void;
}

/**
 * Formats seconds into m:ss.
 */
function formatTime(seconds: number | undefined): string {
  if (seconds == null || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MusicView({
  players,
  activePlayer,
  selectedPlayerId,
  onSelectPlayer,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onSetVolume,
}: MusicViewProps) {
  const player = activePlayer || players.find((p) => p.entity_id === selectedPlayerId) || players[0] || null;
  const isPlaying = player?.state === 'playing';

  // Track elapsed position locally for smooth progress bar
  const [position, setPosition] = useState(player?.media_position ?? 0);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPosition(player?.media_position ?? 0);
  }, [player?.media_position]);

  // Tick the position forward while playing
  useEffect(() => {
    if (animRef.current) clearInterval(animRef.current);
    if (!isPlaying) return;

    animRef.current = setInterval(() => {
      setPosition((prev) => prev + 1);
    }, 1000);

    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, [isPlaying, player?.media_position]);

  const duration = player?.media_duration ?? 0;
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;

  const haUrl = getConfig().ha_url.replace(/\/$/, '');
  const artSrc = player?.entity_picture
    ? (player.entity_picture.startsWith('http')
      ? player.entity_picture
      : `${haUrl}${player.entity_picture}`)
    : null;

  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);

  return (
    <div className="music-view">
      {/* Player selector */}
      {players.length > 1 && (
        <div className="music-player-selector">
          <button
            type="button"
            className="music-player-selector-btn"
            onClick={() => setShowPlayerDropdown(!showPlayerDropdown)}
          >
            <span>{player?.friendly_name || 'Select Player'}</span>
            <ChevronDown size={16} />
          </button>
          {showPlayerDropdown && (
            <div className="music-player-dropdown">
              {players.map((p) => (
                <button
                  key={p.entity_id}
                  type="button"
                  className={`music-player-dropdown-item ${
                    p.entity_id === player?.entity_id ? 'music-player-dropdown-item--active' : ''
                  }`}
                  onClick={() => {
                    onSelectPlayer(p.entity_id);
                    setShowPlayerDropdown(false);
                  }}
                >
                  <span>{p.friendly_name}</span>
                  {p.state === 'playing' && (
                    <span className="music-player-dropdown-playing">Playing</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Album art */}
      <div className="music-art-container">
        {artSrc ? (
          <img
            className="music-art"
            src={artSrc}
            alt={player?.media_album_name || 'Album art'}
          />
        ) : (
          <div className="music-art music-art--placeholder">
            <Volume2 size={64} strokeWidth={1} />
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="music-track-info">
        <h2 className="music-track-title">
          {player?.media_title || 'Nothing Playing'}
        </h2>
        <p className="music-track-artist">
          {player?.media_artist || ''}
        </p>
        {player?.media_album_name && (
          <p className="music-track-album">
            {player.media_album_name}
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div className="music-progress">
        <span className="music-progress-time">{formatTime(position)}</span>
        <div className="music-progress-bar">
          <div
            className="music-progress-fill"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="music-progress-time">{formatTime(duration)}</span>
      </div>

      {/* Playback controls */}
      <div className="music-controls">
        <button
          type="button"
          className="music-control-btn"
          onClick={() => onPrevious(player?.entity_id)}
          aria-label="Previous track"
        >
          <SkipBack size={28} />
        </button>
        <button
          type="button"
          className="music-control-btn music-control-btn--play"
          onClick={() => (isPlaying ? onPause : onPlay)(player?.entity_id)}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={32} /> : <Play size={32} />}
        </button>
        <button
          type="button"
          className="music-control-btn"
          onClick={() => onNext(player?.entity_id)}
          aria-label="Next track"
        >
          <SkipForward size={28} />
        </button>
      </div>

      {/* Volume slider */}
      <div className="music-volume">
        <button
          type="button"
          className="music-volume-btn"
          onClick={() =>
            onSetVolume(
              player?.is_volume_muted ? (player.volume_level || 0.5) : 0,
              player?.entity_id,
            )
          }
          aria-label={player?.is_volume_muted ? 'Unmute' : 'Mute'}
        >
          {player?.is_volume_muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <input
          type="range"
          className="music-volume-slider"
          min={0}
          max={1}
          step={0.02}
          value={player?.is_volume_muted ? 0 : (player?.volume_level ?? 0.5)}
          onChange={(e) => onSetVolume(parseFloat(e.target.value), player?.entity_id)}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
