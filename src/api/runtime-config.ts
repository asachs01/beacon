/**
 * Load the fields that stay off the public runtime-config.js script.
 *
 * A 401 (still unpaired), a missing dev server, or a network error leaves
 * the public script and the built-in defaults in place. Callers still render.
 */
import { mergeRuntimeConfig, type BeaconConfig } from '../config';
import { getIngressBasePath } from '../utils/ha-env';

export const PROTECTED_RUNTIME_CONFIG_PATH = '/beacon-api/runtime-config';

const STRING_FIELDS = [
  'ha_url',
  'family_name',
  'theme',
  'weather_entity',
  'photo_directory',
] as const;

const BOOLEAN_FIELDS = ['save_config_in_browser', 'auto_dark_mode'] as const;

const NUMBER_FIELDS = ['photo_interval', 'screen_saver_timeout'] as const;

function pickRuntimeConfig(value: unknown): Partial<BeaconConfig> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const patch: Partial<BeaconConfig> = {};
  for (const key of STRING_FIELDS) {
    if (typeof source[key] === 'string') patch[key] = source[key];
  }
  for (const key of BOOLEAN_FIELDS) {
    if (typeof source[key] === 'boolean') patch[key] = source[key];
  }
  for (const key of NUMBER_FIELDS) {
    if (typeof source[key] === 'number' && Number.isFinite(source[key])) patch[key] = source[key];
  }
  return patch;
}

/**
 * Fetch the protected config and merge it. Resolves false when the response
 * cannot be used. Never rejects.
 */
export async function loadProtectedRuntimeConfig(): Promise<boolean> {
  try {
    const base = getIngressBasePath();
    const res = await fetch(`${base}${PROTECTED_RUNTIME_CONFIG_PATH}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const patch = pickRuntimeConfig(await res.json());
    if (!patch) return false;
    mergeRuntimeConfig(patch);
    return true;
  } catch {
    return false;
  }
}
