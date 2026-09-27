import { useState, useEffect, useRef } from 'react';
import { format, parseISO, addMonths } from 'date-fns';
import { lastDayOfAllDayEvent } from '../utils/event-dates';
import type { EditScope } from '../utils/calendar-edits';
import { LOCAL_CALENDAR } from '../hooks/useLocalCalendar';
import { CalendarEvent, CalendarInfo, RecurrenceFrequency } from '../types';

interface EventModalProps {
  event: CalendarEvent | null;
  calendars: CalendarInfo[];
  /** The user's configured default calendar (Settings > Calendar). Used as
   *  the initial calendar selection for a NEW event; ignored when editing
   *  an existing event (which keeps the event's own calendar). Falls back
   *  to the first calendar in the list if unset/not a valid calendar id. */
  defaultCalendarId?: string;
  /** Length of a new event (Settings > Default Event Duration). */
  defaultDurationMinutes?: number;
  onSave: (calendarId: string, data: EventFormData) => void | Promise<void>;
  /** `scope` matters for an occurrence of a repeating event. */
  onDelete: (event: CalendarEvent, scope: EditScope) => void | Promise<void>;
  onClose: () => void;
  prefillDate?: string | null;
  prefillTime?: string | null;
}

export interface EventFormData {
  summary: string;
  description: string;
  calendarId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  recurrence: RecurrenceFrequency;
  /** Last day it repeats on; '' for no end. */
  recurrenceEnd: string;
  /** The rule as set elsewhere, kept when `recurrence` is 'custom'. */
  rrule: string;
  /** For an occurrence of a repeating event: which occurrences a change applies to. */
  scope: EditScope;
}

function toLocalDate(isoStr: string): string {
  try {
    return format(parseISO(isoStr), 'yyyy-MM-dd');
  } catch {
    return format(new Date(), 'yyyy-MM-dd');
  }
}

function toLocalTime(isoStr: string): string {
  try {
    return format(parseISO(isoStr), 'HH:mm');
  } catch {
    return '09:00';
  }
}

/** Combine a yyyy-MM-dd date + HH:mm time into a Date for comparison/arithmetic. */
function combineDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

/**
 * Shift `endDate`/`endTime` by the same duration as the shift applied to
 * start, so editing an event's start time preserves its original length
 * instead of leaving a stale (and potentially invalid, end <= start) end
 * time behind.
 */
function shiftEnd(
  oldStartDate: string,
  oldStartTime: string,
  endDate: string,
  endTime: string,
  newStartDate: string,
  newStartTime: string,
): { endDate: string; endTime: string } {
  const oldStart = combineDateTime(oldStartDate, oldStartTime);
  const oldEnd = combineDateTime(endDate, endTime);
  const newStart = combineDateTime(newStartDate, newStartTime);

  let durationMs = oldEnd.getTime() - oldStart.getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    durationMs = 60 * 60 * 1000; // fall back to 1hr if the prior range was invalid/zero
  }

  const newEnd = new Date(newStart.getTime() + durationMs);
  return {
    endDate: format(newEnd, 'yyyy-MM-dd'),
    endTime: format(newEnd, 'HH:mm'),
  };
}

export function EventModal({
  event,
  calendars,
  defaultCalendarId,
  defaultDurationMinutes = 60,
  onSave,
  onDelete,
  onClose,
  prefillDate,
  prefillTime,
}: EventModalProps) {
  const isEditing = !!event;
  const isValidDefault = !!defaultCalendarId && calendars.some((c) => c.id === defaultCalendarId);
  const defaultCalendar = (isValidDefault ? defaultCalendarId : calendars[0]?.id) || '';
  const defaultDate = prefillDate || format(new Date(), 'yyyy-MM-dd');
  const defaultStartTime = prefillTime || '09:00';
  const defaultEnd = new Date(combineDateTime(defaultDate, defaultStartTime).getTime() + defaultDurationMinutes * 60_000);

  const defaultRecurrenceEnd = format(addMonths(new Date(), 3), 'yyyy-MM-dd');

  const [form, setForm] = useState<EventFormData>({
    summary: '',
    description: '',
    calendarId: defaultCalendar,
    startDate: defaultDate,
    startTime: defaultStartTime,
    endDate: format(defaultEnd, 'yyyy-MM-dd'),
    endTime: format(defaultEnd, 'HH:mm'),
    allDay: false,
    recurrence: 'none',
    recurrenceEnd: defaultRecurrenceEnd,
    rrule: '',
    scope: 'this',
  });

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Whether the user has manually edited the end date/time in this session.
  // While false, changing the start auto-shifts the end to preserve the
  // event's original duration. Once the user touches the end fields
  // directly, we stop overriding their choice — unless the new start would
  // land at or after the (now stale) end, in which case we still need to
  // auto-shift to keep the range valid.
  const endTouchedRef = useRef(false);

  useEffect(() => {
    endTouchedRef.current = false;
    if (event) {
      setForm({
        summary: event.title,
        description: event.description || '',
        calendarId: event.calendarId,
        startDate: toLocalDate(event.start),
        startTime: event.allDay ? '09:00' : toLocalTime(event.start),
        endDate: event.allDay ? lastDayOfAllDayEvent(event.start, event.end) : toLocalDate(event.end),
        endTime: event.allDay ? '10:00' : toLocalTime(event.end),
        allDay: event.allDay,
        recurrence: event.recurrence || 'none',
        // A repeating event's own end (none, if it repeats forever); a
        // suggestion for one that doesn't repeat yet.
        recurrenceEnd: event.recurrence && event.recurrence !== 'none' ? event.recurrenceEnd ?? '' : defaultRecurrenceEnd,
        rrule: event.rrule ?? '',
        scope: 'this',
      });
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when the edited event changes; defaultRecurrenceEnd changes at midnight and must not wipe the form
  }, [event]);

  const updateField = <K extends keyof EventFormData>(key: K, value: EventFormData[K]) => {
    setError(null);

    if (key === 'endDate' || key === 'endTime') {
      endTouchedRef.current = true;
      setForm(prev => ({ ...prev, [key]: value }));
      return;
    }

    if (key === 'startDate' || key === 'startTime') {
      setForm(prev => {
        const nextStartDate = key === 'startDate' ? (value as string) : prev.startDate;
        const nextStartTime = key === 'startTime' ? (value as string) : prev.startTime;

        const newStart = combineDateTime(nextStartDate, nextStartTime);
        const currentEnd = combineDateTime(prev.endDate, prev.endTime);

        // Guard against intermediate/incomplete input values (e.g. a
        // native time input transiently firing an empty string mid-edit)
        // producing an invalid Date — just accept the raw value without
        // attempting a shift in that case; validation on submit will catch
        // anything still invalid at that point.
        if (Number.isNaN(newStart.getTime()) || Number.isNaN(currentEnd.getTime())) {
          return { ...prev, [key]: value };
        }

        const needsShift = !endTouchedRef.current || newStart.getTime() >= currentEnd.getTime();

        if (!needsShift) {
          return { ...prev, [key]: value };
        }

        const shifted = shiftEnd(
          prev.startDate,
          prev.startTime,
          prev.endDate,
          prev.endTime,
          nextStartDate,
          nextStartTime,
        );
        return { ...prev, [key]: value, endDate: shifted.endDate, endTime: shifted.endTime };
      });
      return;
    }

    setForm(prev => ({ ...prev, [key]: value }));
  };

  /** Returns an error message if the current form's range is invalid, else null. */
  function validateRange(f: EventFormData): string | null {
    if (f.allDay) {
      // All-day events: end date must not be before the start date.
      if (f.endDate < f.startDate) {
        return 'End date cannot be before the start date.';
      }
    } else {
      const start = combineDateTime(f.startDate, f.startTime);
      const end = combineDateTime(f.endDate, f.endTime);
      if (!(end.getTime() > start.getTime())) {
        return 'End time must be after the start time.';
      }
    }
    return null;
  }

  // Repeating events: the built-in calendar can't repeat events, and a
  // change to one occurrence on its own can't change how the series repeats.
  const isOccurrence = !!event?.recurrenceId;
  const onBuiltInCalendar = form.calendarId === LOCAL_CALENDAR.id;
  const repeatLockedReason = onBuiltInCalendar
    ? 'Repeating events need a Home Assistant calendar.'
    : isOccurrence && form.scope === 'this'
    ? 'To change how it repeats, choose “This and following events”.'
    : null;
  const recurrence: RecurrenceFrequency = onBuiltInCalendar ? 'none' : form.recurrence;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.summary.trim()) {
      setError('Title is required.');
      return;
    }

    const rangeError = validateRange(form);
    if (rangeError) {
      setError(rangeError);
      return;
    }

    if (isEditing && event && event.hasStableId === false) {
      setError("This event can't be edited — it has no stable ID from its calendar provider.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSave(form.calendarId, { ...form, recurrence });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // The first tap on Delete asks, a second one deletes (as for chores): the
  // event goes from the calendar itself, Google's too, with no undo. One tap
  // on a wall display's touchscreen used to delete it.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  const handleDelete = async () => {
    if (!event) return;
    if (event.hasStableId === false) {
      setError("This event can't be deleted — it has no stable ID from its calendar provider.");
      return;
    }
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    setError(null);
    setSubmitting(true);
    try {
      await onDelete(event, form.scope);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h2 className="modal-title">
              {isEditing ? 'Event Details' : 'New Event'}
            </h2>
            <button type="button" className="modal-close" onClick={onClose}>
              &#x2715;
            </button>
          </div>

          <div className="modal-body">
            <div className="form-field">
              <label className="form-label" htmlFor="event-title">Title</label>
              <input
                id="event-title"
                className="form-input"
                type="text"
                value={form.summary}
                onChange={(e) => updateField('summary', e.target.value)}
                placeholder="Event title"
                autoFocus
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="event-calendar">Calendar</label>
              <select
                id="event-calendar"
                className="form-select"
                value={form.calendarId}
                onChange={(e) => updateField('calendarId', e.target.value)}
              >
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>{cal.name}</option>
                ))}
              </select>
            </div>

            <div className="form-field form-field--toggle">
              <label className="form-label" htmlFor="event-allday">All day</label>
              <button
                id="event-allday"
                type="button"
                className={`toggle ${form.allDay ? 'toggle--on' : ''}`}
                onClick={() => updateField('allDay', !form.allDay)}
                role="switch"
                aria-checked={form.allDay}
              >
                <span className="toggle-knob" />
              </button>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label className="form-label" htmlFor="event-start-date">Start</label>
                <input
                  id="event-start-date"
                  className="form-input"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => updateField('startDate', e.target.value)}
                />
              </div>
              {!form.allDay && (
                <div className="form-field">
                  <label className="form-label" htmlFor="event-start-time">&nbsp;</label>
                  <input
                    id="event-start-time"
                    className="form-input"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => updateField('startTime', e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-field">
                <label className="form-label" htmlFor="event-end-date">End</label>
                <input
                  id="event-end-date"
                  className="form-input"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => updateField('endDate', e.target.value)}
                />
              </div>
              {!form.allDay && (
                <div className="form-field">
                  <label className="form-label" htmlFor="event-end-time">&nbsp;</label>
                  <input
                    id="event-end-time"
                    className="form-input"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => updateField('endTime', e.target.value)}
                  />
                </div>
              )}
            </div>

            {isOccurrence && (
              <div className="form-field">
                <label className="form-label" htmlFor="event-scope">Change</label>
                <select
                  id="event-scope"
                  className="form-select"
                  value={form.scope}
                  onChange={(e) => updateField('scope', e.target.value as EditScope)}
                >
                  <option value="this">This event</option>
                  <option value="following">This and following events</option>
                </select>
              </div>
            )}

            <div className="form-field">
              <label className="form-label" htmlFor="event-recurrence">Repeats</label>
              <select
                id="event-recurrence"
                className="form-select"
                value={recurrence}
                disabled={!!repeatLockedReason}
                onChange={(e) => updateField('recurrence', e.target.value as RecurrenceFrequency)}
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                {form.recurrence === 'custom' && <option value="custom">Custom (set in another app)</option>}
              </select>
              {repeatLockedReason && <span className="form-hint">{repeatLockedReason}</span>}
            </div>

            {recurrence !== 'none' && recurrence !== 'custom' && (
              <div className="form-field">
                <label className="form-label" htmlFor="event-recurrence-end">Repeat until</label>
                <input
                  id="event-recurrence-end"
                  className="form-input"
                  type="date"
                  value={form.recurrenceEnd}
                  disabled={!!repeatLockedReason}
                  onChange={(e) => updateField('recurrenceEnd', e.target.value)}
                />
                <span className="form-hint">Leave empty to repeat with no end.</span>
              </div>
            )}

            <div className="form-field">
              <label className="form-label" htmlFor="event-desc">Description</label>
              <textarea
                id="event-desc"
                className="form-textarea"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Add a description..."
                rows={3}
              />
            </div>
          </div>

          {error && (
            <div className="modal-error" role="alert">
              {error}
            </div>
          )}

          <div className="modal-footer">
            {isEditing && (
              <button type="button" className="btn btn--danger" onClick={handleDelete} disabled={submitting}>
                {confirmingDelete ? 'Tap again to delete' : 'Delete'}
              </button>
            )}
            <div className="modal-footer-right">
              <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {isEditing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
