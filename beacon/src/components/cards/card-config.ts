/**
 * Readers for card `config` values.
 *
 * Config comes from layouts persisted by earlier versions, so every value is
 * treated as untrusted and falls back instead of throwing.
 */
export function readString(config: Record<string, unknown>, key: string, fallback = ''): string {
  const value = config[key];
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function readBoolean(config: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = config[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function readStringArray(config: Record<string, unknown>, key: string): string[] {
  const value = config[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/** Entity list, falling back to a pre-multi-entity single-entity key. */
export function readEntityIds(
  config: Record<string, unknown>,
  key: string,
  legacyKey?: string,
): string[] {
  const entityIds = readStringArray(config, key);
  if (entityIds.length > 0) return entityIds;

  const legacyEntityId = legacyKey ? readString(config, legacyKey) : '';
  return legacyEntityId ? [legacyEntityId] : [];
}
