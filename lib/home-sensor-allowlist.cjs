'use strict';

/**
 * Entity ids the Home sensors card is allowed to receive.
 *
 * The card ships off. A missing flag, a non-boolean true, an empty list, or
 * a camera id produces an empty set, and the bridge then delivers nothing.
 * This matches normalizeHomeSensorSettings in src/home-sensors/settings.ts.
 */

function domainOf(entityId) {
  const dot = entityId.indexOf('.');
  return dot === -1 ? '' : entityId.slice(0, dot);
}

/** Real Home Assistant entity ids are `domain.object_id` with no path characters. */
function isStreamableEntityId(entityId) {
  if (typeof entityId !== 'string') return false;
  const trimmed = entityId.trim();
  if (!trimmed.includes('.')) return false;
  if (trimmed.includes('/') || trimmed.includes('?') || trimmed.includes('#') || trimmed.includes('%')) return false;
  if (/\s/.test(trimmed)) return false;
  const domain = domainOf(trimmed);
  if (!domain || domain === 'camera') return false;
  return true;
}

function allowedEntityIdSet(settings) {
  const allowed = new Set();
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return allowed;
  if (settings.homeSensorsEnabled !== true) return allowed;
  const rows = Array.isArray(settings.homeSensors) ? settings.homeSensors : [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const entityId = typeof row.entityId === 'string' ? row.entityId.trim() : '';
    if (!isStreamableEntityId(entityId)) continue;
    allowed.add(entityId);
  }
  return allowed;
}

function textAttr(attributes, key) {
  if (!attributes || typeof attributes !== 'object') return null;
  const value = attributes[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Settings picker rows. Keys are exactly entity_id, friendly_name, domain,
 * device_class, and unit. State, context, and every other attribute are dropped.
 * Cameras are omitted so the picker cannot select a camera feed.
 */
function homeSensorEntityMetadata(states) {
  if (!Array.isArray(states)) return [];
  const entities = [];
  for (const row of states) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const entityId = typeof row.entity_id === 'string' ? row.entity_id.trim() : '';
    if (!isStreamableEntityId(entityId)) continue;
    const attributes = row.attributes && typeof row.attributes === 'object' ? row.attributes : null;
    entities.push({
      entity_id: entityId,
      friendly_name: textAttr(attributes, 'friendly_name'),
      domain: domainOf(entityId),
      device_class: textAttr(attributes, 'device_class'),
      unit: textAttr(attributes, 'unit_of_measurement'),
    });
  }
  return entities;
}

module.exports = {
  allowedEntityIdSet,
  homeSensorEntityMetadata,
  isStreamableEntityId,
};
