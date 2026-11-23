/**
 * Turn an approved draft into the payload the calendar and list writers
 * already accept. All-day events use an exclusive end date, matching the
 * event editor.
 */
import { addCalendarDays, addMinutesToClock, isCalendarKey } from './calendar';

export interface CalendarWrite {
  summary: string;
  start_date_time?: string;
  end_date_time?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  location?: string;
}

export interface EventDraftInput {
  title: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function calendarWriteFromDraft(
  draft: EventDraftInput,
  durationMinutes: number,
): CalendarWrite | null {
  const summary = draft.title.trim();
  if (!summary || !isCalendarKey(draft.date)) return null;
  const description = draft.notes.trim() || undefined;
  const location = draft.location.trim() || undefined;
  const startTime = draft.startTime.trim();
  const timed = !draft.allDay && TIME_RE.test(startTime);
  if (!timed) {
    return {
      summary,
      start_date: draft.date,
      end_date: addCalendarDays(draft.date, 1),
      description,
      location,
    };
  }
  let endDate = draft.date;
  let endTime = draft.endTime.trim();
  if (!TIME_RE.test(endTime)) {
    const added = addMinutesToClock(draft.date, startTime, durationMinutes > 0 ? durationMinutes : 60);
    endDate = added.date;
    endTime = added.time;
  } else if (endTime <= startTime) {
    endDate = addCalendarDays(draft.date, 1);
  }
  return {
    summary,
    start_date_time: `${draft.date}T${startTime}:00`,
    end_date_time: `${endDate}T${endTime}:00`,
    description,
    location,
  };
}

export interface ListTarget {
  id: string;
  name: string;
}

export function pickCalendarId(calendars: readonly { id: string }[], preferred: string): string {
  if (preferred && calendars.some((calendar) => calendar.id === preferred)) return preferred;
  return calendars[0]?.id ?? '';
}

export function pickListId(lists: readonly ListTarget[], preferred: string, kind: 'grocery' | 'todo'): string {
  if (preferred && lists.some((list) => list.id === preferred)) return preferred;
  const fallback = kind === 'grocery' ? 'beacon-shopping' : 'beacon-todo';
  if (lists.some((list) => list.id === fallback)) return fallback;
  return lists[0]?.id ?? '';
}
