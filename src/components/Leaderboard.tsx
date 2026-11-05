import { useMemo } from 'react';
import { useChoreOps } from '../hooks/useChoreOps';
import { useFamily } from '../hooks/useFamily';
import { findUserForMember } from '../api/choreops';
import { STAR_CURRENCY } from '../types/family';
import { useTranslation } from '../i18n';
import { MemberAvatar } from './MemberAvatar';

interface LeaderboardProps {
  open: boolean;
  onClose: () => void;
}

const RANK_DECORATIONS = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

/**
 * ChoreOps points leaderboard.
 *
 * ChoreOps owns all chore data, so the ranking is each linked user's live point
 * balance. There is no local completion history to slice into weeks/months —
 * period reporting belongs in ChoreOps itself.
 */
export function Leaderboard({ open, onClose }: LeaderboardProps) {
  const { t } = useTranslation();
  const { members } = useFamily();
  const { data, loading } = useChoreOps();

  const ranked = useMemo(() => {
    const users = data?.users ?? [];
    return members
      .map((member) => ({ member, user: findUserForMember(member, users) }))
      .sort((a, b) => (b.user?.points ?? -1) - (a.user?.points ?? -1));
  }, [members, data]);

  const hasAnyone = ranked.some((entry) => entry.user !== null);

  return (
    <div className={`slide-panel slide-panel--right ${open ? 'slide-panel--open' : ''}`}>
      <div className="slide-panel-header">
        <h2 className="slide-panel-title">{t('leaderboard.title')}</h2>
        <button type="button" className="modal-close" onClick={onClose}>
          {'\u00D7'}
        </button>
      </div>

      <div className="slide-panel-body">
        {!hasAnyone && (
          <div className="chores-empty">{loading ? '\u2026' : t('leaderboard.empty')}</div>
        )}

        <div className="lb-list">
          {ranked.map((entry, index) => {
            const user = entry.user;
            const completed = user?.completedToday ?? 0;
            const podium = user !== null && index < 3;

            return (
              <div
                key={entry.member.id}
                className={`lb-row ${podium ? 'lb-row--top' : ''}`}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <span className="lb-rank">
                  {podium ? RANK_DECORATIONS[index] : `#${index + 1}`}
                </span>
                <span
                  className="lb-avatar"
                  style={{
                    backgroundColor: entry.member.color + '22',
                    borderColor: entry.member.color,
                  }}
                >
                  <MemberAvatar member={entry.member} />
                </span>
                <div className="lb-info">
                  <span className="lb-name">{entry.member.name}</span>
                  <span className="lb-stats">
                    {completed === 1
                      ? t('leaderboard.choreCompletedSingular', { count: completed })
                      : t('leaderboard.choresCompleted', { count: completed })}
                  </span>
                </div>
                <span className="lb-earnings">
                  {user ? `${STAR_CURRENCY} ${user.points}` : '\u2014'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
