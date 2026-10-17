import { useState } from 'react';
import { Streak } from '../types/family';
import { useTranslation } from '../i18n';

interface StreakBadgeProps {
  streak: Streak;
  size?: 'sm' | 'md' | 'lg';
}

export function StreakBadge({ streak, size = 'md' }: StreakBadgeProps) {
  const { t } = useTranslation();
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
      title={t('streak.longestTooltip', { count: streak.longest })}
    >
      <span className="streak-fire">🔥</span>
      <span className="streak-count">
        {showLongest ? (
          <>
            <span className="streak-label">{t('streak.best')}</span> {streak.longest}
          </>
        ) : (
          streak.current
        )}
      </span>
    </button>
  );
}
