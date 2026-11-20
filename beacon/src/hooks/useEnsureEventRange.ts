import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EVENT_FETCH_DEBOUNCE_MS,
  EventRange,
  LoadedEventRange,
  isInstantCovered,
  isRangeFresh,
} from '../utils/event-fetch-range';

interface UseEnsureEventRangeArgs {
  /** False while Home Assistant is unreachable — skip fetching and loading placeholders. */
  enabled: boolean;
  activeView: string;
  dashboardDate: Date;
  ranges: EventRange[];
  loadedRanges: LoadedEventRange[];
  fetchEvents: (startIso: string, endIso: string) => Promise<void>;
}

/**
 * Loads `ranges` if they are missing or stale.
 *
 * The first load runs immediately. Later changes (day/week navigation) are
 * debounced so clicking through several weeks fires one request for the
 * week the user actually stops on. Ranges already in the cache are not
 * requested again until they go stale, which is what keeps in-week
 * dashboard navigation off the network.
 */
export function useEnsureEventRange({
  enabled,
  activeView,
  dashboardDate,
  ranges,
  loadedRanges,
  fetchEvents,
}: UseEnsureEventRangeArgs): {
  selectedDayLoading: boolean;
  isDayLoaded: (day: Date) => boolean;
} {
  const rangesRef = useRef(ranges);
  rangesRef.current = ranges;
  const loadedRef = useRef(loadedRanges);
  loadedRef.current = loadedRanges;
  const fetchRef = useRef(fetchEvents);
  fetchRef.current = fetchEvents;

  const key = ranges.map((range) => `${range.startMs}:${range.endMs}`).join('|');
  const [settledKey, setSettledKey] = useState<string | null>(null);
  // Set only once a fetch timer actually fires, so StrictMode's setup/cleanup
  // pass does not turn the first load into a debounced one.
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const pending = rangesRef.current;
    const allFresh = pending.every((range) => isRangeFresh(loadedRef.current, range, Date.now()));
    if (allFresh) {
      setSettledKey(key);
      return;
    }

    const delay = hasFetched.current ? EVENT_FETCH_DEBOUNCE_MS : 0;
    const timer = setTimeout(() => {
      hasFetched.current = true;
      const snapshot = rangesRef.current;
      void (async () => {
        try {
          for (const range of snapshot) {
            if (cancelled) return;
            if (isRangeFresh(loadedRef.current, range, Date.now())) continue;
            await fetchRef.current(new Date(range.startMs).toISOString(), new Date(range.endMs).toISOString());
          }
        } catch (err) {
          console.error('Failed to fetch events for the visible range:', err);
        } finally {
          if (!cancelled) setSettledKey(key);
        }
      })();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, key]);

  const isDayLoaded = useCallback((day: Date) => {
    if (!enabled) return true;
    if (isInstantCovered(loadedRanges, day)) return true;
    const wanted = ranges.some((range) => isInstantCovered([range], day));
    // Days this view is not fetching (for example the classic week column
    // past the loaded week) are not pending — leave them on the empty state.
    if (!wanted) return true;
    // A finished attempt that still doesn't cover the day (the request
    // failed, or there are no calendars) should show the empty state.
    return settledKey === key;
  }, [enabled, loadedRanges, settledKey, key, ranges]);

  const selectedDayLoading = activeView === 'dashboard' && enabled && !isDayLoaded(dashboardDate);

  return { selectedDayLoading, isDayLoaded };
}
