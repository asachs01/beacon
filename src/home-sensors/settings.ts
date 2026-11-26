import { guestCanSee } from '../display/guest-mode';
import { isExcludedHomeSensor } from './entities';
import type { HomeSensorPick } from './types';

export type { HomeSensorPick };

/**
 * The card ships off. A saved settings object that never mentions it stays
 * off, and only a real `true` turns it on.
 */
export function normalizeHomeSensorSettings(value: {
  homeSensorsEnabled?: unknown;
  homeSensors?: unknown;
} | null | undefined): { homeSensorsEnabled: boolean; homeSensors: HomeSensorPick[] } {
  const enabled = value?.homeSensorsEnabled === true;
  const rows = Array.isArray(value?.homeSensors) ? value.homeSensors : [];
  const seen = new Set<string>();
  const homeSensors: HomeSensorPick[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const entityId = typeof record.entityId === 'string' ? record.entityId.trim() : '';
    if (!entityId.includes('.') || isExcludedHomeSensor(entityId) || seen.has(entityId)) continue;
    seen.add(entityId);
    const name = typeof record.name === 'string' ? record.name.trim().slice(0, 80) : '';
    const icon = typeof record.icon === 'string' ? record.icon.trim().slice(0, 8) : '';
    homeSensors.push({ entityId, name, icon });
  }
  return { homeSensorsEnabled: enabled, homeSensors };
}

/**
 * The dashboard card is hidden unless the setting is on, the screen is not
 * Kid Display, and guest mode allows the `homeSensors` feature. That feature
 * is registered as kind `sensors`, which is hidden from guests by default.
 */
export function homeSensorsCardVisible(input: {
  enabled: boolean;
  guestActive: boolean;
  kidDisplay?: boolean;
}): boolean {
  if (input.kidDisplay) return false;
  if (input.enabled !== true) return false;
  return guestCanSee(input.guestActive === true, 'homeSensors');
}
