import { useState, useMemo, useEffect } from 'react';
import { StreakBadge } from './StreakBadge';
import { useChores } from '../hooks/useChores';
import { useFamily } from '../hooks/useFamily';
import { useSettings } from '../hooks/useSettings';
import { MemberEarnings, formatChoreValue } from '../types/family';
import { localDayKey } from '../api/date-keys';
import { useTranslation } from '../i18n';

interface LeaderboardProps {
  open: boolean;
  onClose: () => void;
}

type Period = 'week' | 'month';

function getWeekRange(): [string, string] {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return [localDayKey(start), localDayKey(end)];
}

function getMonthRange(): [string, string] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [localDayKey(start), localDayKey(end)];
}

const RANK_DECORATIONS = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

export function Leaderboard({ open, onClose }: LeaderboardProps) {
  const { t } = useTranslation();
  const { members } = useFamily();
  const { settings } = useSettings();
  const { getEarningsForPeriod, getStreakForMember } = useChores();
  const [period, setPeriod] = useState<Period>('week');
  const [earnings, setEarnings] = useState<MemberEarnings[]>([]);

  const [start, end] = period === 'week' ? getWeekRange() : getMonthRange();

  useEffect(() => {
    getEarningsForPeriod(start, end).then(setEarnings);
  }, [start, end, getEarningsForPeriod]);

  // Build ranked list — include members with zero earnings too
  const ranked = useMemo(() => {
    const earningsMap = new Map(earnings.map((e) => [e.member_id, e]));
    return members
      .map((m) => ({
        member: m,
        earnings: earningsMap.get(m.id) ?? { member_id: m.id, total_cents: 0, chore_count: 0 },
        streak: getStreakForMember(m.id),
      }))
      .sort((a, b) => b.earnings.total_cents - a.earnings.total_cents);
  }, [members, earnings, getStreakForMember]);

  return (
    <div className={`slide-panel slide-panel--right ${open ? 'slide-panel--open' : ''}`}>
      <div className="slide-panel-header">
        <h2 className="slide-panel-title">{t('leaderboard.title')}</h2>
        <button type="button" className="modal-close" onClick={onClose}>
          {'\u00D7'}
        </button>
      </div>

      {/* Period toggle */}
      <div className="lb-period-toggle">
        <button
          type="button"
          className={`lb-period-btn ${period === 'week' ? 'lb-period-btn--active' : ''}`}
          onClick={() => setPeriod('week')}
        >
          {t('leaderboard.thisWeek')}
        </button>
        <button
          type="button"
          className={`lb-period-btn ${period === 'month' ? 'lb-period-btn--active' : ''}`}
          onClick={() => setPeriod('month')}
        >
          {t('leaderboard.thisMonth')}
        </button>
      </div>

      <div className="slide-panel-body">
        {ranked.length === 0 && (
          <div className="chores-empty">{t('leaderboard.empty')}</div>
        )}

        <div className="lb-list">
          {ranked.map((entry, index) => (
            <div
              key={entry.member.id}
              className={`lb-row ${index < 3 ? 'lb-row--top' : ''}`}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <span className="lb-rank">
                {index < 3 ? RANK_DECORATIONS[index] : `#${index + 1}`}
              </span>
              <span
                className="lb-avatar"
                style={{ backgroundColor: entry.member.color + '22', borderColor: entry.member.color }}
              >
                {entry.member.avatar}
              </span>
              <div className="lb-info">
                <span className="lb-name">{entry.member.name}</span>
                <span className="lb-stats">
                  {entry.earnings.chore_count === 1 
                    ? t('leaderboard.choreCompletedSingular', { count: entry.earnings.chore_count })
                    : t('leaderboard.choresCompleted', { count: entry.earnings.chore_count })
                  }
                </span>
              </div>
              <StreakBadge streak={entry.streak} size="sm" />
              <span className="lb-earnings">{formatChoreValue(entry.earnings.total_cents, settings.currencySymbol)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
