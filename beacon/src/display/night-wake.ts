/**
 * Urgent wake for night mode.
 *
 * Call `requestNightWake(reason)` when an alarm or other urgent item starts,
 * and `releaseNightWake(reason)` when the person dismisses it. The dim overlay
 * and clock-only screen stay down while any reason is held, and for at least
 * 60 seconds after the request even if it is dismissed sooner.
 *
 * The same contract is available as window events, for callers that should
 * not import this module:
 *   window.dispatchEvent(new CustomEvent('beacon:urgent-wake', { detail: { reason } }))
 *   window.dispatchEvent(new CustomEvent('beacon:urgent-wake-release', { detail: { reason } }))
 *
 * Future features (shared timers, Family Bell) should use a stable reason
 * string such as `family-bell` or `timer:${id}`.
 */
import { useEffect, useState } from 'react';
import { NIGHT_WAKE_MS } from './night-mode';

export const NIGHT_URGENT_WAKE_EVENT = 'beacon:urgent-wake';
export const NIGHT_URGENT_RELEASE_EVENT = 'beacon:urgent-wake-release';

type Listener = () => void;

const listeners = new Set<Listener>();
/** reason -> earliest moment the wake may end (request time + 60 seconds). */
const holds = new Map<string, number>();
/** Wake floor left behind by reasons that were released before 60 seconds. */
let floorUntil = 0;

function emit(): void {
  for (const listener of listeners) listener();
}

function reasonFromEvent(event: Event): string | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== 'object') return null;
  const reason = (detail as { reason?: unknown }).reason;
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function requestNightWake(reason: string): void {
  const trimmed = reason.trim();
  if (!trimmed) return;
  const until = Date.now() + NIGHT_WAKE_MS;
  const previous = holds.get(trimmed);
  holds.set(trimmed, previous == null ? until : Math.max(previous, until));
  emit();
}

export function releaseNightWake(reason: string): void {
  const trimmed = reason.trim();
  const minUntil = holds.get(trimmed);
  if (minUntil == null) return;
  holds.delete(trimmed);
  floorUntil = Math.max(floorUntil, minUntil);
  emit();
}

export function isNightWakeHeld(now = Date.now()): boolean {
  if (holds.size > 0) return true;
  return now < floorUntil;
}

/** Milliseconds until a released wake floor expires, or null while a hold is active. */
export function msUntilNightWakeChange(now = Date.now()): number | null {
  if (holds.size > 0) return null;
  if (now < floorUntil) return floorUntil - now;
  return null;
}

export function subscribeNightWake(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drop holds. Tests use this so cases do not leak into each other. */
export function resetNightWakeForTests(): void {
  holds.clear();
  floorUntil = 0;
  emit();
}

export function useNightWakeHeld(): boolean {
  const [held, setHeld] = useState(() => isNightWakeHeld());

  useEffect(() => {
    let timer = 0;
    const update = () => {
      setHeld(isNightWakeHeld());
      window.clearTimeout(timer);
      const delay = msUntilNightWakeChange();
      if (delay != null) timer = window.setTimeout(update, delay);
    };
    update();
    const unsubscribe = subscribeNightWake(update);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  return held;
}

function installNightWakeEvents(): void {
  if (typeof window === 'undefined') return;
  const host = window as Window & { __beaconNightWake?: boolean };
  if (host.__beaconNightWake) return;
  host.__beaconNightWake = true;
  window.addEventListener(NIGHT_URGENT_WAKE_EVENT, (event) => {
    const reason = reasonFromEvent(event);
    if (reason) requestNightWake(reason);
  });
  window.addEventListener(NIGHT_URGENT_RELEASE_EVENT, (event) => {
    const reason = reasonFromEvent(event);
    if (reason) releaseNightWake(reason);
  });
}

installNightWakeEvents();
