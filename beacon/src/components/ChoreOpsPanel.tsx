/**
 * ChoreOps panel: read-only data plus claim/approve/decline actions.
 *
 * Renders points, the rewards strip and chore totals from ChoreOps. Actions are
 * performed by pressing the `button.*` entities that ChoreOps advertises in the
 * parent sensor's attributes, so nothing is hardcoded. Per-chore cards appear
 * once ChoreOps populates the dashboard helper's `chores` attribute; until then
 * the aggregate counters from `sensor.*_choreops_chores` are shown.
 */
import { useCallback, useState } from 'react';
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

interface ActionButtonProps {
  label: string;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
}

/** Touch-friendly (≥44px) action button for wall tablets. */
function ActionButton({ label, disabled, pending, onClick }: ActionButtonProps) {
  const inactive = Boolean(disabled) || Boolean(pending);

  return (
    <button
      type="button"
      disabled={inactive}
      onClick={onClick}
      style={{
        minHeight: 44,
        minWidth: 88,
        padding: '0 14px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        background: inactive ? 'var(--bg-page)' : 'var(--accent)',
        color: inactive ? 'var(--text-muted)' : '#fff',
        fontWeight: 600,
        fontSize: '0.85rem',
        cursor: inactive ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {pending ? '…' : label}
    </button>
  );
}

interface RewardCardProps {
  reward: ChoreOpsReward;
  /** `entityId:action` currently in flight, or null. */
  pendingAction: string | null;
  onAction: (key: string, entityId: string) => void;
}

function RewardCard({ reward, pendingAction, onAction }: RewardCardProps) {
  const status = reward.status.toLowerCase();
  const color = REWARD_STATUS_COLORS[status] ?? 'var(--text-muted)';
  const hasPendingClaim = reward.pendingClaims > 0;

  const claimEid = reward.actions.claim;
  const approveEid = reward.actions.approve;
  const declineEid = reward.actions.disapprove;

  // ChoreOps exposes no can_* flags on rewards: a locked reward cannot be
  // claimed, and approve/decline only make sense while a claim is pending.
  const canClaim = Boolean(claimEid) && status !== 'locked';
  const canReview = hasPendingClaim;

  const key = (kind: string) => `${reward.id}:${kind}`;
  const busy = (kind: string) => pendingAction === key(kind);
  const blocked = pendingAction !== null;

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
        {hasPendingClaim ? ` · ${reward.pendingClaims} pending` : ''}
      </span>

      {(canClaim || canReview) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {canClaim && claimEid && (
            <ActionButton
              label="Claim"
              pending={busy('claim')}
              disabled={blocked && !busy('claim')}
              onClick={() => onAction(key('claim'), claimEid)}
            />
          )}
          {canReview && approveEid && (
            <ActionButton
              label="Approve"
              pending={busy('approve')}
              disabled={blocked && !busy('approve')}
              onClick={() => onAction(key('approve'), approveEid)}
            />
          )}
          {canReview && declineEid && (
            <ActionButton
              label="Decline"
              pending={busy('disapprove')}
              disabled={blocked && !busy('disapprove')}
              onClick={() => onAction(key('disapprove'), declineEid)}
            />
          )}
        </div>
      )}
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
  const { data, loading, error, available, refresh, pressButton } = useChoreOps();

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * Optimistic action: the button flips to "…" immediately and the whole set is
   * blocked while one press is in flight; on failure we roll back by clearing
   * the pending key and surfacing an inline error (no modals).
   */
  const handleAction = useCallback(
    async (key: string, entityId: string) => {
      if (pendingAction) return;
      setActionError(null);
      setPendingAction(key);
      try {
        await pressButton(entityId);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'ChoreOps action failed');
      } finally {
        setPendingAction(null);
      }
    },
    [pendingAction, pressButton],
  );

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
      {actionError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #ef4444',
            background: 'rgba(239, 68, 68, 0.08)',
            color: '#ef4444',
            fontSize: '0.85rem',
          }}
        >
          <span style={{ flex: 1 }}>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            style={{
              minHeight: 44,
              minWidth: 44,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              fontSize: '1.1rem',
            }}
          >
            ×
          </button>
        </div>
      )}
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
              <RewardCard
                key={reward.id}
                reward={reward}
                pendingAction={pendingAction}
                onAction={(key, entityId) => void handleAction(key, entityId)}
              />
            ))}
          </div>
        </>
      )}

      {sectionTitle('Chores')}
      {data.chores.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.chores.map((chore) => {
            const claimEid = chore.actions.claim;
            const approveEid = chore.actions.approve;
            const claimKey = `${chore.id}:claim`;
            const approveKey = `${chore.id}:approve`;

            return (
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
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    marginLeft: 'auto',
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                  }}
                >
                  {chore.canClaim && claimEid && (
                    <ActionButton
                      label="Claim"
                      pending={pendingAction === claimKey}
                      disabled={pendingAction !== null && pendingAction !== claimKey}
                      onClick={() => void handleAction(claimKey, claimEid)}
                    />
                  )}
                  {chore.canApprove && approveEid && (
                    <ActionButton
                      label="Approve"
                      pending={pendingAction === approveKey}
                      disabled={pendingAction !== null && pendingAction !== approveKey}
                      onClick={() => void handleAction(approveKey, approveEid)}
                    />
                  )}
                  {!chore.canClaim && !chore.canApprove && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Nothing to do
                    </span>
                  )}
                </div>
              </div>
            );
          })}
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
