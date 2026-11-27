import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  HA_BROWSER_TOKEN_WARNING,
  buildRuntimeConfig,
  renderRuntimeConfig,
  warnIfBrowserTokenSet,
} from '../../lib/runtime-config.cjs';

const BROWSER_TOKEN = 'browser-token-do-not-publish';
const SERVER_TOKEN = 'supervisor-or-long-lived-token';

/**
 * Hardcoded on purpose. Adding a key to the public script fails this test
 * until the list is updated in the same change.
 */
const PUBLIC_RUNTIME_CONFIG_KEYS = ['auto_dark_mode', 'family_name', 'theme'];

function parseRuntimeScript(js: string): Record<string, unknown> {
  const prefix = 'window.__BEACON_CONFIG__ = ';
  expect(js.startsWith(prefix)).toBe(true);
  expect(js.endsWith(';')).toBe(true);
  return JSON.parse(js.slice(prefix.length, -1)) as Record<string, unknown>;
}

describe('runtime-config.js', () => {
  it('publishes exactly the pairing-screen keys and never a token', () => {
    const env = {
      HA_URL: 'http://192.168.1.20:8123',
      HA_TOKEN: SERVER_TOKEN,
      HA_BROWSER_TOKEN: BROWSER_TOKEN,
      SUPERVISOR_TOKEN: SERVER_TOKEN,
      FAMILY_NAME: 'Adams',
      THEME: 'midnight',
      AUTO_DARK_MODE: 'false',
      SAVE_CONFIG_IN_BROWSER: 'false',
      WEATHER_ENTITY: 'weather.kitchen',
      PHOTO_DIRECTORY: '/media/beacon/vacation',
      PHOTO_INTERVAL: '45',
      SCREEN_SAVER_TIMEOUT: '12',
    };
    const js = renderRuntimeConfig(env);
    const parsed = parseRuntimeScript(js);

    expect(Object.keys(parsed).sort()).toEqual(PUBLIC_RUNTIME_CONFIG_KEYS);
    expect(parsed).toEqual({
      family_name: 'Adams',
      theme: 'midnight',
      auto_dark_mode: false,
    });
    expect(js).not.toContain(BROWSER_TOKEN);
    expect(js).not.toContain(SERVER_TOKEN);
    expect(js).not.toContain('ha_token');
    expect(js).not.toContain('ha_url');
    expect(js).not.toContain('photo_directory');
    expect(js).not.toContain('weather_entity');
    expect(js).not.toContain('weather.kitchen');
    expect(js).not.toContain('/media/beacon/vacation');
    expect(js).not.toContain('save_config_in_browser');
    expect(js).not.toContain('screen_saver_timeout');
    expect(js).not.toContain('HA_BROWSER_TOKEN');
    expect(js).not.toContain('HA_TOKEN');
    expect(js.toLowerCase()).not.toContain('token');
  });

  it('keeps the full config, including house settings, off the public script', () => {
    const full = buildRuntimeConfig({
      HA_URL: 'http://192.168.1.20:8123',
      FAMILY_NAME: 'Adams',
      THEME: 'midnight',
      AUTO_DARK_MODE: 'false',
      SAVE_CONFIG_IN_BROWSER: 'false',
      WEATHER_ENTITY: 'weather.kitchen',
      PHOTO_DIRECTORY: '/media/beacon/vacation',
      PHOTO_INTERVAL: '45',
      SCREEN_SAVER_TIMEOUT: '12',
      HA_TOKEN: SERVER_TOKEN,
    });
    expect(Object.keys(full).sort()).toEqual([
      'auto_dark_mode',
      'family_name',
      'ha_url',
      'photo_directory',
      'photo_interval',
      'save_config_in_browser',
      'screen_saver_timeout',
      'theme',
      'weather_entity',
    ]);
    expect(full).toEqual({
      ha_url: 'http://192.168.1.20:8123',
      family_name: 'Adams',
      save_config_in_browser: false,
      theme: 'midnight',
      auto_dark_mode: false,
      weather_entity: 'weather.kitchen',
      photo_directory: '/media/beacon/vacation',
      photo_interval: 45,
      screen_saver_timeout: 12,
    });
    expect(full).not.toHaveProperty('ha_token');
  });

  it('does not publish token-like env vars or config keys', () => {
    const sentinel = 'sentinel-secret-xyz';
    const env = {
      HA_URL: 'http://192.168.1.20:8123',
      FAMILY_NAME: 'Adams',
      HA_TOKEN: sentinel,
      HA_BROWSER_TOKEN: sentinel,
      SUPERVISOR_TOKEN: sentinel,
      BEACON_TOKEN: sentinel,
    };
    const config = buildRuntimeConfig(env);
    const rendered = renderRuntimeConfig(env);

    expect(rendered).not.toContain(sentinel);
    for (const key of Object.keys(config)) {
      expect(key, key).not.toMatch(/token|secret|password|key|bearer|auth/i);
    }
    for (const key of Object.keys(parseRuntimeScript(rendered))) {
      expect(key, key).not.toMatch(/token|secret|password|key|bearer|auth/i);
    }
    expect(rendered).toContain('"family_name":"Adams"');
    expect(rendered).not.toContain('ha_url');
  });

  it('logs the deprecation warning when HA_BROWSER_TOKEN is set and stays quiet otherwise', () => {
    const log = vi.fn();
    warnIfBrowserTokenSet({ HA_BROWSER_TOKEN: BROWSER_TOKEN }, log);
    expect(log).toHaveBeenCalledWith(HA_BROWSER_TOKEN_WARNING);
    log.mockClear();
    warnIfBrowserTokenSet({}, log);
    expect(log).not.toHaveBeenCalled();
  });

  it('is not written by run.sh in either tree', () => {
    for (const file of ['run.sh', 'beacon/run.sh']) {
      const script = readFileSync(file, 'utf8');
      expect(script).not.toContain('HA_BROWSER_TOKEN');
      expect(script).toContain('runtime-config.cjs');
      expect(script).not.toContain('ha_token:');
    }
  });
});
