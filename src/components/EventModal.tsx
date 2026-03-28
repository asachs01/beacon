import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarEvent, CalendarInfo } from '../types';

interface EventModalProps {
  event: CalendarEvent | null;
  calendars: CalendarInfo[];
  onSave: (calendarId: string, data: EventFormData) => void;
  onDelete: (calendarId: string, eventId: string) => void;
  onClose: () => void;
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

export function EventModal({ event, calendars, onSave, onDelete, onClose }: EventModalProps) {
  const isEditing = !!event;
  const defaultCalendar = calendars[0]?.id || '';

  const [form, setForm] = useState<EventFormData>({
    summary: '',
    description: '',
    calendarId: defaultCalendar,
    startDate: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endDate: format(new Date(), 'yyyy-MM-dd'),
    endTime: '10:00',
    allDay: false,
  });

  useEffect(() => {
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
      });
    }
  }, [event]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.summary.trim()) return;
    onSave(form.calendarId, form);
  };

  const handleDelete = () => {
    if (event) {
      onDelete(event.calendarId, event.id);
    }
  };

  const updateField = <K extends keyof EventFormData>(key: K, value: EventFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
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
              ✕
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

          <div className="modal-footer">
            {isEditing && (
              <button type="button" className="btn btn--danger" onClick={handleDelete}>
                Delete
              </button>
            )}
            <div className="modal-footer-right">
              <button type="button" className="btn btn--secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary">
                {isEditing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
