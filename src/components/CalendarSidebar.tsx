import { useMemo } from 'react';
import { format, parseISO, isSameDay, startOfDay } from 'date-fns';
import { CalendarEvent } from '../types';
import { Chore } from '../types/family';
import { TaskChecklist } from './TaskChecklist';
import { DashboardTodoItem } from '../hooks/useDashboardTasks';

interface CalendarSidebarProps {
  events: CalendarEvent[];
  chores: Chore[];
  completedChoreIds: Set<string>;
  onToggleChore: (choreId: string) => void;
  todoItems: DashboardTodoItem[];
  onToggleTodo?: (uid: string, currentStatus: string) => void;
}

export function CalendarSidebar({
  events,
  chores,
  completedChoreIds,
  onToggleChore,
  todoItems,
  onToggleTodo,
}: CalendarSidebarProps) {
  const today = startOfDay(new Date());

  const todayEvents = useMemo(() => {
    return events
      .filter((e) => isSameDay(startOfDay(parseISO(e.start)), today))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events, today]);

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
                      {format(parseISO(event.start), 'h:mm a')}
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
            completedIds={completedChoreIds}
            onToggle={onToggleChore}
          />
        ) : (
          <p className="cal-sidebar-empty">All clear</p>
        )}
      </section>
    </aside>
  );
}
