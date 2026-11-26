import type { HaLiveState } from './types';

/** Camera entities are omitted so this card never becomes a camera feed. */
export const HOME_SENSOR_EXCLUDED_DOMAINS = ['camera'] as const;

export interface HomeSensorChoice {
  entityId: string;
  label: string;
  domain: string;
}

export function homeSensorDomain(entityId: string): string {
  return entityId.split('.')[0] ?? '';
}

export function isExcludedHomeSensor(entityId: string): boolean {
  return (HOME_SENSOR_EXCLUDED_DOMAINS as readonly string[]).includes(homeSensorDomain(entityId));
}

function choiceLabel(entity: HaLiveState): string {
  const name = entity.attributes.friendly_name;
  return typeof name === 'string' && name.trim() ? name.trim() : entity.entity_id;
}

/**
 * Picker rows from a get_states result. Anything the token cannot read is
 * already absent from `entities`. Cameras are dropped. Nothing is added.
 */
export function filterHomeSensorChoices(
  entities: readonly HaLiveState[],
  search = '',
): HomeSensorChoice[] {
  const term = search.trim().toLowerCase();
  const choices: HomeSensorChoice[] = [];
  for (const entity of entities) {
    if (!entity || typeof entity.entity_id !== 'string') continue;
    if (isExcludedHomeSensor(entity.entity_id)) continue;
    const label = choiceLabel(entity);
    if (term && !label.toLowerCase().includes(term) && !entity.entity_id.toLowerCase().includes(term)) {
      continue;
    }
    choices.push({
      entityId: entity.entity_id,
      label,
      domain: homeSensorDomain(entity.entity_id),
    });
  }
  choices.sort((a, b) => a.label.localeCompare(b.label) || a.entityId.localeCompare(b.entityId));
  return choices;
}
