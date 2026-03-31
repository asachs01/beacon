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
  onWeatherClick?: () => void;
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
  onWeatherClick,
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
      {/* LEFT: Clock + Date + Greeting + Weather */}
      <section className="dashboard-left">
        <div className="dashboard-clock">{timeString}</div>
        <div className="dashboard-date">{dateString}</div>
        <div className="dashboard-greeting">
          {greeting}, {familyName || FAMILY_NAME}
        </div>
        {weather && (
          <div
            className={`dashboard-weather ${onWeatherClick ? 'dashboard-weather--clickable' : ''}`}
            onClick={onWeatherClick}
            role={onWeatherClick ? 'button' : undefined}
            tabIndex={onWeatherClick ? 0 : undefined}
            onKeyDown={onWeatherClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onWeatherClick(); } : undefined}
          >
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
        <CountdownWidget events={events} />
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

      {/* RIGHT: Tasks + Grocery preview */}
      <section className="dashboard-right">
        <h2 className="dashboard-section-title">Tasks</h2>
        {(() => {
          const pending = todoItems.filter(t => t.status === 'needs_action');
          if (todoItems.length > 0) {
            return pending.length > 0 ? (
              <ul className="task-checklist">
                {pending.map(item => (
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
              </ul>
            ) : (
              <div className="task-checklist-done">All done — great job!</div>
            );
          }
          return (
            <TaskChecklist
              chores={chores}
              completedIds={completedChoreIds}
              onToggle={onToggleChore}
            />
          );
        })()}
      </section>
    </div>
  );
}
