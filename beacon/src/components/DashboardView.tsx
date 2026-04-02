import { useState, useEffect, useMemo } from 'react';
import { format, parseISO, isSameDay, startOfDay } from 'date-fns';
import { CalendarEvent, WeatherData } from '../types';
import { Chore, FamilyMember } from '../types/family';
import { weatherIcon, conditionLabel } from '../types/weather-icons';
import { EventCard } from './EventCard';
import { TaskChecklist } from './TaskChecklist';
import { useFamilyEvents } from '../hooks/useFamilyEvents';

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
  todoItems?: TodoItem[];
  onToggleTodo?: (uid: string, currentStatus: string) => void;
  onWeatherClick?: () => void;
  members?: FamilyMember[];
}

export function DashboardView({
  events,
  weather,
  chores,
  completedChoreIds,
  onToggleChore,
  todoItems = [],
  onToggleTodo,
  onWeatherClick,
  members = [],
}: DashboardViewProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = format(now, 'h:mm');
  const dateString = format(now, 'EEEE, MMMM d');

  const { byMember, other } = useFamilyEvents(events, members);

  // Also compute flat today's events for the "other" / fallback view
  const todayEvents = useMemo(() => {
    const today = startOfDay(new Date());
    return events
      .filter((e) => isSameDay(startOfDay(parseISO(e.start)), today))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events]);

  const hasMemberCalendars = members.some((m) => m.calendar_entity);

  return (
    <div className="dashboard">
      {/* ─── TOP BAR: Time + Date + Weather ─── */}
      <header className="dash-topbar">
        <div className="dash-topbar-left">
          <span className="dash-topbar-time">{timeString}</span>
          <span className="dash-topbar-date">{dateString}</span>
        </div>
        {weather && (
          <div
            className={`dash-topbar-weather ${onWeatherClick ? 'dash-topbar-weather--clickable' : ''}`}
            onClick={onWeatherClick}
            role={onWeatherClick ? 'button' : undefined}
            tabIndex={onWeatherClick ? 0 : undefined}
            onKeyDown={onWeatherClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onWeatherClick(); } : undefined}
          >
            <span className="dash-topbar-weather-icon">{weatherIcon(weather.condition)}</span>
            <span className="dash-topbar-weather-temp">{Math.round(weather.temperature)}°</span>
            <span className="dash-topbar-weather-cond">{conditionLabel(weather.condition)}</span>
          </div>
        )}
      </header>

      {/* ─── MAIN: Per-member calendar columns ─── */}
      <main className="dash-main">
        {hasMemberCalendars ? (
          <div className="dash-family-grid" style={{ '--member-count': members.length } as React.CSSProperties}>
            {members.map((member) => {
              const memberEvents = byMember.get(member.id) || [];
              return (
                <section key={member.id} className="dash-member-col">
                  <div className="dash-member-header">
                    <span
                      className="dash-member-avatar"
                      style={{ backgroundColor: member.color + '22', borderColor: member.color }}
                    >
                      {member.avatar}
                    </span>
                    <span className="dash-member-name" style={{ color: member.color }}>
                      {member.name}
                    </span>
                  </div>
                  <div className="dash-member-events">
                    {memberEvents.length === 0 ? (
                      <div className="dash-member-empty">Nothing today</div>
                    ) : (
                      memberEvents.map((event) => (
                        <EventCard key={event.id} event={event} />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
            {other.length > 0 && (
              <section className="dash-member-col dash-member-col--other">
                <div className="dash-member-header">
                  <span className="dash-member-avatar" style={{ backgroundColor: 'var(--bg-hover)', borderColor: 'var(--border)' }}>
                    📅
                  </span>
                  <span className="dash-member-name">Other</span>
                </div>
                <div className="dash-member-events">
                  {other.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          /* Fallback: flat event list when no members have calendars assigned */
          <div className="dash-events-fallback">
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
          </div>
        )}
      </main>

      {/* ─── SIDEBAR: Tasks + Chores ─── */}
      <aside className="dash-sidebar">
        <section className="dash-sidebar-section">
          <h3 className="dash-sidebar-heading">Tasks</h3>
          {(() => {
            const pending = todoItems.filter((t) => t.status === 'needs_action');
            if (todoItems.length > 0) {
              return pending.length > 0 ? (
                <ul className="task-checklist">
                  {pending.map((item) => (
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
                <div className="task-checklist-done">All done!</div>
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
      </aside>
    </div>
  );
}
