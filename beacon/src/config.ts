/**
 * Beacon runtime configuration.
 *
 * The public runtime-config.js script (pairing screen, before a session)
 * only sets family_name, theme, and auto_dark_mode. After pairing, ingress,
 * or an already-paired boot, the shell merges GET /beacon-api/runtime-config
 * before anything reads the Home Assistant URL, weather entity, photo
 * settings, screen saver timeout, or browser-storage flag.
 *
 * During local development the values fall back to VITE_* environment
 * variables when the protected endpoint is missing.
 */

export interface BeaconConfig {
  ha_url: string;
  ha_token: string;
  family_name: string;
  save_config_in_browser: boolean;
  theme: string;
  auto_dark_mode: boolean;
  weather_entity: string;
  photo_directory: string;
  photo_interval: number;
  screen_saver_timeout: number;
}

declare global {
  interface Window {
    __BEACON_CONFIG__?: Partial<BeaconConfig>;
  }
}

let cached: BeaconConfig | null = null;

export function getConfig(): BeaconConfig {
  if (cached) return cached;

  const runtime = window.__BEACON_CONFIG__ ?? {};

  cached = {
    ha_url: runtime.ha_url ?? import.meta.env.VITE_HA_URL ?? '',
    ha_token: runtime.ha_token || import.meta.env.VITE_HA_TOKEN || '',
    family_name: runtime.family_name || import.meta.env.VITE_FAMILY_NAME || 'My Family',
    save_config_in_browser: runtime.save_config_in_browser ?? (import.meta.env.VITE_SAVE_CONFIG_IN_BROWSER !== 'false'),
    theme: runtime.theme || import.meta.env.VITE_THEME || 'skylight',
    auto_dark_mode: runtime.auto_dark_mode ?? (import.meta.env.VITE_AUTO_DARK_MODE !== 'false'),
    weather_entity: runtime.weather_entity || import.meta.env.VITE_HA_WEATHER_ENTITY || 'weather.home',
    photo_directory: runtime.photo_directory || import.meta.env.VITE_PHOTO_DIRECTORY || '/media/beacon/photos',
    photo_interval: runtime.photo_interval ?? (Number(import.meta.env.VITE_PHOTO_INTERVAL) || 30),
    screen_saver_timeout: runtime.screen_saver_timeout ?? (Number(import.meta.env.VITE_SCREEN_SAVER_TIMEOUT) || 5),
  };

  return cached;
}

/**
 * Override the cached config with dynamic credentials (from onboarding/OAuth).
 * Call this after the user completes setup to inject the HA URL + token
 * without requiring a page reload.
 */
export function patchConfig(patch: Partial<BeaconConfig>): void {
  const current = getConfig();
  cached = { ...current, ...patch };
}

/**
 * Merge a protected runtime-config payload into the cache and the public
 * window object. A token is never written onto window.__BEACON_CONFIG__.
 */
export function mergeRuntimeConfig(patch: Partial<BeaconConfig>): void {
  const safe = { ...patch };
  delete safe.ha_token;
  const current = getConfig();
  cached = { ...current, ...safe };
  if (typeof window !== 'undefined') {
    window.__BEACON_CONFIG__ = { ...(window.__BEACON_CONFIG__ ?? {}), ...safe };
  }
}

/** Drop the cache so the next read rebuilds from window.__BEACON_CONFIG__. */
export function resetRuntimeConfigCache(): void {
  cached = null;
}
