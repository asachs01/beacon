import { useState } from 'react';
import { Chore } from '../../types/family';
import { hapticMedium, hapticSuccess } from '../../hooks/useHaptics';

interface FocusChoresProps {
  chores: Chore[];
  completedIds: Set<string>;
  currencySymbol: string;
  onToggle: (choreId: string) => void;
}

export function FocusChores({ chores, completedIds, currencySymbol, onToggle }: FocusChoresProps) {
  const [animatingId, setAnimatingId] = useState<string | null>(null);

  if (chores.length === 0) return null;

  const remaining = chores.filter((c) => !completedIds.has(c.id)).length;

  const handleToggle = (choreId: string) => {
    if (!completedIds.has(choreId)) {
      setAnimatingId(choreId);
      setTimeout(() => setAnimatingId(null), 400);
      hapticMedium();
      if (remaining === 1) hapticSuccess();
    }
    onToggle(choreId);
  };

  return (
    <section className="focus-card">
      <header className="focus-card-header">
        <h2 className="focus-card-title">Chores</h2>
        <span className="focus-card-count">
          {remaining === 0 ? 'Done!' : `${chores.length - remaining}/${chores.length}`}
        </span>
      </header>
      <ul className="focus-checklist">
        {chores.map((chore) => {
          const done = completedIds.has(chore.id);
          return (
            <li key={chore.id}>
              <button
                type="button"
                className={`focus-check-row ${done ? 'focus-check-row--done' : ''} ${animatingId === chore.id ? 'focus-check-row--completing' : ''}`}
                onClick={() => handleToggle(chore.id)}
                aria-label={done ? `Undo ${chore.name}` : `Complete ${chore.name}`}
              >
                <span className="focus-check-box">
                  {done && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="focus-check-label">
                  {chore.icon && <span className="focus-check-icon">{chore.icon}</span>}
                  {chore.name}
                </span>
                {chore.value_cents > 0 && (
                  <span className="focus-check-value">
                    {currencySymbol}
                    {(chore.value_cents / 100).toFixed(2)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
