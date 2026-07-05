import { Routine } from '../../types/family';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

const ORDER: TimeOfDay[] = ['morning', 'afternoon', 'evening'];

/** morning < 12:00, afternoon 12:00–16:59, evening >= 17:00 (local time) */
export function getTimeOfDay(date: Date): TimeOfDay {
  const h = date.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export interface RoutinePick {
  routine: Routine;
  isCurrent: boolean;
  /** empty when current; otherwise e.g. "This afternoon", "Tonight", "Tomorrow morning" */
  label: string;
}

const PREVIEW_LABELS: Record<TimeOfDay, string> = {
  morning: 'This morning',
  afternoon: 'This afternoon',
  evening: 'Tonight',
};

/**
 * Pick the routine to show: the current period's, else search forward with
 * wraparound (evening -> tomorrow morning). Returns null when the member has
 * no routines at all.
 */
export function pickRoutine(routines: Routine[], now: Date): RoutinePick | null {
  if (routines.length === 0) return null;
  const startIdx = ORDER.indexOf(getTimeOfDay(now));
  for (let offset = 0; offset < ORDER.length; offset++) {
    const idx = (startIdx + offset) % ORDER.length;
    const period = ORDER[idx];
    const routine = routines.find((r) => r.time_of_day === period);
    if (!routine) continue;
    const isCurrent = offset === 0;
    const wrapped = startIdx + offset >= ORDER.length;
    const label = isCurrent
      ? ''
      : wrapped
        ? `Tomorrow ${period}`
        : PREVIEW_LABELS[period];
    return { routine, isCurrent, label };
  }
  return null;
}
