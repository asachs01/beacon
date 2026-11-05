/**
 * Qudoo-style chore and reward cards.
 *
 * The layout mirrors the Qudoo family planner: a tinted medallion with the
 * chore's icon, the name centred under it, and a split pill at the bottom
 * where the left half is the action and the right half is the reward.
 *
 * Every action comes from ChoreOps' own `button.*` entities (discovered at
 * runtime), so nothing here assumes entity ids or attribute names.
 */
import type { CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import type { FamilyMember } from '../../types/family';
import type { ChoreOpsChore, ChoreOpsReward, ChoreOpsUser } from '../../types/choreops';

const DONE_STATUS = /^(approved|completed|done)/i;

/** ChoreOps `icon` may be an emoji or an icon key; only emoji are portable. */
function choreEmoji(icon: string | null): string {
  return icon && !icon.includes(':') ? icon : '\u{2705}';
}

/** Expose the member colour to CSS without allocating a new object per render. */
export function memberColorVars(member: FamilyMember | null): CSSProperties {
  return member ? ({ '--member-color': member.color } as CSSProperties) : ({} as CSSProperties);
}

interface PrimaryAction {
  kind: 'claim' | 'approve';
  entityId: string;
}

/**
 * Pick the single most useful action for a chore. Approval wins when ChoreOps
 * flags the chore as reviewable (approved chores cannot be claimed again).
 */
function primaryAction(chore: ChoreOpsChore): PrimaryAction | null {
  if (DONE_STATUS.test(chore.status)) return null;

  const claim = chore.actions.claim;
  const approve = chore.actions.approve;

  if (approve && chore.canApprove) return { kind: 'approve', entityId: approve };
  if (claim) return { kind: 'claim', entityId: claim };
  if (approve) return { kind: 'approve', entityId: approve };
  return null;
}

export interface ChoreTaskCardProps {
  chore: ChoreOpsChore;
  member: FamilyMember | null;
  /** This card's action is in flight. */
  pending: boolean;
  /** Another action is in flight, so this card must not fire. */
  blocked: boolean;
  onAction: (key: string, entityId: string) => void;
}

export function ChoreTaskCard({ chore, member, pending, blocked, onAction }: ChoreTaskCardProps) {
  const { t } = useTranslation();
  const done = DONE_STATUS.test(chore.status);
  const primary = primaryAction(chore);
  const declineEid = chore.actions.disapprove;
  const showDecline = Boolean(declineEid) && chore.canApprove && !done;

  return (
    <article
      className={`choreops-card ${done ? 'choreops-card--done' : ''}`}
      style={memberColorVars(member)}
    >
      <div className="choreops-card-top">
        <span className={`choreops-pill ${done ? 'choreops-pill--done' : ''}`}>{chore.status}</span>
      </div>

      <span className="choreops-card-icon" aria-hidden="true">
        {choreEmoji(chore.icon)}
      </span>

      <h3 className="choreops-card-title">{chore.name}</h3>

      {primary ? (
        <button
          type="button"
          className="choreops-action"
          disabled={blocked || pending}
          onClick={() => onAction(`${chore.id}:${primary.kind}`, primary.entityId)}
        >
          <span className="choreops-action-main">
            {pending
              ? '\u2026'
              : primary.kind === 'claim'
                ? t('chores.claim')
                : t('chores.approve')}
          </span>
          <span className="choreops-action-reward">
            <span aria-hidden="true">{'\u{1F3C6}'}</span>
            {chore.points !== null && chore.points > 0 ? chore.points : null}
          </span>
        </button>
      ) : (
        <button type="button" className="choreops-action choreops-action--done" disabled>
          <span className="choreops-action-main">{t('common.done')}</span>
          <span className="choreops-action-reward" aria-hidden="true">
            {'\u2713'}
          </span>
        </button>
      )}

      {showDecline && declineEid && (
        <button
          type="button"
          className="choreops-secondary"
          disabled={blocked || pending}
          onClick={() => onAction(`${chore.id}:decline`, declineEid)}
        >
          {t('chores.decline')}
        </button>
      )}
    </article>
  );
}

export interface RewardGoalCardProps {
  reward: ChoreOpsReward;
  /** ChoreOps user who claimed (or is entitled to) this reward. */
  owner: ChoreOpsUser | null;
  member: FamilyMember | null;
  pending: boolean;
  blocked: boolean;
  onAction: (key: string, entityId: string) => void;
}

export function RewardGoalCard({
  reward,
  owner,
  member,
  pending,
  blocked,
  onAction,
}: RewardGoalCardProps) {
  const { t } = useTranslation();
  const status = reward.status.toLowerCase();
  const claimEid = reward.actions.claim;
  const approveEid = reward.actions.approve;
  const declineEid = reward.actions.disapprove;

  // ChoreOps exposes no can_* flags on rewards: a locked reward cannot be
  // claimed, and review actions only make sense while a claim is pending.
  const canClaim = Boolean(claimEid) && status !== 'locked';
  const canReview = reward.pendingClaims > 0;

  const points = owner?.points ?? 0;
  const progress = reward.cost > 0 ? Math.min(100, Math.round((points / reward.cost) * 100)) : 0;

  return (
    <article className="choreops-goal" style={memberColorVars(member)}>
      <div className="choreops-goal-head">
        <span className="choreops-goal-icon" aria-hidden="true">
          {'\u{1F381}'}
        </span>
        <span className="choreops-goal-name">{reward.name}</span>
        <span className="choreops-goal-cost">
          {'\u{1F3C6}'} {reward.cost}
        </span>
      </div>

      <div
        className="choreops-goal-bar"
        role="progressbar"
        aria-label={reward.name}
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="choreops-goal-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="choreops-goal-meta">
        <span>{owner ? `${points} / ${reward.cost}` : reward.status}</span>
        <span>{progress}%</span>
      </div>

      {(canClaim || canReview) && (
        <div className="choreops-goal-actions">
          {canClaim && claimEid && (
            <button
              type="button"
              className="choreops-action"
              disabled={blocked || pending}
              onClick={() => onAction(`${reward.id}:claim`, claimEid)}
            >
              <span className="choreops-action-main">{t('chores.claim')}</span>
              <span className="choreops-action-reward" aria-hidden="true">
                {'\u{1F3C6}'}
              </span>
            </button>
          )}
          {canReview && approveEid && (
            <button
              type="button"
              className="choreops-action"
              disabled={blocked || pending}
              onClick={() => onAction(`${reward.id}:approve`, approveEid)}
            >
              <span className="choreops-action-main">{t('chores.approve')}</span>
              <span className="choreops-action-reward" aria-hidden="true">
                {'\u2713'}
              </span>
            </button>
          )}
          {canReview && declineEid && (
            <button
              type="button"
              className="choreops-secondary"
              disabled={blocked || pending}
              onClick={() => onAction(`${reward.id}:decline`, declineEid)}
            >
              {t('chores.decline')}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
