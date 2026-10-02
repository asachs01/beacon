import { useState, useEffect, useRef } from 'react';
import { format, parseISO, addMonths } from 'date-fns';
import { CalendarEvent, CalendarInfo, RecurrenceFrequency } from '../types';
import { useTranslation } from '../i18n';

interface EventModalProps {
  event: CalendarEvent | null;
  calendars: CalendarInfo[];
  /** The user's configured default calendar (Settings > Calendar). Used as
   *  the initial calendar selection for a NEW event; ignored when editing
   *  an existing event (which keeps the event's own calendar). Falls back
   *  to the first calendar in the list if unset/not a valid calendar id. */
  defaultCalendarId?: string;
  onSave: (calendarId: string, data: EventFormData) => void | Promise<void>;
  onDelete: (calendarId: string, eventId: string) => void | Promise<void>;
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
  recurrenceEnd: string;
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

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const newH = Math.min(h + 1, 23);
  return `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
  onSave,
  onDelete,
  onClose,
  prefillDate,
  prefillTime,
}: EventModalProps) {
  const { t } = useTranslation();
  const isEditing = !!event;
  const isValidDefault = !!defaultCalendarId && calendars.some((c) => c.id === defaultCalendarId);
  const defaultCalendar = (isValidDefault ? defaultCalendarId : calendars[0]?.id) || '';
  const defaultDate = prefillDate || format(new Date(), 'yyyy-MM-dd');
  const defaultStartTime = prefillTime || '09:00';
  const defaultEndTime = addHour(defaultStartTime);

  const defaultRecurrenceEnd = format(addMonths(new Date(), 3), 'yyyy-MM-dd');

  const [form, setForm] = useState<EventFormData>({
    summary: '',
    description: '',
    calendarId: defaultCalendar,
    startDate: defaultDate,
    startTime: defaultStartTime,
    endDate: defaultDate,
    endTime: defaultEndTime,
    allDay: false,
    recurrence: 'none',
    recurrenceEnd: defaultRecurrenceEnd,
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
        endDate: toLocalDate(event.end),
        endTime: event.allDay ? '10:00' : toLocalTime(event.end),
        allDay: event.allDay,
        recurrence: event.recurrence || 'none',
        recurrenceEnd: event.recurrenceEnd || defaultRecurrenceEnd,
      });
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        return t('eventModal.errorEndDateBeforeStart');
      }
    } else {
      const start = combineDateTime(f.startDate, f.startTime);
      const end = combineDateTime(f.endDate, f.endTime);
      if (!(end.getTime() > start.getTime())) {
        return t('eventModal.errorEndBeforeStart');
      }
    }
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.summary.trim()) {
      setError(t('eventModal.errorTitleRequired'));
      return;
    }

    const rangeError = validateRange(form);
    if (rangeError) {
      setError(rangeError);
      return;
    }

    if (isEditing && event && event.hasStableId === false) {
      setError(t('eventModal.errorNoStableIdEdit'));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSave(form.calendarId, form);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eventModal.errorSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    if (event.hasStableId === false) {
      setError(t('eventModal.errorNoStableIdDelete'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onDelete(event.calendarId, event.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eventModal.errorDeleteFailed'));
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
              {isEditing ? t('eventModal.editTitle') : t('eventModal.newTitle')}
            </h2>
            <button type="button" className="modal-close" onClick={onClose}>
              &#x2715;
            </button>
          </div>

          <div className="modal-body">
            <div className="form-field">
              <label className="form-label" htmlFor="event-title">{t('eventModal.titleLabel')}</label>
              <input
                id="event-title"
                className="form-input"
                type="text"
                value={form.summary}
                onChange={(e) => updateField('summary', e.target.value)}
                placeholder={t('eventModal.titlePlaceholder')}
                autoFocus
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="event-calendar">{t('eventModal.calendarLabel')}</label>
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
              <label className="form-label" htmlFor="event-allday">{t('common.allDay')}</label>
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
                <label className="form-label" htmlFor="event-start-date">{t('eventModal.startLabel')}</label>
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
                <label className="form-label" htmlFor="event-end-date">{t('eventModal.endLabel')}</label>
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

            <div className="form-field">
              <label className="form-label" htmlFor="event-recurrence">{t('eventModal.repeatsLabel')}</label>
              <select
                id="event-recurrence"
                className="form-select"
                value={form.recurrence}
                onChange={(e) => updateField('recurrence', e.target.value as RecurrenceFrequency)}
              >
                <option value="none">{t('eventModal.repeatNone')}</option>
                <option value="daily">{t('eventModal.repeatDaily')}</option>
                <option value="weekly">{t('eventModal.repeatWeekly')}</option>
                <option value="monthly">{t('eventModal.repeatMonthly')}</option>
              </select>
            </div>

            {form.recurrence !== 'none' && (
              <div className="form-field">
                <label className="form-label" htmlFor="event-recurrence-end">{t('eventModal.repeatUntilLabel')}</label>
                <input
                  id="event-recurrence-end"
                  className="form-input"
                  type="date"
                  value={form.recurrenceEnd}
                  onChange={(e) => updateField('recurrenceEnd', e.target.value)}
                />
              </div>
            )}

            <div className="form-field">
              <label className="form-label" htmlFor="event-desc">{t('eventModal.descriptionLabel')}</label>
              <textarea
                id="event-desc"
                className="form-textarea"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder={t('eventModal.descriptionPlaceholder')}
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
                {t('common.delete')}
              </button>
            )}
            <div className="modal-footer-right">
              <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {isEditing ? t('common.save') : t('common.create')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
