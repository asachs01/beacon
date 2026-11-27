
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

/** Live state or the settings catalog row. State values are not required. */
export interface HomeSensorListEntity {
  entity_id: string;
  friendly_name?: string | null;
  domain?: string;
  attributes?: { friendly_name?: unknown } | Record<string, unknown>;
}

function choiceLabel(entity: HomeSensorListEntity): string {
  if (typeof entity.friendly_name === 'string' && entity.friendly_name.trim()) {
    return entity.friendly_name.trim();
  }
  const name = entity.attributes?.friendly_name;
  return typeof name === 'string' && name.trim() ? name.trim() : entity.entity_id;
}

/**
 * Picker rows from the settings catalog (or a live state list). Cameras are
 * dropped. Nothing is added.
 */
export function filterHomeSensorChoices(
  entities: readonly HomeSensorListEntity[],
  search = '',
): HomeSensorChoice[] {
  const term = search.trim().toLowerCase();
  const choices: HomeSensorChoice[] = [];
  for (const entity of entities) {
    if (!entity || typeof entity.entity_id !== 'string') continue;
    if (isExcludedHomeSensor(entity.entity_id)) continue;
    const domain = typeof entity.domain === 'string' && entity.domain
      ? entity.domain
      : homeSensorDomain(entity.entity_id);
    if ((HOME_SENSOR_EXCLUDED_DOMAINS as readonly string[]).includes(domain)) continue;
    const label = choiceLabel(entity);
    if (term && !label.toLowerCase().includes(term) && !entity.entity_id.toLowerCase().includes(term)) {
      continue;
    }
    choices.push({
      entityId: entity.entity_id,
      label,
      domain,
    });
  }
  choices.sort((a, b) => a.label.localeCompare(b.label) || a.entityId.localeCompare(b.entityId));
  return choices;
}
