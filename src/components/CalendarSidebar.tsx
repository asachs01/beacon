import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarEvent } from '../types';
import { Chore, ChoreCompletion, FamilyMember } from '../types/family';
import { TaskChecklist } from './TaskChecklist';
import { DashboardTodoItem } from '../hooks/useDashboardTasks';
import { eventOccursOnDay } from '../utils/event-dates';
import { formatClockTime, type TimeFormat } from '../utils/time-format';

interface CalendarSidebarProps {
  events: CalendarEvent[];
  chores: Chore[];
  /** Completions that count for each chore's current round, everyone's. */
  choreCompletions: ChoreCompletion[];
  onToggleChore: (choreId: string, memberId: string) => void;
  todoItems: DashboardTodoItem[];
  onToggleTodo?: (uid: string, currentStatus: string) => void;
  members?: FamilyMember[];
  timeFormat?: TimeFormat;
}

export function CalendarSidebar({
  events,
  chores,
  choreCompletions,
  onToggleChore,
  todoItems,
  onToggleTodo,
  members = [],
  timeFormat = '12h',
}: CalendarSidebarProps) {
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  const todayEvents = useMemo(() => {
    const today = parseISO(todayKey);
    return events
      .filter((e) => eventOccursOnDay(e, today))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events, todayKey]);

  const pendingTodos = todoItems.filter((t) => t.status === 'needs_action');

  return (
    <aside className="calendar-sidebar">
      {/* Today's Schedule */}
      <section className="cal-sidebar-section">
        <h3 className="cal-sidebar-heading">Today</h3>
        {todayEvents.length === 0 ? (
          <p className="cal-sidebar-empty">Nothing scheduled</p>
        ) : (
          <ul className="cal-sidebar-events">
            {todayEvents.map((event) => (
              <li key={event.id} className="cal-sidebar-event">
                <span
                  className="cal-sidebar-event-dot"
                  style={{ background: event.color || 'var(--accent)' }}
                />
                <div className="cal-sidebar-event-info">
                  <span className="cal-sidebar-event-title">{event.title}</span>
                  {event.start.includes('T') && (
                    <span className="cal-sidebar-event-time">
                      {formatClockTime(parseISO(event.start), timeFormat)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tasks / Chores */}
      <section className="cal-sidebar-section">
        <h3 className="cal-sidebar-heading">Tasks</h3>
        {pendingTodos.length > 0 && onToggleTodo ? (
          <ul className="cal-sidebar-todos">
            {pendingTodos.slice(0, 8).map((item) => (
              <li key={item.uid} className="cal-sidebar-todo">
                <button
                  type="button"
                  className="cal-sidebar-todo-check"
                  onClick={() => onToggleTodo(item.uid, item.status)}
                  aria-label={`Complete ${item.summary}`}
                >
                  <span className="task-checkbox-box" />
                </button>
                <span className="cal-sidebar-todo-label">{item.summary}</span>
              </li>
            ))}
          </ul>
        ) : chores.length > 0 ? (
          <TaskChecklist
            chores={chores}
            completions={choreCompletions}
            onToggle={onToggleChore}
            members={members}
          />
        ) : (
          <p className="cal-sidebar-empty">All clear</p>
        )}
      </section>
    </aside>
  );
}
