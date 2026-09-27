import { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { usePhotos } from '../hooks/usePhotos';
import { useClock } from '../hooks/useClock';
import { requestFullBleed } from '../utils/ha-kiosk';
import { CoverPhoto } from './CoverPhoto';
import { preloadPhoto } from '../utils/photo-loader';
import { setDisplayAsleep } from '../utils/display-sleep';

const POSITION_INTERVAL = 30_000; // move clock every 30s

type Phase = 'awake' | 'dim' | 'screensaver';

/** Keeps the next click (within a moment) from reaching the app. */
function swallowNextClick(): void {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 700);
}

/** Only mounted while the screensaver shows, so it starts on the right time. */
function ScreenSaverTime({ timeFormat }: { timeFormat: '12h' | '24h' }) {
  const now = useClock();
  return (
    <>
      <div className="screensaver-time">{format(now, timeFormat === '24h' ? 'HH:mm' : 'h:mm')}</div>
      <div className="screensaver-date">{format(now, 'EEEE, MMMM d')}</div>
    </>
  );
}

interface ScreenSaverProps {
  enabled?: boolean;
  dimTimeoutMin?: number;
  screenSaverTimeoutMin?: number;
  showPhotos?: boolean;
  photoIntervalSeconds?: number;
  timeFormat?: '12h' | '24h';
}

export function ScreenSaver({
  enabled = true,
  dimTimeoutMin = 5,
  screenSaverTimeoutMin = 10,
  showPhotos = false,
  photoIntervalSeconds = 30,
  timeFormat = '12h',
}: ScreenSaverProps) {
  const [phase, setPhase] = useState<Phase>('awake');

  // A photo screensaver fills the whole screen, under the iPhone notch too.
  const fullBleed = enabled && showPhotos && phase === 'screensaver';
  useEffect(() => (fullBleed ? requestFullBleed() : undefined), [fullBleed]);

  // Background refreshes pause while the screensaver covers the app.
  const covering = enabled && phase === 'screensaver';
  useEffect(() => {
    setDisplayAsleep(covering);
    return () => setDisplayAsleep(false);
  }, [covering]);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const lastActivityRef = useRef(Date.now());

  const dimAfterMs = dimTimeoutMin * 60 * 1000;
  const screenSaverAfterMs = screenSaverTimeoutMin * 60 * 1000;

  // Photos are only looked at once the screen dims, and only when the
  // photo screensaver is turned on; they only cycle while it's showing.
  const photosWanted = enabled && showPhotos && phase !== 'awake';
  const {
    currentPhoto,
    upcomingPhoto,
    isActive: photosActive,
    setActive: setPhotosActive,
    reportLoadError,
  } = usePhotos(['ha_media', 'local'], photoIntervalSeconds, { enabled: photosWanted });

  useEffect(() => {
    if (!photosWanted) return;
    const shouldCycle = phase === 'screensaver';
    if (shouldCycle !== photosActive) setPhotosActive(shouldCycle);
  }, [photosWanted, phase, photosActive, setPhotosActive]);

  // Get the first photo ready while dimmed, so the screensaver opens on it.
  const currentPhotoUrl = currentPhoto?.url;
  useEffect(() => {
    if (photosWanted && phase === 'dim' && currentPhotoUrl) preloadPhoto(currentPhotoUrl);
  }, [photosWanted, phase, currentPhotoUrl]);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const wake = useCallback((event?: Event) => {
    // A tap on the dimmed screen or the screensaver only wakes the display.
    // It wakes at touchstart, which takes the overlay away, so the tap's
    // click that follows used to land on whatever was under the finger: a
    // chore ticked, a light switched.
    if (phaseRef.current !== 'awake' && (event?.type === 'touchstart' || event?.type === 'mousedown')) {
      swallowNextClick();
    }
    lastActivityRef.current = Date.now();
    setPhase('awake');
  }, []);

  // Listen for user interaction globally
  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [wake]);

  // Idle timer — check every 10 seconds
  useEffect(() => {
    if (!enabled) {
      setPhase('awake');
      return;
    }

    const check = () => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= screenSaverAfterMs) {
        setPhase('screensaver');
      } else if (idle >= dimAfterMs) {
        setPhase('dim');
      }
    };

    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, [enabled, dimAfterMs, screenSaverAfterMs]);

  // Move screensaver clock position periodically to prevent burn-in
  useEffect(() => {
    if (phase !== 'screensaver') return;

    const move = () => {
      setPosition({
        x: 15 + Math.random() * 70, // 15%–85%
        y: 15 + Math.random() * 70,
      });
    };

    move(); // initial position
    const interval = setInterval(move, POSITION_INTERVAL);
    return () => clearInterval(interval);
  }, [phase]);

  if (!enabled || phase === 'awake') return null;

  if (phase === 'dim') {
    return <div className="screensaver-dim" onClick={() => wake()} />;
  }

  return (
    <div className="screensaver-overlay" onClick={() => wake()}>
      {showPhotos && currentPhoto && (
        <>
          <CoverPhoto
            key={currentPhoto.url}
            className="screensaver-photo"
            src={currentPhoto.url}
            preloadSrc={upcomingPhoto?.url}
            label={currentPhoto.caption || 'Photo'}
            onError={reportLoadError}
          />
          <div className="screensaver-photo-scrim" />
        </>
      )}
      <div
        className="screensaver-clock"
        style={{ left: `${position.x}%`, top: `${position.y}%` }}
      >
        <ScreenSaverTime timeFormat={timeFormat} />
      </div>
    </div>
  );
}
