import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  ArrowLeft,
} from 'lucide-react';
import { usePhotos } from '../hooks/usePhotos';
import { NowPlayingBar } from './NowPlayingBar';
import { MediaPlayer } from '../types/music';

interface PhotoFrameProps {
  showClock?: boolean;
  showWeather?: boolean;
  intervalSeconds?: number;
  weatherText?: string;
  /** Music state — pass these to show NowPlayingBar over photos */
  musicPlayer?: MediaPlayer | null;
  onMusicPlay?: () => void;
  onMusicPause?: () => void;
  onMusicNext?: () => void;
  onMusicPrevious?: () => void;
  onMusicSetVolume?: (level: number) => void;
  onBack?: () => void;
}

function formatClock(): string {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(): string {
  const now = new Date();
  return now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function PhotoFrame({
  showClock = true,
  showWeather = false,
  intervalSeconds = 30,
  weatherText,
  musicPlayer,
  onMusicPlay,
  onMusicPause,
  onMusicNext,
  onMusicPrevious,
  onMusicSetVolume,
  onBack,
}: PhotoFrameProps) {
  const {
    currentPhoto,
    nextPhoto,
    previousPhoto,
    isActive,
    setActive,
    photoCount,
  } = usePhotos(['ha_media', 'local'], intervalSeconds);

  const [showControls, setShowControls] = useState(false);
  const [clock, setClock] = useState(formatClock());
  const [date, setDate] = useState(formatDate());
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fadeKey, setFadeKey] = useState(0);

  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setClock(formatClock());
      setDate(formatDate());
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Track photo changes for crossfade
  useEffect(() => {
    setFadeKey((prev) => prev + 1);
  }, [currentPhoto?.url]);

  // Hide controls after 5 seconds of inactivity
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 5000);
  }, []);

  const handleTap = useCallback(() => {
    if (showControls) {
      // Already visible — hide immediately
      setShowControls(false);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      setShowControls(true);
      setActive(false); // pause slideshow when controls shown
      scheduleHide();
    }
  }, [showControls, setActive, scheduleHide]);

  const handlePauseToggle = useCallback(() => {
    if (isActive) {
      setActive(false);
    } else {
      setActive(true);
    }
    scheduleHide();
  }, [isActive, setActive, scheduleHide]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // If no photos loaded, show a placeholder
  if (photoCount === 0) {
    return (
      <div className="photo-frame" onClick={handleTap}>
        <div className="photo-frame-empty">
          <p>No photos available</p>
          <p className="photo-frame-empty-hint">
            Add photos to your Home Assistant media directory
          </p>
        </div>
        {onBack && (
          <button
            type="button"
            className="photo-frame-back"
            onClick={(e) => { e.stopPropagation(); onBack(); }}
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={24} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="photo-frame" onClick={handleTap}>
      {/* Photo with crossfade */}
      <div className="photo-frame-image-wrapper" key={fadeKey}>
        <img
          className="photo-frame-image"
          src={currentPhoto?.url}
          alt={currentPhoto?.caption || 'Photo'}
        />
      </div>

      {/* Bottom gradient overlay with clock */}
      {showClock && !showControls && (
        <div className="photo-frame-overlay">
          <div className="photo-frame-clock">{clock}</div>
          <div className="photo-frame-date">{date}</div>
          {showWeather && weatherText && (
            <div className="photo-frame-weather">{weatherText}</div>
          )}
        </div>
      )}

      {/* Controls overlay */}
      <div className={`photo-frame-controls ${showControls ? 'photo-frame-controls--visible' : ''}`}>
        <button
          type="button"
          className="photo-frame-control-btn"
          onClick={(e) => { e.stopPropagation(); previousPhoto(); scheduleHide(); }}
          aria-label="Previous photo"
        >
          <ChevronLeft size={32} />
        </button>
        <button
          type="button"
          className="photo-frame-control-btn photo-frame-control-btn--play"
          onClick={(e) => { e.stopPropagation(); handlePauseToggle(); }}
          aria-label={isActive ? 'Pause slideshow' : 'Resume slideshow'}
        >
          {isActive ? <Pause size={32} /> : <Play size={32} />}
        </button>
        <button
          type="button"
          className="photo-frame-control-btn"
          onClick={(e) => { e.stopPropagation(); nextPhoto(); scheduleHide(); }}
          aria-label="Next photo"
        >
          <ChevronRight size={32} />
        </button>
      </div>

      {/* Back button (always in controls mode) */}
      {showControls && onBack && (
        <button
          type="button"
          className="photo-frame-back"
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={24} />
        </button>
      )}

      {/* Music bar overlay */}
      {musicPlayer && onMusicPlay && onMusicPause && onMusicNext && onMusicPrevious && onMusicSetVolume && (
        <div className="photo-frame-music">
          <NowPlayingBar
            player={musicPlayer}
            onPlay={onMusicPlay}
            onPause={onMusicPause}
            onNext={onMusicNext}
            onPrevious={onMusicPrevious}
            onSetVolume={onMusicSetVolume}
          />
        </div>
      )}
    </div>
  );
}
