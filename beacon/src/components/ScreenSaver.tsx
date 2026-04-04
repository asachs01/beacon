import { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { usePhotoSource } from '../hooks/usePhotoSource';

const POSITION_INTERVAL = 30_000; // move clock every 30s

type Phase = 'awake' | 'dim' | 'screensaver';

interface ScreenSaverProps {
  enabled?: boolean;
  dimTimeoutMin?: number;
  screenSaverTimeoutMin?: number;
  mode?: 'clock' | 'photos' | 'both';
  photoSource?: 'google_photos' | 'immich' | 'local' | 'none';
  immichUrl?: string;
  immichApiKey?: string;
  photoInterval?: number;
}

export function ScreenSaver({
  enabled = true,
  dimTimeoutMin = 5,
  screenSaverTimeoutMin = 10,
  mode = 'clock',
  photoSource = 'none',
  immichUrl = '',
  immichApiKey = '',
  photoInterval = 30,
}: ScreenSaverProps) {
  const [phase, setPhase] = useState<Phase>('awake');
  const [now, setNow] = useState(new Date());
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const lastActivityRef = useRef(Date.now());

  // Photo slideshow state: two layers for crossfade
  const [photoA, setPhotoA] = useState<string | null>(null);
  const [photoB, setPhotoB] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<'a' | 'b'>('a');

  const dimAfterMs = dimTimeoutMin * 60 * 1000;
  const screenSaverAfterMs = screenSaverTimeoutMin * 60 * 1000;

  const showPhotos = (mode === 'photos' || mode === 'both') && photoSource !== 'none';

  const { currentPhoto } = usePhotoSource({
    source: showPhotos && phase === 'screensaver' ? photoSource : 'none',
    immichUrl,
    immichApiKey,
    intervalSeconds: photoInterval,
  });

  // When currentPhoto changes, swap into the inactive layer for crossfade
  const prevPhotoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentPhoto || currentPhoto === prevPhotoRef.current) return;
    prevPhotoRef.current = currentPhoto;

    if (activeLayer === 'a') {
      setPhotoB(currentPhoto);
      setActiveLayer('b');
    } else {
      setPhotoA(currentPhoto);
      setActiveLayer('a');
    }
  }, [currentPhoto]); // eslint-disable-line react-hooks/exhaustive-deps

  const wake = useCallback(() => {
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

  // Clock tick for screensaver
  useEffect(() => {
    if (phase !== 'screensaver') return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [phase]);

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
    return <div className="screensaver-dim" onClick={wake} />;
  }

  // Determine what to render based on mode
  const showClock = mode === 'clock' || mode === 'both';
  const showPhotoSlideshow = showPhotos && (photoA || photoB);

  return (
    <div className="screensaver-overlay" onClick={wake}>
      {/* Photo slideshow layers */}
      {showPhotoSlideshow && (
        <div className="screensaver-photo-container">
          <img
            className={`screensaver-photo ${activeLayer === 'a' ? 'screensaver-photo--visible' : 'screensaver-photo--hidden'}`}
            src={photoA || undefined}
            alt=""
          />
          <img
            className={`screensaver-photo ${activeLayer === 'b' ? 'screensaver-photo--visible' : 'screensaver-photo--hidden'}`}
            src={photoB || undefined}
            alt=""
          />
        </div>
      )}

      {/* Clock: full floating (clock mode) or small overlay (both mode) */}
      {showClock && !showPhotoSlideshow && (
        <div
          className="screensaver-clock"
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
        >
          <div className="screensaver-time">{format(now, 'h:mm')}</div>
          <div className="screensaver-date">{format(now, 'EEEE, MMMM d')}</div>
        </div>
      )}

      {/* Clock overlay for "both" mode when photos are showing */}
      {mode === 'both' && showPhotoSlideshow && (
        <div className="screensaver-clock-overlay">
          <div className="screensaver-clock-overlay-time">{format(now, 'h:mm')}</div>
          <div className="screensaver-clock-overlay-date">{format(now, 'EEEE, MMMM d')}</div>
        </div>
      )}

      {/* Fallback: show floating clock when mode includes clock and photos aren't loaded yet */}
      {showClock && showPhotos && !showPhotoSlideshow && (
        <div
          className="screensaver-clock"
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
        >
          <div className="screensaver-time">{format(now, 'h:mm')}</div>
          <div className="screensaver-date">{format(now, 'EEEE, MMMM d')}</div>
        </div>
      )}

      {/* Photo-only mode: still show floating clock if photos haven't loaded */}
      {mode === 'photos' && !showPhotoSlideshow && (
        <div
          className="screensaver-clock"
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
        >
          <div className="screensaver-time">{format(now, 'h:mm')}</div>
          <div className="screensaver-date">{format(now, 'EEEE, MMMM d')}</div>
        </div>
      )}
    </div>
  );
}
