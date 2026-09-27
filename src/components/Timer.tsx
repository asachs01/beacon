import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, RotateCcw, Flag, X, Plus, Volume2, BellOff, BellRing } from 'lucide-react';
import '../styles/timer.css';
import '../styles/glass.css';

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
  /**
   * Whether the Timer screen is showing. App keeps it mounted once opened,
   * so timers keep counting and ring on other screens, where a timer that's
   * up shows a notice to stop it. (Leaving the screen used to end them all.)
   */
  shown?: boolean;
  /** Opens the Timer screen, from that notice. */
  onShow?: () => void;
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

export function Timer({ compact = false, shown = true, onShow }: TimerProps) {
  const [mode, setMode] = useState<TimerMode>('timers');
  const [sound, setSound] = useState<SoundName>(getStoredSound);

  // --- Multi-timer state ---
  const [timers, setTimers] = useState<TimerInstance[]>([]);
  const [newName, setNewName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(300); // 5m default
  const beeped = useRef<Set<string>>(new Set());

  // Track looping beep intervals per timer id
  const loopIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

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
    const loopIntervals = loopIntervalsRef.current;
    return () => {
      loopIntervals.forEach((interval) => clearInterval(interval));
      loopIntervals.clear();
    };
  }, []);

  // --- Stopwatch state ---
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsed, setSwElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const swStartRef = useRef<number>(0);
  const swBaseRef = useRef<number>(0);

  // We need a ref for sound so the tick callback always sees the latest value
  const soundRef = useRef(sound);
  soundRef.current = sound;

  // One clock for every countdown, four times a second: it rings the timers
  // that are up, and redraws the countdowns while the screen shows. (It
  // redrew on every animation frame, which it would now also do behind
  // other screens.)
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!timers.some((t) => t.running && !t.finished)) return;
    const tick = () => {
      const now = performance.now();
      const due = timers.filter((t) => t.running && !t.finished && t.pausedElapsed + (now - t.startedAt) >= t.totalMs);
      if (due.length === 0) {
        if (shown) setNow(now);
        return;
      }
      for (const t of due) {
        if (!beeped.current.has(t.id)) {
          beeped.current.add(t.id);
          startBeepLoop(t.id, soundRef.current);
        }
      }
      const dueIds = new Set(due.map((t) => t.id));
      setTimers((prev) => prev.map((t) => (
        dueIds.has(t.id) ? { ...t, running: false, finished: true, pausedElapsed: t.totalMs } : t
      )));
    };
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [timers, shown, startBeepLoop]);

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
  /** Time on the running stopwatch: what ran before this start, plus since. */
  const swReading = useCallback(() => swBaseRef.current + (performance.now() - swStartRef.current), []);

  // Redrawn while the screen shows; pause and lap read the time themselves.
  useEffect(() => {
    if (!swRunning || !shown) return;
    const redraw = () => setSwElapsed(swReading());
    redraw();
    const interval = setInterval(redraw, 250);
    return () => clearInterval(interval);
  }, [swRunning, shown, swReading]);

  const swStart = useCallback(() => {
    swStartRef.current = performance.now();
    setSwRunning(true);
  }, []);
  const swPause = useCallback(() => {
    swBaseRef.current = swReading();
    setSwElapsed(swBaseRef.current);
    setSwRunning(false);
  }, [swReading]);
  const swReset = useCallback(() => {
    setSwRunning(false);
    setSwElapsed(0);
    setLaps([]);
    swBaseRef.current = 0;
  }, []);
  const swLap = useCallback(() => {
    if (swRunning) setLaps((prev) => [...prev, swReading()]);
  }, [swRunning, swReading]);

  /** Timers that are up and sounding until dismissed. */
  const ringing = timers.filter((t) => t.finished);

  return (
    <div className={`timer ${compact ? 'timer--compact' : ''}`}>
      <div className="timer-bg" aria-hidden="true" />
      <div className="timer-scroll">

      {/* Mode switcher: an iOS segmented control */}
      <div className="timer-modes" role="group" aria-label="Mode">
        <button
          type="button"
          className={`timer-mode-btn ${mode === 'timers' ? 'timer-mode-btn--active' : ''}`}
          onClick={() => setMode('timers')}
          aria-pressed={mode === 'timers'}
        >
          Timers
        </button>
        <button
          type="button"
          className={`timer-mode-btn ${mode === 'stopwatch' ? 'timer-mode-btn--active' : ''}`}
          onClick={() => setMode('stopwatch')}
          aria-pressed={mode === 'stopwatch'}
        >
          Stopwatch
        </button>
      </div>

      {mode === 'timers' && (
        <div className="timer-body timer-body--timers">
          {/* New timer */}
          <section className="timer-tile timer-add-section" aria-label="New timer">
            <div className="timer-presets">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`timer-preset ${selectedPreset === p.seconds ? 'timer-preset--active' : ''}`}
                  onClick={() => setSelectedPreset(p.seconds)}
                  aria-pressed={selectedPreset === p.seconds}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="timer-name-input"
              placeholder="Timer name (optional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTimer(); }}
            />
            <div className="timer-sound-picker">
              <Volume2 size={16} className="timer-sound-icon" aria-hidden="true" />
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
                  aria-pressed={sound === opt.key}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="timer-start-btn"
              onClick={addTimer}
              title="Start timer"
            >
              <Plus size={20} aria-hidden="true" />
              <span>Start</span>
            </button>
          </section>

          {/* Running timers, each with a ring that empties as it counts down */}
          <section className="timer-list" aria-label="Timers">
            {timers.length === 0 && (
              <p className="timer-list-empty">Pick a time and press Start. Timers keep running on other screens.</p>
            )}
            {timers.map((t) => {
              const remaining = getRemaining(t);
              const left = t.totalMs > 0 ? remaining / t.totalMs : 0;
              return (
                <div
                  key={t.id}
                  className={`timer-card ${t.finished ? 'timer-card--finished' : ''} ${!t.running && !t.finished ? 'timer-card--paused' : ''}`}
                >
                  <div className="timer-ring">
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                      <circle className="timer-ring-track" cx="50" cy="50" r="45" />
                      <circle
                        className="timer-ring-fill"
                        cx="50"
                        cy="50"
                        r="45"
                        pathLength={1}
                        strokeDasharray="1"
                        strokeDashoffset={1 - left}
                      />
                    </svg>
                    <div className="timer-ring-text">
                      <span className={`timer-card-time ${t.finished ? 'timer-display--finished' : ''}`}>
                        {formatTime(remaining)}
                      </span>
                      <span className="timer-card-name">{t.name}</span>
                    </div>
                  </div>
                  <div className="timer-card-controls">
                    <button
                      type="button"
                      className="timer-btn timer-btn--sm"
                      onClick={() => cancelTimer(t.id)}
                      title="Remove"
                      aria-label={`Remove ${t.name}`}
                    >
                      <X size={18} />
                    </button>
                    {t.finished ? (
                      <button
                        type="button"
                        className="timer-btn timer-btn--dismiss timer-btn--sm"
                        onClick={() => dismissTimer(t.id)}
                        title="Dismiss alarm"
                      >
                        <BellOff size={18} />
                      </button>
                    ) : t.running ? (
                      <button
                        type="button"
                        className="timer-btn timer-btn--pause timer-btn--sm"
                        onClick={() => pauseTimer(t.id)}
                        title="Pause"
                      >
                        <Pause size={18} fill="currentColor" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="timer-btn timer-btn--play timer-btn--sm"
                        onClick={() => resumeTimer(t.id)}
                        title="Resume"
                      >
                        <Play size={18} fill="currentColor" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {mode === 'stopwatch' && (
        <div className="timer-body timer-body--stopwatch">
          <div className="timer-stopwatch">
            <div className="timer-display">
              {formatTime(swElapsed)}
            </div>

            {/* As on iOS: Lap / Reset on the left, Start / Stop on the right */}
            <div className="timer-controls">
              {swRunning ? (
                <button type="button" className="timer-btn" onClick={swLap} title="Lap">
                  <Flag size={compact ? 16 : 22} />
                </button>
              ) : (
                <button
                  type="button"
                  className="timer-btn"
                  onClick={swReset}
                  title="Reset"
                  disabled={swElapsed === 0}
                >
                  <RotateCcw size={compact ? 16 : 22} />
                </button>
              )}
              {!swRunning ? (
                <button type="button" className="timer-btn timer-btn--play" onClick={swStart} title="Start">
                  <Play size={compact ? 16 : 22} fill="currentColor" />
                </button>
              ) : (
                <button type="button" className="timer-btn timer-btn--pause" onClick={swPause} title="Pause">
                  <Pause size={compact ? 16 : 22} fill="currentColor" />
                </button>
              )}
            </div>
          </div>

          {!compact && laps.length > 0 && (
            <ol className="timer-tile timer-laps" aria-label="Laps">
              {laps.map((lap, i) => ({ lap, i })).reverse().map(({ lap, i }) => (
                <li key={i} className="timer-lap">
                  <span className="timer-lap-label">Lap {i + 1}</span>
                  <span className="timer-lap-time">{formatTime(lap - (laps[i - 1] ?? 0))}</span>
                  <span className="timer-lap-total">{formatTime(lap)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      </div>

      {/* On another screen (this one is hidden): the timer that's ringing */}
      {!shown && ringing.length > 0 && createPortal(
        <div className="timer-ringing" role="alert">
          <BellRing size={20} aria-hidden="true" />
          <span className="timer-ringing-text">
            {ringing.length === 1 ? `${ringing[0].name} is done` : `${ringing.length} timers are done`}
          </span>
          <button
            type="button"
            className="timer-ringing-btn"
            onClick={() => ringing.forEach((t) => dismissTimer(t.id))}
          >
            Stop
          </button>
          {onShow && (
            <button type="button" className="timer-ringing-btn timer-ringing-btn--secondary" onClick={onShow}>
              Show
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
