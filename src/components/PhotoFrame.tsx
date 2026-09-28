import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { usePhotos } from '../hooks/usePhotos';
import { useClock } from '../hooks/useClock';
import { formatClockTime, type TimeFormat } from '../utils/time-format';
import { requestFullBleed } from '../utils/ha-kiosk';
import { NowPlayingBar } from './NowPlayingBar';
import { PhotoDiagnostics } from './PhotoDiagnostics';
import { testPatternUrl } from '../utils/test-pattern';
import { CoverPhoto } from './CoverPhoto';
import { MediaPlayer } from '../types/music';
import '../styles/photos.css';

interface PhotoFrameProps {
  showClock?: boolean;
  showWeather?: boolean;
  intervalSeconds?: number;
  /** How the next photo comes in (Settings > Photos > Transition Style). */
  transition?: 'fade' | 'slide';
  timeFormat?: TimeFormat;
  weatherText?: string;
  /** Music state — pass these to show NowPlayingBar over photos */
  musicPlayer?: MediaPlayer | null;
  onMusicPlay?: () => void;
  onMusicPause?: () => void;
  onMusicNext?: () => void;
  onMusicPrevious?: () => void;
  onMusicSetVolume?: (level: number) => void;
  onMusicToggleMute?: (muted: boolean) => void;
  onBack?: () => void;
}

function formatDate(now: Date): string {
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
  transition = 'fade',
  timeFormat = '12h',
  weatherText,
  musicPlayer,
  onMusicPlay,
  onMusicPause,
  onMusicNext,
  onMusicPrevious,
  onMusicSetVolume,
  onMusicToggleMute,
  onBack,
}: PhotoFrameProps) {
  const {
    currentPhoto,
    upcomingPhoto,
    nextPhoto,
    previousPhoto,
    isActive,
    setActive,
    reportLoadError,
    photoCount,
  } = usePhotos(['ha_media', 'local'], intervalSeconds);

  // Draw under the iPhone notch / home bar inside the HA app too.
  useEffect(() => requestFullBleed(), []);

  const [showControls, setShowControls] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [testPattern, setTestPattern] = useState(false);
  const [photoSize, setPhotoSize] = useState<{ w: number; h: number }>();

  // Test pattern uses the current photo's shape; the slideshow pauses
  // while diagnostics are open so the readout stays on one photo.
  useEffect(() => {
    if (!showDiagnostics || !currentPhoto?.url) return;
    const img = new Image();
    img.onload = () => setPhotoSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = currentPhoto.url;
  }, [showDiagnostics, currentPhoto?.url]);
  useEffect(() => {
    if (showDiagnostics) setActive(false);
  }, [showDiagnostics, setActive]);
  const frameRef = useRef<HTMLDivElement>(null);
  // On the minute, in Settings' time format (it followed the browser's).
  const now = useClock();
  const clock = formatClockTime(now, timeFormat);
  const date = formatDate(now);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fadeKey, setFadeKey] = useState(0);

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
    setActive(!isActive);
    scheduleHide();
  }, [isActive, setActive, scheduleHide]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Rendered at the top level of the page: inside the app's main area,
  // its animated wrapper confines the fixed full-screen layer's stacking,
  // leaving the mobile tab bar drawn over the photo.
  const fullScreen = (content: ReactNode) => createPortal(content, document.body);

  // If no photos loaded, show a placeholder
  if (photoCount === 0) {
    return fullScreen(
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

  return fullScreen(
    <div className={`photo-frame photo-frame--${transition}`} ref={frameRef} onClick={handleTap}>
      {/* Photo with crossfade */}
      <div className="photo-frame-image-wrapper" key={fadeKey}>
        <CoverPhoto
          className="photo-frame-image"
          src={testPattern ? testPatternUrl(photoSize?.w, photoSize?.h) : currentPhoto?.url}
          preloadSrc={testPattern ? undefined : upcomingPhoto?.url}
          label={currentPhoto?.caption || 'Photo'}
          onError={testPattern ? undefined : reportLoadError}
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

      {/* Diagnostics toggle (in controls mode) and readout */}
      {showControls && (
        <button
          type="button"
          className="photo-frame-info"
          onClick={(e) => { e.stopPropagation(); setShowDiagnostics((v) => !v); }}
          aria-label="Photo diagnostics"
        >
          <Info size={22} />
        </button>
      )}
      {showDiagnostics && (
        <PhotoDiagnostics
          frameRef={frameRef}
          photoUrl={currentPhoto?.url}
          testPattern={testPattern}
          onToggleTestPattern={() => setTestPattern((v) => !v)}
          onClose={() => { setShowDiagnostics(false); setTestPattern(false); }}
        />
      )}

      {/* Music bar overlay */}
      {musicPlayer && onMusicPlay && onMusicPause && onMusicNext && onMusicPrevious && onMusicSetVolume && onMusicToggleMute && (
        <div className="photo-frame-music">
          <NowPlayingBar
            player={musicPlayer}
            onPlay={onMusicPlay}
            onPause={onMusicPause}
            onNext={onMusicNext}
            onPrevious={onMusicPrevious}
            onSetVolume={onMusicSetVolume}
            onToggleMute={onMusicToggleMute}
          />
        </div>
      )}
    </div>
  );
}
