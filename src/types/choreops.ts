/**
 * ChoreOps (HA custom integration) data shapes.
 *
 * Verified against a live ChoreOps 1.6.0 instance. ChoreOps does NOT expose
 * per-chore status sensors; per-chore data lives in the `chores` attribute of
 * each user's `purpose_dashboard_helper` sensor. Every ChoreOps entity carries
 * a `purpose` attribute, which is the reliable discovery key (entity_id
 * patterns are slugified user names and therefore not stable).
 */

/** Minimal HA state shape as returned by HomeAssistantClient.getStates(). */
export interface ChoreOpsEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export type ChoreOpsActionKind = 'claim' | 'approve' | 'disapprove';

export type ChoreOpsActions = Partial<Record<ChoreOpsActionKind, string>>;

export interface ChoreOpsChore {
  /** Stable key: ChoreOps `eid` when present, otherwise a name-derived id. */
  id: string;
  name: string;
  icon: string | null;
  status: string;
  assignee: string | null;
  canClaim: boolean;
  canApprove: boolean;
  actions: ChoreOpsActions;
}

export interface ChoreOpsReward {
  /** Entity id of the reward status sensor. */
  id: string;
  name: string;
  status: string;
  cost: number;
  pendingClaims: number;
  assignee: string | null;
  actions: ChoreOpsActions;
}

export interface ChoreOpsUser {
  /** `user_name` attribute — the join key to Beacon's FamilyMember.name. */
  name: string;
  /** Entity-id slug, e.g. "maya" in sensor.maya_choreops_points. */
  slug: string;
  points: number;
  dueToday: number;
  claimed: number;
  approved: number;
  completedToday: number;
}

export interface ChoreOpsState {
  users: ChoreOpsUser[];
  chores: ChoreOpsChore[];
  rewards: ChoreOpsReward[];
  /** Lower-cased user name → points balance, for quick lookups. */
  pointsByUser: Record<string, number>;
  /** True when ChoreOps entities were found at all. */
  available: boolean;
}
