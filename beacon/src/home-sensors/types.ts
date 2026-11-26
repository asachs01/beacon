/** One row in Settings → Integrations → Home sensors. */
export interface HomeSensorPick {
  entityId: string;
  /** Empty uses the Home Assistant friendly name. */
  name: string;
  /** Empty shows no icon. An emoji or a short label, never a camera image. */
  icon: string;
}

/** Entity state as Home Assistant returns it from get_states or state_changed. */
export interface HaLiveState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
  last_reported?: string;
}
