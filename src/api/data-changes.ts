/**
 * Keeps this display in step with changes made elsewhere: on another
 * display, or by the Google Tasks sync. The add-on server counts the writes
 * to each stored key (GET /beacon-action/changes); this asks for the counts
 * every 15 seconds while the display is awake, and tells whoever shows a key
 * that changed to load it again. Displays used to load family data only when
 * opened, at midnight or after their own changes, and settings, the
 * built-in calendar and lists only when the page was shown again — which a
 * wall display never is — so another display's changes didn't show.
 *
 * Only in the add-on; standalone, everything is stored on this device.
 */
import { getIngressBasePath, isAddOn } from '../utils/ha-env';
import { refreshWhileAwake } from '../utils/display-sleep';

const POLL_MS = 15_000;

interface Counts {
  /** Changes when the add-on restarts, which starts the counts over. */
  boot: string;
  counts: Record<string, number>;
}

const subscriptions = new Set<{ keys: string[]; listener: () => void }>();
let last: Counts | null = null;
let checking = false;

/**
 * Calls `listener` once whenever any of `keys` (collection names or
 * /beacon-data keys) has changed. Returns the unsubscribe.
 */
export function onDataChanged(keys: string | string[], listener: () => void): () => void {
  const subscription = { keys: Array.isArray(keys) ? keys : [keys], listener };
  subscriptions.add(subscription);
  return () => {
    subscriptions.delete(subscription);
  };
}

/** Asks the server once, and tells the subscribers of whatever changed. */
export async function checkForChanges(): Promise<void> {
  if (checking) return;
  checking = true;
  let next: Counts;
  try {
    const res = await fetch(`${getIngressBasePath()}/beacon-action/changes`, { cache: 'no-store' });
    if (!res.ok) return;
    next = (await res.json()) as Counts;
  } catch {
    return;
  } finally {
    checking = false;
  }
  if (typeof next?.boot !== 'string' || !next.counts || typeof next.counts !== 'object') return;

  const previous = last;
  last = next;
  // The first answer is where counting starts: this display has just
  // loaded what it shows.
  if (!previous) return;
  const restarted = previous.boot !== next.boot;
  const changed = (key: string) => restarted || (next.counts[key] ?? 0) !== (previous.counts[key] ?? 0);
  for (const { keys, listener } of [...subscriptions]) {
    if (keys.some(changed)) listener();
  }
}

/** Starts checking for changes (in the add-on). Returns the stop. */
export function watchDataChanges(): () => void {
  if (!isAddOn()) return () => {};
  void checkForChanges();
  return refreshWhileAwake(() => void checkForChanges(), POLL_MS);
}

/** Test hook: forget the counts and subscribers. */
export function resetDataChanges(): void {
  last = null;
  checking = false;
  subscriptions.clear();
}
