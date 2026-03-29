import { useState } from 'react';
import { Chore } from '../types/family';
import { hapticMedium, hapticSuccess } from '../hooks/useHaptics';

interface TaskChecklistProps {
  chores: Chore[];
  completedIds: Set<string>;
  onToggle: (choreId: string) => void;
}

export function TaskChecklist({ chores, completedIds, onToggle }: TaskChecklistProps) {
  const [animatingId, setAnimatingId] = useState<string | null>(null);

  const handleToggle = (choreId: string) => {
    if (!completedIds.has(choreId)) {
      setAnimatingId(choreId);
      setTimeout(() => setAnimatingId(null), 400);
      hapticMedium();
      // Check if this completes all tasks
      if (incomplete.length === 1) hapticSuccess();
    }
    onToggle(choreId);
  };

  const incomplete = chores.filter((c) => !completedIds.has(c.id));
  const completed = chores.filter((c) => completedIds.has(c.id));

  if (chores.length === 0) {
    return (
      <div className="task-checklist-empty">
        No tasks for today — enjoy the free time
      </div>
    );
  }

  if (incomplete.length === 0) {
    return (
      <div className="task-checklist-done">
        All done — great job!
      </div>
    );
  }

  return (
    <ul className="task-checklist">
      {incomplete.map((chore) => (
        <li key={chore.id} className="task-checklist-item">
          <button
            type="button"
            className={`task-checkbox ${animatingId === chore.id ? 'task-checkbox--completing' : ''}`}
            onClick={() => handleToggle(chore.id)}
            aria-label={`Complete ${chore.name}`}
          >
            <span className="task-checkbox-box" />
          </button>
          <span className="task-checklist-label">
            {chore.icon && <span className="task-checklist-icon">{chore.icon}</span>}
            {chore.name}
          </span>
        </li>
      ))}
      {completed.map((chore) => (
        <li key={chore.id} className="task-checklist-item task-checklist-item--done">
          <button
            type="button"
            className="task-checkbox task-checkbox--checked"
            onClick={() => handleToggle(chore.id)}
            aria-label={`Undo ${chore.name}`}
          >
            <span className="task-checkbox-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </button>
          <span className="task-checklist-label task-checklist-label--done">
            {chore.icon && <span className="task-checklist-icon">{chore.icon}</span>}
            {chore.name}
          </span>
        </li>
      ))}
    </ul>
  );
}
