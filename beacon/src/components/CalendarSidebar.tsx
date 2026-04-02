import { useMemo } from 'react';
import { format, parseISO, isSameDay, startOfDay } from 'date-fns';
import { CalendarEvent } from '../types';
import { DashboardTodoItem } from '../hooks/useDashboardTasks';

interface CalendarSidebarProps {
  events: CalendarEvent[];
  hiddenCalendars: Set<string>;
  todoItems: DashboardTodoItem[];
  onToggleTodo: (uid: string, currentStatus: string) => void;
  onNavigate: (view: string) => void;
}

export function CalendarSidebar({
  events,
  hiddenCalendars,
  todoItems,
  onToggleTodo,
  onNavigate,
}: CalendarSidebarProps) {
  const todayEvents = useMemo(() => {
    const today = startOfDay(new Date());
    return events
      .filter((e) => {
        if (hiddenCalendars.has(e.calendarId)) return false;
        const start = startOfDay(parseISO(e.start));
        return isSameDay(start, today);
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events, hiddenCalendars]);

  const pendingTasks = useMemo(
    () => todoItems.filter((t) => t.status === 'needs_action'),
    [todoItems],
  );

  return (
    <aside className="calendar-sidebar">
      {/* Today's Events */}
      <section className="calendar-sidebar-section">
        <h3 className="calendar-sidebar-title">Today</h3>
        {todayEvents.length === 0 ? (
          <p className="calendar-sidebar-empty">No events today</p>
        ) : (
          <ul className="calendar-sidebar-list">
            {todayEvents.map((event) => (
              <li key={event.id} className="calendar-sidebar-event">
                <span
                  className="calendar-sidebar-dot"
                  style={{ background: event.color }}
                />
                <span className="calendar-sidebar-event-time">
                  {event.allDay
                    ? 'All day'
                    : format(parseISO(event.start), 'h:mm a')}
                </span>
                <span className="calendar-sidebar-event-title">
                  {event.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tasks */}
      <section className="calendar-sidebar-section">
        <button
          type="button"
          className="calendar-sidebar-title calendar-sidebar-title--link"
          onClick={() => onNavigate('tasks')}
        >
          Tasks
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        {pendingTasks.length === 0 ? (
          <p className="calendar-sidebar-empty">All tasks complete</p>
        ) : (
          <ul className="task-checklist">
            {pendingTasks.slice(0, 6).map((item) => (
              <li key={item.uid} className="task-checklist-item">
                <button
                  type="button"
                  className="task-checkbox"
                  onClick={() => onToggleTodo(item.uid, item.status)}
                  aria-label={`Complete ${item.summary}`}
                >
                  <span className="task-checkbox-box" />
                </button>
                <span className="task-checklist-label">{item.summary}</span>
              </li>
            ))}
            {pendingTasks.length > 6 && (
              <li className="calendar-sidebar-more">
                +{pendingTasks.length - 6} more
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Grocery */}
      <section className="calendar-sidebar-section">
        <button
          type="button"
          className="calendar-sidebar-title calendar-sidebar-title--link"
          onClick={() => onNavigate('grocery')}
        >
          Grocery
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <p className="calendar-sidebar-empty calendar-sidebar-empty--clickable"
           onClick={() => onNavigate('grocery')}
           role="button"
           tabIndex={0}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate('grocery'); }}
        >
          Open grocery list
        </p>
      </section>
    </aside>
  );
}
