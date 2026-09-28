import { useState, useMemo, useEffect } from 'react';
import { addDays, startOfWeek } from 'date-fns';
import { StreakBadge } from './StreakBadge';
import { useChores } from '../hooks/useChores';
import { useFamily } from '../hooks/useFamily';
import { useSettings } from '../hooks/useSettings';
import { MemberEarnings, formatChoreValue } from '../types/family';
import { localDayKey } from '../api/date-keys';

interface LeaderboardProps {
  open: boolean;
  onClose: () => void;
}

type Period = 'week' | 'month';

/**
 * This week's first and last day, the week starting on the day set in
 * Settings, as weekly chores' do. It always started on Sunday (and ran on
 * into the next Sunday).
 */
function getWeekRange(weekStartsOn: 0 | 1): [string, string] {
  const start = startOfWeek(new Date(), { weekStartsOn });
  return [localDayKey(start), localDayKey(addDays(start, 6))];
}

function getMonthRange(): [string, string] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [localDayKey(start), localDayKey(end)];
}

const RANK_DECORATIONS = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

export function Leaderboard({ open, onClose }: LeaderboardProps) {
  const { members } = useFamily();
  const { settings } = useSettings();
  const { getEarningsForPeriod, getStreakForMember } = useChores();
  // Opens on the period chores are paid for (Settings > Chores > Payout Schedule).
  const [period, setPeriod] = useState<Period>(() => (settings.payoutSchedule === 'monthly' ? 'month' : 'week'));
  const [earnings, setEarnings] = useState<MemberEarnings[]>([]);

  const [start, end] = period === 'week' ? getWeekRange(settings.weekStartsOn) : getMonthRange();

  useEffect(() => {
    // Ignore a resolve from a period we've since switched away from, so a
    // slower earlier fetch can't overwrite the current period's totals.
    let cancelled = false;
    getEarningsForPeriod(start, end).then((e) => {
      if (!cancelled) setEarnings(e);
    });
    return () => {
      cancelled = true;
    };
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
        <h2 className="slide-panel-title">Leaderboard</h2>
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
          This Week
        </button>
        <button
          type="button"
          className={`lb-period-btn ${period === 'month' ? 'lb-period-btn--active' : ''}`}
          onClick={() => setPeriod('month')}
        >
          This Month
        </button>
      </div>

      <div className="slide-panel-body">
        {ranked.length === 0 && (
          <div className="chores-empty">Add family members and chores to see the leaderboard.</div>
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
                  {entry.earnings.chore_count} chore{entry.earnings.chore_count !== 1 ? 's' : ''}
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
