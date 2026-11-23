/**
 * The chore reset time the open page is using.
 *
 * Settings live in each useSettings() copy. Privileges and the chore chart
 * read this one value so a change in Settings applies on the next render
 * without each screen loading settings again. Null means midnight.
 */

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
