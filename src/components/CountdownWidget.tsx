import { useState, useMemo, useCallback } from 'react';
import { differenceInDays, parseISO, startOfDay, format } from 'date-fns';
import { CalendarEvent } from '../types';

const STORAGE_KEY = 'beacon-countdown-events';

interface CountdownEvent {
  id: string;
  title: string;
  date: string; // ISO date string (YYYY-MM-DD)
}

interface CountdownWidgetProps {
  /** Calendar events to scan for "countdown" tag in description */
  events?: CalendarEvent[];
}

function loadSavedCountdowns(): CountdownEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSavedCountdowns(items: CountdownEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function CountdownWidget({ events = [] }: CountdownWidgetProps) {
  const [savedCountdowns, setSavedCountdowns] = useState<CountdownEvent[]>(loadSavedCountdowns);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');

  // Extract countdowns from calendar events tagged with "countdown" in description
  const calendarCountdowns: CountdownEvent[] = useMemo(() => {
    const today = startOfDay(new Date());
    return events
      .filter((e) => {
        const desc = (e.description || '').toLowerCase();
        return desc.includes('countdown') || desc.includes('#countdown');
      })
      .filter((e) => {
        const eventDate = startOfDay(parseISO(e.start));
        return eventDate >= today;
      })
      .map((e) => ({
        id: `cal-${e.id}`,
        title: e.title,
        date: e.start.slice(0, 10),
      }));
  }, [events]);

  // Merge calendar + manual countdowns, sorted by date
  const allCountdowns = useMemo(() => {
    const today = startOfDay(new Date());
    return [...calendarCountdowns, ...savedCountdowns]
      .filter((c) => startOfDay(parseISO(c.date)) >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [calendarCountdowns, savedCountdowns]);

  const handleAdd = useCallback(() => {
    if (!newTitle.trim() || !newDate) return;

    const item: CountdownEvent = {
      id: `manual-${Date.now()}`,
      title: newTitle.trim(),
      date: newDate,
    };

    const updated = [...savedCountdowns, item];
    setSavedCountdowns(updated);
    saveSavedCountdowns(updated);
    setNewTitle('');
    setNewDate('');
    setShowAdd(false);
  }, [newTitle, newDate, savedCountdowns]);

  const handleRemove = useCallback((id: string) => {
    const updated = savedCountdowns.filter((c) => c.id !== id);
    setSavedCountdowns(updated);
    saveSavedCountdowns(updated);
  }, [savedCountdowns]);

  if (allCountdowns.length === 0 && !showAdd) {
    return null; // Don't render if nothing to count down to
  }

  const today = startOfDay(new Date());

  return (
    <div className="countdown-widget">
      <div className="countdown-widget-header">
        <h3 className="dashboard-section-title" style={{ marginBottom: 0 }}>
          Countdown
        </h3>
        <button
          type="button"
          className="countdown-add-btn"
          onClick={() => setShowAdd(!showAdd)}
          title="Add countdown"
          aria-label="Add countdown"
        >
          {showAdd ? '\u00D7' : '+'}
        </button>
      </div>

      {showAdd && (
        <div className="countdown-add-form">
          <input
            type="text"
            className="form-input"
            placeholder="Event name"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <input
            type="date"
            className="form-input"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            min={format(new Date(), 'yyyy-MM-dd')}
          />
          <button type="button" className="btn btn--primary" onClick={handleAdd}>
            Add
          </button>
        </div>
      )}

      <div className="countdown-list">
        {allCountdowns.map((c) => {
          const days = differenceInDays(startOfDay(parseISO(c.date)), today);
          const isManual = c.id.startsWith('manual-');

          return (
            <div key={c.id} className="countdown-item">
              <div className="countdown-days">
                <span className="countdown-days-number">{days}</span>
                <span className="countdown-days-label">
                  {days === 1 ? 'day' : 'days'}
                </span>
              </div>
              <div className="countdown-info">
                <span className="countdown-title">{c.title}</span>
                <span className="countdown-date">
                  {format(parseISO(c.date), 'MMM d')}
                </span>
              </div>
              {isManual && (
                <button
                  type="button"
                  className="countdown-remove-btn"
                  onClick={() => handleRemove(c.id)}
                  title="Remove"
                  aria-label={`Remove ${c.title}`}
                >
                  &times;
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
