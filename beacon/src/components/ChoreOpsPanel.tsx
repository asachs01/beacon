/**
 * Read-only ChoreOps panel (Phase 1).
 *
 * Renders points, the rewards strip and chore totals from ChoreOps. Per-chore
 * cards appear automatically once ChoreOps populates the dashboard helper's
 * `chores` attribute; until then the aggregate counters from
 * `sensor.*_choreops_chores` are shown so the panel is never blank.
 */
import { useFamily } from '../hooks/useFamily';
import { useChoreOps } from '../hooks/useChoreOps';
import { resolveMemberForUser } from '../api/choreops';
import type { ChoreOpsReward, ChoreOpsUser } from '../types/choreops';
import { STAR_CURRENCY } from '../types/family';

const REWARD_STATUS_COLORS: Record<string, string> = {
  available: 'var(--accent)',
  locked: 'var(--text-muted)',
  pending: '#f59e0b',
  approved: '#22c55e',
};

function RewardCard({ reward }: { reward: ChoreOpsReward }) {
  const color = REWARD_STATUS_COLORS[reward.status.toLowerCase()] ?? 'var(--text-muted)';
  const pending = reward.pendingClaims > 0;

  return (
    <div
      style={{
        minWidth: 160,
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        background: 'var(--bg-page)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{reward.name}</span>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        {STAR_CURRENCY} {reward.cost}
      </span>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color, textTransform: 'capitalize' }}>
        {reward.status}
        {pending ? ` · ${reward.pendingClaims} pending` : ''}
      </span>
    </div>
  );
}

function PointsChip({ user, avatar }: { user: ChoreOpsUser; avatar: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'var(--bg-page)',
        minHeight: 44,
      }}
    >
      {avatar && <span style={{ fontSize: '1.25rem' }}>{avatar}</span>}
      <span style={{ fontWeight: 600 }}>{user.name}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
        {STAR_CURRENCY} {user.points}
      </span>
    </div>
  );
}

export function ChoreOpsPanel() {
  const { members } = useFamily();
  const { data, loading, error, available, refresh } = useChoreOps();

  const sectionTitle = (text: string) => (
    <h3
      style={{
        margin: '20px 0 8px',
        fontSize: '0.8rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}
    >
      {text}
    </h3>
  );

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading ChoreOps…</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #ef4444',
            background: 'rgba(239, 68, 68, 0.08)',
            color: '#ef4444',
          }}
        >
          {error}
        </div>
        <button
          type="button"
          onClick={refresh}
          style={{ marginTop: 12, minHeight: 44, padding: '0 16px', cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!available || !data) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        No ChoreOps entities were found. Confirm the ChoreOps integration is installed in Home
        Assistant and that <code>chore_backend</code> is set to <code>choreops</code>.
      </div>
    );
  }

  const users = data.users;
  const totalDue = users.reduce((sum, u) => sum + u.dueToday, 0);
  const totalClaimed = users.reduce((sum, u) => sum + u.claimed, 0);
  const totalApproved = users.reduce((sum, u) => sum + u.approved, 0);
  const totalCompleted = users.reduce((sum, u) => sum + u.completedToday, 0);

  return (
    <div style={{ padding: '16px 20px 32px', overflowY: 'auto', height: '100%' }}>
      {sectionTitle('Points')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {users.length === 0 && (
          <span style={{ color: 'var(--text-muted)' }}>No ChoreOps users found.</span>
        )}
        {users.map((user) => (
          <PointsChip
            key={user.slug}
            user={user}
            avatar={resolveMemberForUser(user.name, members)?.avatar ?? null}
          />
        ))}
      </div>

      {data.rewards.length > 0 && (
        <>
          {sectionTitle('Rewards')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {data.rewards.map((reward) => (
              <RewardCard key={reward.id} reward={reward} />
            ))}
          </div>
        </>
      )}

      {sectionTitle('Chores')}
      {data.chores.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.chores.map((chore) => (
            <div
              key={chore.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                minHeight: 56,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--bg-page)',
              }}
            >
              {chore.icon && <span style={{ fontSize: '1.4rem' }}>{chore.icon}</span>}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600 }}>{chore.name}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {chore.assignee ?? 'Everyone'} · {chore.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'Due today', value: totalDue },
            { label: 'Claimed', value: totalClaimed },
            { label: 'Awaiting approval', value: totalApproved },
            { label: 'Completed today', value: totalCompleted },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                minWidth: 130,
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--bg-page)',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stat.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
