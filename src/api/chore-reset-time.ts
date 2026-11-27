/**
 * The chore reset time the open page is using.
 *
 * Settings live in each useSettings() copy. Privileges and the chore chart
 * read this one value so a change in Settings applies on the next render
 * without each screen loading settings again. Null means midnight.
 */

/** Settings → Chores → Daily Reset Time. Exactly HH:mm, 00:00–23:59. */
const CHORE_RESET_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidChoreResetTime(value: unknown): boolean {
  return typeof value === 'string' && CHORE_RESET_TIME.test(value.trim());
}

type Listener = () => void;

let current: string | null = null;
const listeners = new Set<Listener>();

export function publishChoreResetTime(resetTime: string | null | undefined): void {
  const next = typeof resetTime === 'string' ? resetTime : null;
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

export function getChoreResetTime(): string | null {
  return current;
}

export function subscribeChoreResetTime(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
