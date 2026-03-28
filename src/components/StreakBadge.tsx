import { useState } from 'react';
import { Streak } from '../types/family';

interface StreakBadgeProps {
  streak: Streak;
  size?: 'sm' | 'md' | 'lg';
}

export function StreakBadge({ streak, size = 'md' }: StreakBadgeProps) {
  const [showLongest, setShowLongest] = useState(false);

  if (streak.current === 0 && streak.longest === 0) return null;

  const isHot = streak.current >= 7;
  const sizeClass = `streak-badge--${size}`;
  const hotClass = isHot ? 'streak-badge--hot' : '';

  return (
    <button
      type="button"
      className={`streak-badge ${sizeClass} ${hotClass}`}
      onClick={() => setShowLongest((v) => !v)}
      title={`Longest streak: ${streak.longest} days`}
    >
      <span className="streak-fire">🔥</span>
      <span className="streak-count">
        {showLongest ? (
          <>
            <span className="streak-label">Best:</span> {streak.longest}
          </>
        ) : (
          streak.current
        )}
      </span>
    </button>
  );
}
