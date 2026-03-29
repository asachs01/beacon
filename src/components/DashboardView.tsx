import { useState, useEffect, useMemo } from 'react';
import { format, parseISO, isSameDay, startOfDay } from 'date-fns';
import { CalendarEvent, WeatherData } from '../types';
import { Chore } from '../types/family';
import { weatherIcon, conditionLabel } from '../types/weather-icons';
import { EventCard } from './EventCard';
import { TaskChecklist } from './TaskChecklist';
import { CountdownWidget } from './CountdownWidget';
import { getConfig } from '../config';

const { family_name: FAMILY_NAME } = getConfig();

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

export interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
}

interface DashboardViewProps {
  events: CalendarEvent[];
  weather: WeatherData | null;
  chores: Chore[];
  completedChoreIds: Set<string>;
  onToggleChore: (choreId: string) => void;
  familyName?: string;
  todoItems?: TodoItem[];
  onToggleTodo?: (uid: string, currentStatus: string) => void;
}

export function DashboardView({
  events,
  weather,
  chores,
  completedChoreIds,
  onToggleChore,
  familyName,
  todoItems = [],
  onToggleTodo,
}: DashboardViewProps) {
  const [now, setNow] = useState(new Date());

  // Tick the clock every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = now.getHours();
  const timeString = format(now, 'h:mm');
  const dateString = format(now, 'EEEE, MMMM d');
  const greeting = getGreeting(hour);

  // Filter to today's events, sorted by start time
  const todayEvents = useMemo(() => {
    const today = startOfDay(new Date());
    return events
      .filter((e) => {
        // For date-only strings (all-day events), parseISO returns UTC midnight
        // which can shift the date. Normalize both to local day start.
        const start = startOfDay(parseISO(e.start));
        return isSameDay(start, today);
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events]);

  return (
    <div className="dashboard">
      {/* LEFT: Clock + Date + Greeting */}
      <section className="dashboard-left">
        <div className="dashboard-clock">{timeString}</div>
        <div className="dashboard-date">{dateString}</div>
        <div className="dashboard-greeting">
          {greeting}, {familyName || FAMILY_NAME}
        </div>
      </section>

      {/* CENTER: Today's Events */}
      <section className="dashboard-center">
        <h2 className="dashboard-section-title">Today</h2>
        <div className="dashboard-events-scroll">
          {todayEvents.length === 0 ? (
            <div className="dashboard-empty">Nothing scheduled — your day is wide open</div>
          ) : (
            <div className="dashboard-events-list">
              {todayEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* RIGHT: Weather + Tasks */}
      <section className="dashboard-right">
        {weather && (
          <div className="dashboard-weather">
            <span className="dashboard-weather-icon">
              {weatherIcon(weather.condition)}
            </span>
            <div className="dashboard-weather-info">
              <span className="dashboard-weather-temp">
                {Math.round(weather.temperature)}°
              </span>
              <span className="dashboard-weather-condition">
                {conditionLabel(weather.condition)}
              </span>
            </div>
          </div>
        )}

        <h2 className="dashboard-section-title">Tasks</h2>
        {/* Show todo list items from HA/local lists */}
        {todoItems.length > 0 ? (
          <ul className="task-checklist">
            {todoItems.filter(t => t.status === 'needs_action').map(item => (
              <li key={item.uid} className="task-checklist-item">
                <button
                  type="button"
                  className="task-checkbox"
                  onClick={() => onToggleTodo?.(item.uid, item.status)}
                  aria-label={`Complete ${item.summary}`}
                >
                  <span className="task-checkbox-box" />
                </button>
                <span className="task-checklist-label">{item.summary}</span>
              </li>
            ))}
            {todoItems.filter(t => t.status === 'completed').slice(0, 3).map(item => (
              <li key={item.uid} className="task-checklist-item task-checklist-item--done">
                <button
                  type="button"
                  className="task-checkbox task-checkbox--checked"
                  onClick={() => onToggleTodo?.(item.uid, item.status)}
                  aria-label={`Undo ${item.summary}`}
                >
                  <span className="task-checkbox-box">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                </button>
                <span className="task-checklist-label task-checklist-label--done">{item.summary}</span>
              </li>
            ))}
          </ul>
        ) : (
          <TaskChecklist
            chores={chores}
            completedIds={completedChoreIds}
            onToggle={onToggleChore}
          />
        )}

        <CountdownWidget events={events} />
      </section>
    </div>
  );
}
