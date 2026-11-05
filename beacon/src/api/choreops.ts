/**
 * Pure parsing/normalisation for ChoreOps HA entities.
 *
 * No entity IDs and no attribute *names* beyond the documented `purpose`
 * discriminator are assumed: button entity IDs are discovered by scanning
 * attribute values for `button.*`, and action names are classified from the
 * attribute key they were found under. This keeps the integration working when
 * ChoreOps renames a chore/reward or adds new buttons.
 */
import type {
  ChoreOpsActionKind,
  ChoreOpsActions,
  ChoreOpsChore,
  ChoreOpsEntityState,
  ChoreOpsReward,
  ChoreOpsState,
  ChoreOpsUser,
  HaPerson,
} from '../types/choreops';

export const CHOREOPS_PURPOSE = {
  points: 'purpose_points',
  chores: 'purpose_chores',
  dashboardHelper: 'purpose_dashboard_helper',
  systemHelper: 'purpose_system_dashboard_helper',
  rewardStatus: 'purpose_reward_status',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function purposeOf(entity: ChoreOpsEntityState): string | null {
  const purpose = entity.attributes.purpose;
  return typeof purpose === 'string' ? purpose : null;
}

function str(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function flag(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true;
}

/** Classify an attribute key such as `claim_button_eid` into an action kind. */
export function actionKindFromKey(key: string): ChoreOpsActionKind | null {
  const lower = key.toLowerCase();
  if (lower.includes('disapprove')) return 'disapprove';
  if (lower.includes('approve')) return 'approve';
  if (lower.includes('claim')) return 'claim';
  return null;
}

/** Discover action button entity IDs without hardcoding attribute names. */
export function discoverActions(source: Record<string, unknown>): ChoreOpsActions {
  const actions: ChoreOpsActions = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string' || !value.startsWith('button.')) continue;
    const kind = actionKindFromKey(key);
    if (kind && !actions[kind]) actions[kind] = value;
  }

  return actions;
}

/**
 * Slug used by ChoreOps in entity IDs: `sensor.maya_choreops_points` → "maya".
 * Returns null for system/shared entities (`sensor.system_choreops_...`).
 */
export function slugFromEntityId(entityId: string): string | null {
  const match = /^[a-z_]+\.([a-z0-9]+)_choreops_/.exec(entityId);
  return match ? match[1] : null;
}

function normalizeChore(item: unknown, fallbackAssignee: string | null): ChoreOpsChore | null {
  if (!isRecord(item)) return null;

  const name = str(item, 'name') ?? str(item, 'chore_name') ?? str(item, 'friendly_name');
  const eid = str(item, 'eid') ?? str(item, 'entity_id');
  const assignee = str(item, 'user_name') ?? str(item, 'assignee') ?? fallbackAssignee;

  if (!name && !eid) return null;

  return {
    id: eid ?? `${assignee ?? 'shared'}:${name ?? 'chore'}`,
    name: name ?? eid ?? 'Chore',
    icon: str(item, 'icon'),
    status: str(item, 'status') ?? str(item, 'state') ?? 'unknown',
    assignee,
    points: pointsOf(item),
    canClaim: flag(item, 'can_claim'),
    canApprove: flag(item, 'can_approve'),
    actions: discoverActions(item),
  };
}

/**
 * Optional per-chore reward. ChoreOps does not publish a points field on every
 * `chores` item shape, so probe the keys seen in practice and return null when
 * none is present — the card then hides the reward badge instead of inventing
 * a number.
 */
function pointsOf(source: Record<string, unknown>): number | null {
  for (const key of ['points', 'points_value', 'chore_points', 'punten']) {
    const value = num(source, key);
    if (value !== null) return value;
  }
  return null;
}

function normalizeReward(entity: ChoreOpsEntityState): ChoreOpsReward | null {
  const name = str(entity.attributes, 'reward_name');
  if (!name) return null;

  return {
    id: entity.entity_id,
    name,
    status: entity.state,
    cost: num(entity.attributes, 'cost') ?? 0,
    pendingClaims: num(entity.attributes, 'pending_claims') ?? 0,
    assignee: str(entity.attributes, 'user_name'),
    actions: discoverActions(entity.attributes),
  };
}

/**
 * Build the normalized ChoreOps view from a full HA state snapshot.
 * Chore items come from the per-user dashboard helper's `chores` attribute,
 * which ChoreOps leaves empty when nothing is due.
 */
export function normalizeChoreOps(states: ChoreOpsEntityState[]): ChoreOpsState {
  const usersBySlug = new Map<string, ChoreOpsUser>();
  const rewards: ChoreOpsReward[] = [];
  const chores: ChoreOpsChore[] = [];
  const people: HaPerson[] = [];
  let available = false;

  const ensureUser = (slug: string, name: string): ChoreOpsUser => {
    const existing = usersBySlug.get(slug);
    if (existing) return existing;
    const created: ChoreOpsUser = {
      name,
      slug,
      points: 0,
      dueToday: 0,
      claimed: 0,
      approved: 0,
      completedToday: 0,
    };
    usersBySlug.set(slug, created);
    return created;
  };

  for (const entity of states) {
    // HA persons exist independently of ChoreOps (e.g. parents who do not do
    // chores) so collect them before the purpose check filters them out.
    if (entity.entity_id.startsWith('person.')) {
      const name = str(entity.attributes, 'friendly_name');
      if (name) {
        people.push({
          entityId: entity.entity_id,
          name,
          picture: str(entity.attributes, 'entity_picture'),
        });
      }
      continue;
    }

    const purpose = purposeOf(entity);
    if (!purpose) continue;

    const slug = slugFromEntityId(entity.entity_id);
    const userName = str(entity.attributes, 'user_name');

    if (purpose === CHOREOPS_PURPOSE.points && slug && userName) {
      available = true;
      ensureUser(slug, userName).points = Number(entity.state) || 0;
      continue;
    }

    if (purpose === CHOREOPS_PURPOSE.chores && slug && userName) {
      available = true;
      const user = ensureUser(slug, userName);
      user.dueToday = num(entity.attributes, 'chore_stat_current_due_today') ?? 0;
      user.claimed = num(entity.attributes, 'chore_stat_current_claimed') ?? 0;
      user.approved = num(entity.attributes, 'chore_stat_current_approved') ?? 0;
      user.completedToday = num(entity.attributes, 'chore_stat_completed_today') ?? 0;
      continue;
    }

    if (purpose === CHOREOPS_PURPOSE.dashboardHelper) {
      available = true;
      const assignee = userName ?? (slug ? ensureUser(slug, slug).name : null);
      const rawChores = entity.attributes.chores;
      if (Array.isArray(rawChores)) {
        for (const item of rawChores) {
          const chore = normalizeChore(item, assignee);
          if (chore) chores.push(chore);
        }
      }
      continue;
    }

    if (purpose === CHOREOPS_PURPOSE.rewardStatus) {
      available = true;
      const reward = normalizeReward(entity);
      if (reward) rewards.push(reward);
    }
  }

  const users = Array.from(usersBySlug.values()).sort((a, b) => a.name.localeCompare(b.name));
  const pointsByUser: Record<string, number> = {};
  for (const user of users) pointsByUser[user.name.trim().toLowerCase()] = user.points;

  return { users, chores, rewards, people, pointsByUser, available };
}

/** Match a ChoreOps user to a Beacon family member by name (case-insensitive). */
export function matchMemberByName<T extends { name: string }>(
  userName: string | null,
  members: T[],
): T | null {
  if (!userName) return null;
  const target = userName.trim().toLowerCase();
  return members.find((member) => member.name.trim().toLowerCase() === target) ?? null;
}

/**
 * Resolve the family member for a ChoreOps user.
 *
 * An explicit `choreops_user` link always wins; a name match is the fallback so
 * associations work before anyone touches the settings UI.
 */
export function resolveMemberForUser<T extends { name: string; choreops_user?: string }>(
  userName: string | null,
  members: T[],
): T | null {
  if (!userName) return null;
  const target = userName.trim().toLowerCase();

  return (
    members.find((member) => member.choreops_user?.trim().toLowerCase() === target) ??
    matchMemberByName(userName, members)
  );
}

/**
 * Inverse of `resolveMemberForUser`: find the ChoreOps user behind a member.
 * An explicit `choreops_user` link wins, a name match is the fallback.
 */
export function findUserForMember<T extends { name: string; choreops_user?: string }>(
  member: T,
  users: ChoreOpsUser[],
): ChoreOpsUser | null {
  const link = member.choreops_user?.trim().toLowerCase();
  const byLink = link ? users.find((user) => user.name.trim().toLowerCase() === link) : undefined;
  if (byLink) return byLink;

  const name = member.name.trim().toLowerCase();
  return users.find((user) => user.name.trim().toLowerCase() === name) ?? null;
}
