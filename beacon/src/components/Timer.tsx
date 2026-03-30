import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Flag, X, Plus, Volume2, BellOff } from 'lucide-react';

const PRESETS = [
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
];

type TimerMode = 'stopwatch' | 'timers';

type SoundName = 'beep' | 'chime' | 'alarm' | 'kitchen' | 'gentle';

const SOUND_OPTIONS: { key: SoundName; label: string }[] = [
  { key: 'chime', label: 'Chime' },
  { key: 'beep', label: 'Beep' },
  { key: 'alarm', label: 'Alarm' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'gentle', label: 'Gentle' },
];

const STORAGE_KEY = 'beacon-timer-sound';

function getStoredSound(): SoundName {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && SOUND_OPTIONS.some((o) => o.key === v)) return v as SoundName;
  } catch { /* ignore */ }
  return 'chime';
}

/** Play a single instance of the chosen sound. Returns the AudioContext so it can be closed. */
function playSoundOnce(sound: SoundName): AudioContext | null {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (sound === 'beep') {
      // 880Hz sine wave, 3 short beeps
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.setValueAtTime(0, now + 0.15);
      gain.gain.setValueAtTime(0.3, now + 0.25);
      gain.gain.setValueAtTime(0, now + 0.4);
      gain.gain.setValueAtTime(0.3, now + 0.5);
      gain.gain.setValueAtTime(0, now + 0.65);
      osc.start(now);
      osc.stop(now + 0.7);
    } else if (sound === 'chime') {
      // Descending tones: C5 (523), G4 (392), E4 (330)
      const freqs = [523, 392, 330];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const t = now + i * 0.3;
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.45);
      });
    } else if (sound === 'alarm') {
      // Alternating 600Hz/900Hz, urgent
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'square';
      gain.gain.value = 0.2;
      for (let i = 0; i < 6; i++) {
        const t = now + i * 0.15;
        osc.frequency.setValueAtTime(i % 2 === 0 ? 600 : 900, t);
      }
      osc.start(now);
      osc.stop(now + 0.9);
    } else if (sound === 'kitchen') {
      // Rapid high-pitched beeps at 1200Hz
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.frequency.value = 1200;
      osc.type = 'sine';
      for (let i = 0; i < 5; i++) {
        const t = now + i * 0.12;
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.setValueAtTime(0, t + 0.06);
      }
      osc.start(now);
      osc.stop(now + 0.65);
    } else if (sound === 'gentle') {
      // Soft low tone 440Hz with slow fade
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.frequency.value = 440;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      osc.start(now);
      osc.stop(now + 1.6);
    }

    // Auto-close after 2s to free resources
    setTimeout(() => { try { ctx.close(); } catch { /* */ } }, 2000);
    return ctx;
  } catch {
    return null;
  }
}

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

let nextTimerId = 1;

export function Timer({ compact = false }: TimerProps) {
  const [mode, setMode] = useState<TimerMode>('timers');
  const [sound, setSound] = useState<SoundName>(getStoredSound);

  // --- Multi-timer state ---
  const [timers, setTimers] = useState<TimerInstance[]>([]);
  const [newName, setNewName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(300); // 5m default
  const timersRef = useRef<TimerInstance[]>([]);
  const rafRef = useRef<number>(0);
  const beeped = useRef<Set<string>>(new Set());

  // Track looping beep intervals per timer id
  const loopIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Keep ref in sync
  timersRef.current = timers;

  // Persist sound choice
  const changeSound = useCallback((s: SoundName) => {
    setSound(s);
    try { localStorage.setItem(STORAGE_KEY, s); } catch { /* */ }
  }, []);

  // Start looping beep for a timer
  const startBeepLoop = useCallback((timerId: string, soundName: SoundName) => {
    // Play immediately
    playSoundOnce(soundName);
    // Then repeat every 2.5 seconds
    const interval = setInterval(() => {
      playSoundOnce(soundName);
    }, 2500);
    loopIntervalsRef.current.set(timerId, interval);
  }, []);

  // Stop looping beep for a timer
  const stopBeepLoop = useCallback((timerId: string) => {
    const interval = loopIntervalsRef.current.get(timerId);
    if (interval) {
      clearInterval(interval);
      loopIntervalsRef.current.delete(timerId);
    }
  }, []);

  // Cleanup all loops on unmount
  useEffect(() => {
    return () => {
      loopIntervalsRef.current.forEach((interval) => clearInterval(interval));
      loopIntervalsRef.current.clear();
    };
  }, []);

  // --- Stopwatch state ---
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsed, setSwElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const swStartRef = useRef<number>(0);
  const swBaseRef = useRef<number>(0);
  const swRafRef = useRef<number>(0);

  // We need a ref for sound so the tick callback always sees the latest value
  const soundRef = useRef(sound);
  soundRef.current = sound;

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
            startBeepLoop(t.id, soundRef.current);
          }
          return { ...t, running: false, finished: true, pausedElapsed: t.totalMs };
        }
        return t;
      });
      return next;
    });

    rafRef.current = requestAnimationFrame(tickTimers);
  }, [startBeepLoop]);

  // Start/stop the RAF loop based on whether any timer is running
  useEffect(() => {
    const hasRunning = timers.some((t) => t.running && !t.finished);
    if (hasRunning) {
      rafRef.current = requestAnimationFrame(tickTimers);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [timers, tickTimers]);

  // Compute remaining time for display
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

  const dismissTimer = useCallback((id: string) => {
    stopBeepLoop(id);
    beeped.current.delete(id);
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        // Reset to initial state so user can restart or just sees it stopped
        return { ...t, finished: false, running: false, pausedElapsed: 0 };
      }),
    );
  }, [stopBeepLoop]);

  const cancelTimer = useCallback((id: string) => {
    stopBeepLoop(id);
    beeped.current.delete(id);
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }, [stopBeepLoop]);

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
          {/* Sound picker */}
          <div className="timer-sound-picker">
            <Volume2 size={14} className="timer-sound-icon" />
            {SOUND_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`timer-sound-btn ${sound === opt.key ? 'timer-sound-btn--active' : ''}`}
                onClick={() => {
                  changeSound(opt.key);
                  playSoundOnce(opt.key);
                }}
                title={`Preview ${opt.label}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

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
                      {t.finished && (
                        <button
                          type="button"
                          className="timer-btn timer-btn--dismiss timer-btn--sm"
                          onClick={() => dismissTimer(t.id)}
                          title="Dismiss alarm"
                        >
                          <BellOff size={14} />
                        </button>
                      )}
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
