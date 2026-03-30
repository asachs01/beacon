import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Flag, X, Plus } from 'lucide-react';

const PRESETS = [
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
];

type TimerMode = 'stopwatch' | 'timers';

interface TimerProps {
  compact?: boolean;
}

interface TimerInstance {
  id: string;
  name: string;
  totalMs: number;
  startedAt: number;
  pausedElapsed: number;
  running: boolean;
  finished: boolean;
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

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.3;

    osc.start();
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

let nextTimerId = 1;

export function Timer({ compact = false }: TimerProps) {
  const [mode, setMode] = useState<TimerMode>('timers');

  // --- Multi-timer state ---
  const [timers, setTimers] = useState<TimerInstance[]>([]);
  const [newName, setNewName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(300); // 5m default
  const timersRef = useRef<TimerInstance[]>([]);
  const rafRef = useRef<number>(0);
  const beeped = useRef<Set<string>>(new Set());

  // Keep ref in sync
  timersRef.current = timers;

  // --- Stopwatch state ---
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsed, setSwElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const swStartRef = useRef<number>(0);
  const swBaseRef = useRef<number>(0);
  const swRafRef = useRef<number>(0);

  // Single RAF loop for all countdown timers
  const tickTimers = useCallback(() => {
    const now = performance.now();

    setTimers((prev) => {
      const next = prev.map((t) => {
        if (!t.running || t.finished) return t;
        const currentElapsed = t.pausedElapsed + (now - t.startedAt);
        if (currentElapsed >= t.totalMs) {
          if (!beeped.current.has(t.id)) {
            beeped.current.add(t.id);
            playBeep();
          }
          return { ...t, running: false, finished: true, pausedElapsed: t.totalMs };
        }
        return t;
      });
      return next;
    });

    // We always keep ticking if there are running timers — re-check in the next frame
    rafRef.current = requestAnimationFrame(tickTimers);
  }, []);

  // Start/stop the RAF loop based on whether any timer is running
  useEffect(() => {
    const hasRunning = timers.some((t) => t.running && !t.finished);
    if (hasRunning) {
      rafRef.current = requestAnimationFrame(tickTimers);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [timers, tickTimers]);

  // Compute remaining time for display (called during render)
  function getRemaining(t: TimerInstance): number {
    if (t.finished) return 0;
    const elapsed = t.running
      ? t.pausedElapsed + (performance.now() - t.startedAt)
      : t.pausedElapsed;
    return Math.max(0, t.totalMs - elapsed);
  }

  const addTimer = useCallback(() => {
    const name = newName.trim() || `Timer ${nextTimerId}`;
    const t: TimerInstance = {
      id: `t-${nextTimerId++}-${Date.now()}`,
      name,
      totalMs: selectedPreset * 1000,
      startedAt: performance.now(),
      pausedElapsed: 0,
      running: true,
      finished: false,
    };
    setTimers((prev) => [...prev, t]);
    setNewName('');
  }, [newName, selectedPreset]);

  const pauseTimer = useCallback((id: string) => {
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id || !t.running) return t;
        const elapsed = t.pausedElapsed + (performance.now() - t.startedAt);
        return { ...t, running: false, pausedElapsed: elapsed };
      }),
    );
  }, []);

  const resumeTimer = useCallback((id: string) => {
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id || t.running || t.finished) return t;
        return { ...t, running: true, startedAt: performance.now() };
      }),
    );
  }, []);

  const cancelTimer = useCallback((id: string) => {
    beeped.current.delete(id);
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // --- Stopwatch logic ---
  const swTick = useCallback(() => {
    const now = performance.now();
    setSwElapsed(swBaseRef.current + (now - swStartRef.current));
    swRafRef.current = requestAnimationFrame(swTick);
  }, []);

  useEffect(() => {
    if (swRunning) {
      swStartRef.current = performance.now();
      swRafRef.current = requestAnimationFrame(swTick);
    }
    return () => cancelAnimationFrame(swRafRef.current);
  }, [swRunning, swTick]);

  const swStart = useCallback(() => setSwRunning(true), []);
  const swPause = useCallback(() => {
    swBaseRef.current = swElapsed;
    setSwRunning(false);
  }, [swElapsed]);
  const swReset = useCallback(() => {
    cancelAnimationFrame(swRafRef.current);
    setSwRunning(false);
    setSwElapsed(0);
    setLaps([]);
    swBaseRef.current = 0;
  }, []);
  const swLap = useCallback(() => {
    if (swRunning) setLaps((prev) => [...prev, swElapsed]);
  }, [swRunning, swElapsed]);

  return (
    <div className={`timer ${compact ? 'timer--compact' : ''}`}>
      {/* Mode switcher */}
      <div className="timer-modes">
        <button
          type="button"
          className={`timer-mode-btn ${mode === 'timers' ? 'timer-mode-btn--active' : ''}`}
          onClick={() => setMode('timers')}
        >
          Timers
        </button>
        <button
          type="button"
          className={`timer-mode-btn ${mode === 'stopwatch' ? 'timer-mode-btn--active' : ''}`}
          onClick={() => setMode('stopwatch')}
        >
          Stopwatch
        </button>
      </div>

      {mode === 'timers' && (
        <>
          {/* Add Timer section */}
          <div className="timer-add-section">
            <input
              type="text"
              className="timer-name-input"
              placeholder="Timer name (optional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTimer(); }}
            />
            <div className="timer-presets">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`timer-preset ${selectedPreset === p.seconds ? 'timer-preset--active' : ''}`}
                  onClick={() => setSelectedPreset(p.seconds)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="timer-btn timer-btn--play timer-start-btn"
              onClick={addTimer}
              title="Start timer"
            >
              <Plus size={compact ? 14 : 16} />
              <span>Start</span>
            </button>
          </div>

          {/* Active timers list */}
          {timers.length > 0 && (
            <div className="timer-list">
              {timers.map((t) => {
                const remaining = getRemaining(t);
                return (
                  <div
                    key={t.id}
                    className={`timer-card ${t.finished ? 'timer-card--finished' : ''}`}
                  >
                    <div className="timer-card-name">{t.name}</div>
                    <div className={`timer-card-time ${t.finished ? 'timer-display--finished' : ''}`}>
                      {formatTime(remaining)}
                    </div>
                    <div className="timer-card-controls">
                      {!t.finished && (
                        t.running ? (
                          <button
                            type="button"
                            className="timer-btn timer-btn--pause timer-btn--sm"
                            onClick={() => pauseTimer(t.id)}
                            title="Pause"
                          >
                            <Pause size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="timer-btn timer-btn--play timer-btn--sm"
                            onClick={() => resumeTimer(t.id)}
                            title="Resume"
                          >
                            <Play size={14} />
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        className="timer-btn timer-btn--sm"
                        onClick={() => cancelTimer(t.id)}
                        title="Remove"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {mode === 'stopwatch' && (
        <>
          <div className="timer-display">
            {formatTime(swElapsed)}
          </div>

          <div className="timer-controls">
            {!swRunning ? (
              <button
                type="button"
                className="timer-btn timer-btn--play"
                onClick={swStart}
                title="Start"
              >
                <Play size={compact ? 16 : 20} />
              </button>
            ) : (
              <button
                type="button"
                className="timer-btn timer-btn--pause"
                onClick={swPause}
                title="Pause"
              >
                <Pause size={compact ? 16 : 20} />
              </button>
            )}

            {swRunning && (
              <button
                type="button"
                className="timer-btn"
                onClick={swLap}
                title="Lap"
              >
                <Flag size={compact ? 16 : 20} />
              </button>
            )}

            {(swElapsed > 0) && (
              <button
                type="button"
                className="timer-btn"
                onClick={swReset}
                title="Reset"
              >
                <RotateCcw size={compact ? 16 : 20} />
              </button>
            )}
          </div>

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
        </>
      )}
    </div>
  );
}
