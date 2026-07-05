import { useState } from 'react';
import { Routine } from '../../types/family';
import { hapticMedium, hapticSuccess } from '../../hooks/useHaptics';

interface RoutineCardProps {
  routine: Routine;
  /** empty when this is the current period's routine */
  label: string;
  /** future-period previews render read-only */
  interactive: boolean;
  isTaskCompleted: (taskId: string) => boolean;
  onToggleTask: (taskId: string) => void;
}

export function RoutineCard({ routine, label, interactive, isTaskCompleted, onToggleTask }: RoutineCardProps) {
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const tasks = [...routine.tasks].sort((a, b) => a.order - b.order);
  const doneCount = tasks.filter((t) => isTaskCompleted(t.id)).length;

  const handleToggle = (taskId: string) => {
    if (!interactive) return;
    if (!isTaskCompleted(taskId)) {
      setAnimatingId(taskId);
      setTimeout(() => setAnimatingId(null), 400);
      hapticMedium();
      if (doneCount === tasks.length - 1) hapticSuccess();
    }
    onToggleTask(taskId);
  };

  return (
    <section className={`focus-card ${interactive ? '' : 'focus-card--preview'}`}>
      <header className="focus-card-header">
        <h2 className="focus-card-title">{routine.name}</h2>
        {label ? (
          <span className="focus-card-badge">{label}</span>
        ) : (
          <span className="focus-card-count">
            {doneCount === tasks.length && tasks.length > 0 ? 'Done!' : `${doneCount}/${tasks.length}`}
          </span>
        )}
      </header>
      <ul className="focus-checklist">
        {tasks.map((task) => {
          const done = isTaskCompleted(task.id);
          return (
            <li key={task.id}>
              <button
                type="button"
                className={`focus-check-row ${done ? 'focus-check-row--done' : ''} ${animatingId === task.id ? 'focus-check-row--completing' : ''}`}
                onClick={() => handleToggle(task.id)}
                disabled={!interactive}
                aria-label={done ? `Undo ${task.name}` : `Complete ${task.name}`}
              >
                <span className="focus-check-box">
                  {done && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="focus-check-label">{task.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
