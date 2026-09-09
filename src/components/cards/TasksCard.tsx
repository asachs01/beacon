import { DashboardCardProps, TodoItem } from '../../types/dashboard-cards';
import { TaskChecklist } from '../TaskChecklist';
import { MEMBER_COLORS } from '../../types/family';
import type { TaskmateUser } from '../../types/taskmate';

/** Sidebar "Tasks" section — HA todo items (optionally grouped by TaskMate user), or chores checklist fallback. */
export function TasksCard({ context }: DashboardCardProps) {
  const { todoItems, onToggleTodo, taskmateUsers, filteredChores, completedChoreIds, onToggleChore, members } = context;

  return (
    <section className="dash-sidebar-section">
      <h3 className="dash-sidebar-heading">Tasks</h3>
      {todoItems.length > 0 ? (
        <TaskGroups items={todoItems} users={taskmateUsers} onToggleTodo={onToggleTodo} />
      ) : (
        <TaskChecklist
          chores={filteredChores}
          completedIds={completedChoreIds}
          onToggle={onToggleChore}
          members={members}
        />
      )}
    </section>
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
