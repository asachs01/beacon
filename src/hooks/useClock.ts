import { useEffect, useState } from 'react';
import { startOfDay, isSameDay } from 'date-fns';
import { localDayKey } from '../api/date-keys';

/** Changes every minute — for clocks, which all show hours:minutes. */
export const byMinute = (d: Date) => `${localDayKey(d)} ${d.getHours()}:${d.getMinutes()}`;

/** Changes at local midnight. */
export const byDay = (d: Date) => localDayKey(d);

/** Changes every second — for a clock showing seconds; it wakes every second. */
export const bySecond = (d: Date) => `${byMinute(d)}:${d.getSeconds()}`;

/**
 * The current time, for things that show or depend on it.
 *
 * Wakes at each minute boundary (each second for bySecond), so a clock
 * flips the moment the minute changes, but only updates (re-rendering the
 * caller) when `bucket` says something the caller shows has changed:
 * `useClock(byDay)` re-renders once a day, at midnight. Keep `bucket` a module-level function — a new one
 * every render restarts the timer.
 *
 * Replaces one-second intervals, which re-rendered every card and list on a
 * screen sixty times for each change a viewer could see.
 */
export function useClock(bucket: (d: Date) => string = byMinute): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      const current = new Date();
      setNow((prev) => (bucket(prev) === bucket(current) ? prev : current));
    };

    // Re-measured every time rather than a fixed 60s interval, so the
    // clock never drifts off the minute (or the second, for bySecond).
    const everySecond = bucket === bySecond;
    const schedule = () => {
      const current = new Date();
      const untilNext = everySecond
        ? 1000 - current.getMilliseconds()
        : 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds());
      timer = setTimeout(() => {
        sync();
        schedule();
      }, untilNext);
    };

    // Timers are slowed or paused while the app is in the background;
    // catch up the moment it's on screen again.
    const onVisible = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      sync();
      schedule();
    };

    sync();
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [bucket]);

  return now;
}

/**
 * A day the viewer can browse away from, starting on today. While it's still
 * on today it moves to the new day at midnight, so a wall display left on
 * today's agenda overnight shows the new day in the morning; a day picked
 * with the arrows stays put.
 */
export function useSelectedDay() {
  const now = useClock(byDay);
  const [selected, setSelected] = useState(() => startOfDay(now));
  const [today, setToday] = useState(() => startOfDay(now));

  // Adjusted while rendering (not in an effect) so yesterday is never
  // painted after midnight.
  if (!isSameDay(today, now)) {
    const newToday = startOfDay(now);
    setToday(newToday);
    if (isSameDay(selected, today)) setSelected(newToday);
  }

  return [selected, setSelected] as const;
}
