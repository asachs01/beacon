import { useState, useEffect, useMemo } from 'react';
import { format, parseISO, isSameDay, startOfDay, addDays } from 'date-fns';
import { CalendarEvent, WeatherData } from '../types';
import { Chore, FamilyMember, MEMBER_COLORS } from '../types/family';
import { weatherIcon, conditionLabel } from '../types/weather-icons';
import { EventCard } from './EventCard';
import { TaskChecklist } from './TaskChecklist';
import { useFamilyEvents } from '../hooks/useFamilyEvents';
import { useMealPlans } from '../hooks/useMealPlans';
import { MealType } from '../types/meals';
import type { TaskmateUser } from '../types/taskmate';

const MEAL_ICONS: Record<MealType, string> = {
  Breakfast: '🌅',
  Lunch: '☀️',
  Dinner: '🌙',
  Snack: '🍎',
};

export interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
  userId?: string;
  listId?: string;
}

interface DashboardViewProps {
  events: CalendarEvent[];
  weather: WeatherData | null;
  chores: Chore[];
  completedChoreIds: Set<string>;
  onToggleChore: (choreId: string) => void;
  todoItems?: TodoItem[];
  onToggleTodo?: (uid: string, currentStatus: string, listId?: string) => void;
  onWeatherClick?: () => void;
  onEventClick?: (event: CalendarEvent) => void;
  members?: FamilyMember[];
  taskmateUsers?: TaskmateUser[];
  layout?: 'default' | 'classic' | 'compact';
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
  onEventClick,
  members = [],
  taskmateUsers = [],
  layout = 'default',
}: DashboardViewProps) {
  const [now, setNow] = useState(new Date());
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string | null>(null);

  const toggleMemberFilter = (memberId: string) => {
    setSelectedMemberFilter((prev) => (prev === memberId ? null : memberId));
  };

  const filteredChores = selectedMemberFilter
    ? chores.filter((c) => c.assigned_to.includes(selectedMemberFilter))
    : chores;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = format(now, 'h:mm');
  const dateString = format(now, 'EEEE, MMMM d');

  const { byMember, other } = useFamilyEvents(events, members);
  const { todaysMenu } = useMealPlans();

  // Also compute flat today's events for the "other" / fallback view
  const todayEvents = useMemo(() => {
    const today = startOfDay(new Date());
    return events
      .filter((e) => isSameDay(startOfDay(parseISO(e.start)), today))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events]);

  const hasMemberCalendars = members.some(
    (m) => m.calendar_entity || (m.additional_calendar_entities?.length ?? 0) > 0,
  );

  // Group the next 7 days of events for the Classic "This Week" column
  const weekEvents = useMemo(() => {
    const start = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      const dayEvents = events
        .filter((e) => isSameDay(startOfDay(parseISO(e.start)), day))
        .sort((a, b) => a.start.localeCompare(b.start));
      return { day, events: dayEvents };
    });
  }, [events]);

  // ─── Shared pieces reused across layouts ───
  const topbar = (
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
  );

  const sidebarSections = (
    <>
      {todaysMenu.meals.length > 0 && (
        <section className="dash-sidebar-section">
          <h3 className="dash-sidebar-heading">Menu</h3>
          <ul className="dash-menu-list">
            {todaysMenu.meals.map((meal, i) => (
              <li key={i} className="dash-menu-item">
                <span className="dash-menu-icon">{MEAL_ICONS[meal.meal_type] || '🍽️'}</span>
                <div className="dash-menu-info">
                  <span className="dash-menu-type">{meal.meal_type}</span>
                  <span className="dash-menu-name">{meal.name}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="dash-sidebar-section">
        <h3 className="dash-sidebar-heading">Tasks</h3>
        {(() => {
          if (todoItems.length > 0) {
            return (
              <TaskGroups
                items={todoItems}
                users={taskmateUsers}
                onToggleTodo={onToggleTodo}
              />
            );
          }
          return (
            <TaskChecklist
              chores={filteredChores}
              completedIds={completedChoreIds}
              onToggle={onToggleChore}
              members={members}
            />
          );
        })()}
      </section>
    </>
  );

  // ─── Classic: clock + three agenda columns (Today | This Week | Tasks) ───
  if (layout === 'classic') {
    return (
      <div className="dashboard dashboard--classic">
        {topbar}
        <main className="dash-classic">
          <section className="dash-classic-col">
            <h2 className="dashboard-section-title">Today</h2>
            <div className="dashboard-events-scroll">
              {todayEvents.length === 0 ? (
                <div className="dashboard-empty">Nothing scheduled today</div>
              ) : (
                <div className="dashboard-events-list">
                  {todayEvents.map((event) => (
                    <EventCard key={event.id} event={event} onClick={onEventClick} />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="dash-classic-col">
            <h2 className="dashboard-section-title">This Week</h2>
            <div className="dashboard-events-scroll">
              {weekEvents.map(({ day, events: dayEvents }) => (
                <div key={day.toISOString()} className="dash-week-day">
                  <div className="dash-week-day-label">{format(day, 'EEE d')}</div>
                  {dayEvents.length === 0 ? (
                    <div className="dash-week-empty">—</div>
                  ) : (
                    <div className="dashboard-events-list">
                      {dayEvents.map((event) => (
                        <EventCard key={event.id} event={event} onClick={onEventClick} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <aside className="dash-classic-col dash-classic-sidebar">
            {sidebarSections}
          </aside>
        </main>
      </div>
    );
  }

  return (
    <div className={`dashboard dashboard--${layout}`}>
      {/* ─── TOP BAR: Time + Date + Weather ─── */}
      {topbar}

      {/* ─── MAIN: Per-member calendar columns ─── */}
      <main className="dash-main">
        {hasMemberCalendars ? (
          <div className="dash-family-grid" style={{ '--member-count': members.length } as React.CSSProperties}>
            {members.map((member) => {
              const memberEvents = byMember.get(member.id) || [];
              const isSelected = selectedMemberFilter === member.id;
              return (
                <section key={member.id} className={`dash-member-col ${isSelected ? 'dash-member-col--selected' : ''}`}>
                  <button
                    type="button"
                    className="dash-member-header dash-member-header--clickable"
                    onClick={() => toggleMemberFilter(member.id)}
                    aria-pressed={isSelected}
                    aria-label={`Filter chores for ${member.name}`}
                  >
                    <span
                      className="dash-member-avatar"
                      style={{ backgroundColor: member.color + '22', borderColor: member.color }}
                    >
                      {member.avatar}
                    </span>
                    <span className="dash-member-name" style={{ color: member.color }}>
                      {member.name}
                    </span>
                  </button>
                  <div className="dash-member-events">
                    {memberEvents.length === 0 ? (
                      <div className="dash-member-empty">Nothing today</div>
                    ) : (
                      memberEvents.map((event) => (
                        <EventCard key={event.id} event={event} onClick={onEventClick} />
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
                    <EventCard key={event.id} event={event} onClick={onEventClick} />
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
                    <EventCard key={event.id} event={event} onClick={onEventClick} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── SIDEBAR: Menu + Tasks + Chores ─── */}
      <aside className="dash-sidebar">
        {sidebarSections}
      </aside>
    </div>
  );
}

function TaskRow({
  item,
  onToggleTodo,
}: {
  item: TodoItem;
  onToggleTodo?: (uid: string, currentStatus: string, listId?: string) => void;
}) {
  const done = item.status === 'completed';
  return (
    <li className={`task-checklist-item${done ? ' task-checklist-item--done' : ''}`}>
      <button
        type="button"
        className={`task-checkbox${done ? ' task-checkbox--checked' : ''}`}
        disabled={done}
        onClick={() => onToggleTodo?.(item.uid, item.status, item.listId)}
        aria-label={done ? `Completed ${item.summary}` : `Complete ${item.summary}`}
      >
        <span className="task-checkbox-box">
          {done && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
      </button>
      <span className={`task-checklist-label${done ? ' task-checklist-label--done' : ''}`}>{item.summary}</span>
    </li>
  );
}

interface TaskGroup {
  key: string;
  label: string;
  color?: string;
  items: TodoItem[];
}

function TaskGroups({
  items,
  users,
  onToggleTodo,
}: {
  items: TodoItem[];
  users: TaskmateUser[];
  onToggleTodo?: (uid: string, currentStatus: string, listId?: string) => void;
}) {
  const sorted = [...items].sort(
    (a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0),
  );

  if (users.length === 0) {
    return (
      <ul className="task-checklist">
        {sorted.map((item) => (
          <TaskRow key={`${item.listId ?? 'local'}:${item.uid}`} item={item} onToggleTodo={onToggleTodo} />
        ))}
      </ul>
    );
  }

  const groups: TaskGroup[] = users.map(
    (u, i) => ({ key: u.childId, label: u.name, color: MEMBER_COLORS[i % MEMBER_COLORS.length], items: [] }),
  );
  const shared: TaskGroup = { key: '__shared', label: 'Shared', items: [] };

  for (const item of sorted) {
    const bucket = item.userId ? groups.find((g) => g.key === item.userId) : undefined;
    (bucket ?? shared).items.push(item);
  }

  const visible = [
    ...groups.filter((g) => g.items.length > 0),
    ...(shared.items.length > 0 ? [shared] : []),
  ];

  return (
    <div className="task-groups">
      {visible.map((group) => (
        <div key={group.key} className="task-group">
          <div className="task-group-header">
            <span
              className="task-group-avatar"
              style={group.color ? { backgroundColor: group.color + '22', borderColor: group.color } : undefined}
            >
              {group.label.charAt(0).toUpperCase()}
            </span>
            <span className="task-group-name" style={group.color ? { color: group.color } : undefined}>
              {group.label}
            </span>
          </div>
          <ul className="task-checklist">
            {group.items.map((item) => (
              <TaskRow key={`${item.listId ?? 'local'}:${item.uid}`} item={item} onToggleTodo={onToggleTodo} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
