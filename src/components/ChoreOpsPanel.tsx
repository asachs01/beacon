/**
 * Chores screen for the ChoreOps backend.
 *
 * ChoreOps owns the data: chores are created and edited in Home Assistant and
 * Beacon only reads them and presses the `button.*` entities ChoreOps
 * advertises for claim/approve/decline. No entity ids or attribute names are
 * assumed here — everything arrives through `useChoreOps`' normalisation.
 *
 * The layout follows the Qudoo family planner: member point chips, a row of
 * stat tiles, then one card grid per family member and goal cards for rewards.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFamily } from '../hooks/useFamily';
import { useChoreOps } from '../hooks/useChoreOps';
import { resolveMemberForUser } from '../api/choreops';
import { useTranslation } from '../i18n';
import type { ChoreOpsChore } from '../types/choreops';
import type { FamilyMember } from '../types/family';
import { ChoreTaskCard, RewardGoalCard, memberColorVars } from './choreops/ChoreOpsCards';
import { MemberAvatar } from './MemberAvatar';

const CELEBRATION_MS = 2600;

interface ChoreGroup {
  key: string;
  member: FamilyMember | null;
  label: string;
  chores: ChoreOpsChore[];
}

interface Celebration {
  title: string;
  subtitle: string;
}

export function ChoreOpsPanel() {
  const { t } = useTranslation();
  const { members } = useFamily();
  const { data, loading, error, available, refresh, pressButton } = useChoreOps();

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  // Qudoo-style congratulation screen: shows briefly, then gets out of the way.
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [celebration]);

  /**
   * Optimistic action: the pill flips to "…" immediately and every other action
   * is blocked while a press is in flight; on failure we clear the pending key
   * and surface an inline error.
   */
  const handleAction = useCallback(
    async (key: string, entityId: string, subtitle: string) => {
      if (pendingAction) return;
      setActionError(null);
      setPendingAction(key);
      try {
        await pressButton(entityId);
        setCelebration({ title: t('chores.wellDone'), subtitle });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'ChoreOps action failed');
      } finally {
        setPendingAction(null);
      }
    },
    [pendingAction, pressButton, t],
  );

  const users = useMemo(() => data?.users ?? [], [data]);
  const chores = useMemo(() => data?.chores ?? [], [data]);
  const rewards = useMemo(() => data?.rewards ?? [], [data]);

  /** ChoreOps users joined to a Beacon family member for avatar/colour. */
  const linkedUsers = useMemo(
    () =>
      users
        .map((user) => ({ user, member: resolveMemberForUser(user.name, members) }))
        .sort((a, b) => a.user.name.localeCompare(b.user.name)),
    [users, members],
  );

  const groups = useMemo<ChoreGroup[]>(() => {
    const map = new Map<string, ChoreGroup>();

    for (const chore of chores) {
      const member = resolveMemberForUser(chore.assignee, members);
      const key = member?.id ?? '__shared__';
      const existing = map.get(key);
      if (existing) {
        existing.chores.push(chore);
        continue;
      }
      map.set(key, {
        key,
        member,
        label: member?.name ?? chore.assignee ?? t('chores.everyone'),
        chores: [chore],
      });
    }

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [chores, members, t]);

  const totals = useMemo(
    () => ({
      due: users.reduce((sum, user) => sum + user.dueToday, 0),
      claimed: users.reduce((sum, user) => sum + user.claimed, 0),
      approved: users.reduce((sum, user) => sum + user.approved, 0),
      done: users.reduce((sum, user) => sum + user.completedToday, 0),
    }),
    [users],
  );

  const stats: Array<{ label: string; value: number }> = [
    { label: t('chores.stat.due'), value: totals.due },
    { label: t('chores.stat.claimed'), value: totals.claimed },
    { label: t('chores.stat.approved'), value: totals.approved },
    { label: t('chores.stat.done'), value: totals.done },
  ];

  return (
    <div className="choreops-screen">
      <header className="choreops-header">
        <h1 className="choreops-title">{t('nav.chores')}</h1>
        <button type="button" className="choreops-refresh" onClick={refresh}>
          {t('chores.refresh')}
        </button>
      </header>

      {actionError && (
        <div className="choreops-alert" role="alert">
          <span>{actionError}</span>
          <button
            type="button"
            className="choreops-alert-dismiss"
            onClick={() => setActionError(null)}
            aria-label={t('app.dismiss')}
          >
            {'\u00D7'}
          </button>
        </div>
      )}

      {loading && <div className="choreops-empty">{'\u2026'}</div>}

      {!loading && error && (
        <div className="choreops-alert" role="alert">
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && !available && (
        <div className="choreops-empty">{t('chores.missing')}</div>
      )}

      {available && (
        <>
          {linkedUsers.length > 0 && (
            <div className="choreops-people">
              {linkedUsers.map(({ user, member }) => (
                <div key={user.slug} className="choreops-person" style={memberColorVars(member)}>
                  <span className="choreops-person-avatar" aria-hidden="true">
                    <MemberAvatar member={member} />
                  </span>
                  <span className="choreops-person-name">{user.name}</span>
                  <span className="choreops-person-points">
                    <span aria-hidden="true">{'\u{1F3C6}'}</span>
                    {user.points}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="choreops-stats">
            {stats.map((stat) => (
              <div key={stat.label} className="choreops-stat">
                <span className="choreops-stat-value">{stat.value}</span>
                <span className="choreops-stat-label">{stat.label}</span>
              </div>
            ))}
          </div>

          <h2 className="choreops-section-title">{t('nav.chores')}</h2>

          {groups.length === 0 ? (
            <div className="choreops-empty">{t('chores.noChoresToday')}</div>
          ) : (
            groups.map((group) => (
              <section key={group.key} className="choreops-group">
                <div className="choreops-group-head" style={memberColorVars(group.member)}>
                  <span className="choreops-group-avatar" aria-hidden="true">
                    <MemberAvatar member={group.member} fallback="\u{1F465}" />
                  </span>
                  <span className="choreops-group-name">{group.label}</span>
                  <span className="choreops-group-count">{group.chores.length}</span>
                </div>

                <div className="choreops-grid">
                  {group.chores.map((chore) => (
                    <ChoreTaskCard
                      key={chore.id}
                      chore={chore}
                      member={group.member}
                      pending={pendingAction !== null && pendingAction.startsWith(`${chore.id}:`)}
                      blocked={pendingAction !== null}
                      onAction={(key, entityId) => {
                        void handleAction(key, entityId, chore.name);
                      }}
                    />
                  ))}
                </div>
              </section>
            ))
          )}

          {rewards.length > 0 && (
            <>
              <h2 className="choreops-section-title">{t('settings.chores.rewardsTitle')}</h2>
              <div className="choreops-goals">
                {rewards.map((reward) => {
                  const assignee = reward.assignee?.trim().toLowerCase() ?? null;
                  const owner = assignee
                    ? (users.find((user) => user.name.trim().toLowerCase() === assignee) ?? null)
                    : null;

                  return (
                    <RewardGoalCard
                      key={reward.id}
                      reward={reward}
                      owner={owner}
                      member={resolveMemberForUser(reward.assignee, members)}
                      pending={pendingAction !== null && pendingAction.startsWith(`${reward.id}:`)}
                      blocked={pendingAction !== null}
                      onAction={(key, entityId) => {
                        void handleAction(key, entityId, reward.name);
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {celebration && (
        <div className="choreops-celebration" role="status" aria-live="polite">
          <span className="choreops-celebration-medallion" aria-hidden="true">
            {'\u{1F3C6}'}
          </span>
          <p className="choreops-celebration-title">{celebration.title}</p>
          <p className="choreops-celebration-sub">{celebration.subtitle}</p>
        </div>
      )}
    </div>
  );
}
