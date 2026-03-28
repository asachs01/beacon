import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Flag, Timer as TimerIcon } from 'lucide-react';

const PRESETS = [
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
];

type TimerMode = 'stopwatch' | 'countdown';

interface TimerProps {
  compact?: boolean;
}

function formatTime(totalMs: number): string {
  const totalSec = Math.max(0, Math.floor(totalMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Play a short beep using Web Audio API. No external files needed.
 */
function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = 880; // A5
    osc.type = 'sine';
    gain.gain.value = 0.3;

    osc.start();
    // Beep pattern: 3 short beeps
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.setValueAtTime(0, now + 0.15);
    gain.gain.setValueAtTime(0.3, now + 0.25);
    gain.gain.setValueAtTime(0, now + 0.4);
    gain.gain.setValueAtTime(0.3, now + 0.5);
    gain.gain.setValueAtTime(0, now + 0.65);

    osc.stop(now + 0.7);
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Audio may not be available
  }
}

export function Timer({ compact = false }: TimerProps) {
  const [mode, setMode] = useState<TimerMode>('countdown');
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // ms elapsed
  const [countdownTotal, setCountdownTotal] = useState(300_000); // 5 min default
  const [laps, setLaps] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const startTimeRef = useRef<number>(0);
  const baseElapsedRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const beeped = useRef(false);

  const tick = useCallback(() => {
    const now = performance.now();
    const current = baseElapsedRef.current + (now - startTimeRef.current);
    setElapsed(current);

    // Check if countdown finished
    if (mode === 'countdown' && current >= countdownTotal && !beeped.current) {
      beeped.current = true;
      setFinished(true);
      setRunning(false);
      playBeep();
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [mode, countdownTotal]);

  useEffect(() => {
    if (running) {
      startTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, tick]);

  const handleStart = useCallback(() => {
    if (finished) return;
    setRunning(true);
  }, [finished]);

  const handlePause = useCallback(() => {
    baseElapsedRef.current = elapsed;
    setRunning(false);
  }, [elapsed]);

  const handleReset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
    setElapsed(0);
    setLaps([]);
    setFinished(false);
    baseElapsedRef.current = 0;
    beeped.current = false;
  }, []);

  const handleLap = useCallback(() => {
    if (!running) return;
    setLaps((prev) => [...prev, elapsed]);
  }, [running, elapsed]);

  const handlePreset = useCallback((seconds: number) => {
    handleReset();
    setMode('countdown');
    setCountdownTotal(seconds * 1000);
  }, [handleReset]);

  const handleSwitchMode = useCallback(() => {
    handleReset();
    setMode((prev) => (prev === 'stopwatch' ? 'countdown' : 'stopwatch'));
  }, [handleReset]);

  const displayMs = mode === 'countdown'
    ? Math.max(0, countdownTotal - elapsed)
    : elapsed;

  return (
    <div className={`timer ${compact ? 'timer--compact' : ''}`}>
      {/* Mode switcher */}
      <div className="timer-modes">
        <button
          type="button"
          className={`timer-mode-btn ${mode === 'countdown' ? 'timer-mode-btn--active' : ''}`}
          onClick={handleSwitchMode}
        >
          Timer
        </button>
        <button
          type="button"
          className={`timer-mode-btn ${mode === 'stopwatch' ? 'timer-mode-btn--active' : ''}`}
          onClick={handleSwitchMode}
        >
          Stopwatch
        </button>
      </div>

      {/* Display */}
      <div className={`timer-display ${finished ? 'timer-display--finished' : ''}`}>
        {formatTime(displayMs)}
      </div>

      {/* Presets (countdown mode only) */}
      {mode === 'countdown' && !running && !finished && (
        <div className="timer-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`timer-preset ${countdownTotal === p.seconds * 1000 ? 'timer-preset--active' : ''}`}
              onClick={() => handlePreset(p.seconds)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="timer-controls">
        {!running ? (
          <button
            type="button"
            className="timer-btn timer-btn--play"
            onClick={finished ? handleReset : handleStart}
            title={finished ? 'Reset' : 'Start'}
          >
            {finished ? (
              <RotateCcw size={compact ? 16 : 20} />
            ) : (
              <Play size={compact ? 16 : 20} />
            )}
          </button>
        ) : (
          <button
            type="button"
            className="timer-btn timer-btn--pause"
            onClick={handlePause}
            title="Pause"
          >
            <Pause size={compact ? 16 : 20} />
          </button>
        )}

        {mode === 'stopwatch' && running && (
          <button
            type="button"
            className="timer-btn"
            onClick={handleLap}
            title="Lap"
          >
            <Flag size={compact ? 16 : 20} />
          </button>
        )}

        {(elapsed > 0 || finished) && (
          <button
            type="button"
            className="timer-btn"
            onClick={handleReset}
            title="Reset"
          >
            <RotateCcw size={compact ? 16 : 20} />
          </button>
        )}
      </div>

      {/* Laps */}
      {!compact && laps.length > 0 && (
        <div className="timer-laps">
          {laps.map((lap, i) => (
            <div key={i} className="timer-lap">
              <span className="timer-lap-label">Lap {i + 1}</span>
              <span className="timer-lap-time">{formatTime(lap)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small icon button for the sidebar */
export function TimerSidebarIcon({
  onClick,
  active,
}: {
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      className={`sidebar-icon ${active ? 'sidebar-icon--active' : ''}`}
      onClick={onClick}
      title="Timer"
      aria-label="Timer"
    >
      <TimerIcon size={24} strokeWidth={1.5} />
    </button>
  );
}
