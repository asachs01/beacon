import { useState, useRef } from 'react';
import { Chore, FamilyMember } from '../types/family';

interface ChoreCardProps {
  chore: Chore;
  member: FamilyMember;
  isCompleted: boolean;
  completionCount?: number;
  isMaxedOut?: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
}

function formatCents(cents: number): string {
  if (cents === 0) return '';
  return `$${(cents / 100).toFixed(2)}`;
}

export function ChoreCard({
  chore,
  member,
  isCompleted,
  completionCount,
  isMaxedOut,
  onComplete,
  onUncomplete,
}: ChoreCardProps) {
  const [animating, setAnimating] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const [swiped, setSwiped] = useState(false);

  const isMulti = (chore.max_completions ?? 0) > 1;
  const count = completionCount ?? 0;

  const handleToggle = () => {
    if (isMulti) {
      // Multi-completion: tap always adds (unless maxed)
      if (isMaxedOut) return;
      setAnimating(true);
      onComplete();
      setTimeout(() => setAnimating(false), 600);
      return;
    }
    // Single completion: toggle
    if (isCompleted) {
      onUncomplete();
      return;
    }
    if (isMaxedOut) return;
    setAnimating(true);
    onComplete();
    setTimeout(() => setAnimating(false), 600);
  };

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (count > 0) onUncomplete();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setSwiped(false);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    // Swipe left to "skip" — just visual feedback
    if (diff < -80) {
      setSwiped(true);
      setTimeout(() => setSwiped(false), 2000);
    }
    touchStartX.current = null;
  };

  const value = formatCents(chore.value_cents);
  const isPayout = !!chore.payout_for;

  return (
    <div
      className={`chore-card ${isCompleted ? 'chore-card--done' : ''} ${swiped ? 'chore-card--swiped' : ''} ${isPayout ? 'chore-card--payout' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="chore-card-left">
        <span
          className="chore-card-avatar"
          style={{ backgroundColor: member.color + '22', borderColor: member.color }}
        >
          {member.avatar}
        </span>
      </div>

      <div className="chore-card-body">
        <span className={`chore-card-name ${isCompleted ? 'chore-card-name--done' : ''}`}>
          {chore.icon && <span className="chore-card-icon">{chore.icon}</span>}
          {chore.name}
        </span>
        {value && <span className="chore-card-value">{value}</span>}
      </div>

      {isMulti ? (
        /* Multi-completion: tap counter + undo */
        <div className="chore-multi">
          <button
            type="button"
            className={`chore-multi-btn ${isMaxedOut ? 'chore-multi-btn--maxed' : ''} ${animating ? 'chore-checkbox--bounce' : ''}`}
            onClick={handleToggle}
            disabled={isMaxedOut}
            aria-label={`Log ${chore.name} (${count}/${chore.max_completions})`}
          >
            <span className="chore-multi-count">{count}</span>
            <span className="chore-multi-max">/{chore.max_completions}</span>
          </button>
          {count > 0 && (
            <button
              type="button"
              className="chore-multi-undo"
              onClick={handleUndo}
              aria-label="Undo last"
            >
              ↩
            </button>
          )}
        </div>
      ) : (
        /* Single completion: checkbox */
        <button
          type="button"
          className={`chore-checkbox ${isCompleted ? 'chore-checkbox--checked' : ''} ${animating ? 'chore-checkbox--bounce' : ''}`}
          onClick={handleToggle}
          aria-label={isCompleted ? `Undo ${chore.name}` : `Complete ${chore.name}`}
        >
          {isCompleted && (
            <svg className="chore-checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="4 12 10 18 20 6" />
            </svg>
          )}
        </button>
      )}

      {swiped && <div className="chore-card-skip">Skipped</div>}
    </div>
  );
}
