import { useEffect, useState } from 'react';
import { loadDataSync } from '../api/beacon-store';
import {
  NIGHT_EVAL_MS,
  isNightModeActive,
  nightScheduleFromUnknown,
  type NightModeSchedule,
} from './night-mode';

const SETTINGS_KEY = 'beacon-settings';

/**
 * Whether night mode should be on for the device's local clock.
 * Re-checks on each minute boundary and whenever the page becomes visible.
 * Before settings have loaded, a previously saved schedule is used so the
 * first paint matches what was stored. An install that never saved night
 * mode stays off.
 */
export function useNightScheduleActive(schedule: NightModeSchedule, ready: boolean): boolean {
  const [stored] = useState(() => nightScheduleFromUnknown(loadDataSync<unknown>(SETTINGS_KEY, null)));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;
    const tick = () => setNow(new Date());
    const arm = () => {
      const remainder = NIGHT_EVAL_MS - (Date.now() % NIGHT_EVAL_MS);
      const delay = remainder === 0 ? NIGHT_EVAL_MS : remainder;
      timer = window.setTimeout(() => {
        tick();
        arm();
      }, delay);
    };
    arm();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const effective = !ready && stored ? stored : schedule;
  return isNightModeActive(effective, now);
}
