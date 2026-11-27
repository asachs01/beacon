import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfig, resetRuntimeConfigCache } from '../config';
import { applyStoredTheme } from '../hooks/useTheme';
import { getTheme } from '../styles/themes';
import { loadProtectedRuntimeConfig } from './runtime-config';

const FULL = {
  ha_url: 'http://192.168.1.50:8123',
  family_name: 'Adams',
  save_config_in_browser: false,
  theme: 'midnight',
  auto_dark_mode: false,
  weather_entity: 'weather.kitchen',
  photo_directory: '/media/beacon/vacation',
  photo_interval: 45,
  screen_saver_timeout: 12,
  ha_token: 'do-not-merge-this-token',
};

afterEach(() => {
  resetRuntimeConfigCache();
  delete window.__BEACON_CONFIG__;
  document.documentElement.removeAttribute('style');
  vi.unstubAllGlobals();
});

function stubJson(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })));
}

describe('protected runtime config merge', () => {
  it('merges the protected payload over the public script and drops any token', async () => {
    window.__BEACON_CONFIG__ = {
      family_name: 'Adams',
      theme: 'midnight',
      auto_dark_mode: false,
    };
    expect(getConfig().weather_entity).toBe('weather.home');
    expect(getConfig().ha_url).toBe('');
    resetRuntimeConfigCache();

    stubJson(200, FULL);
    await expect(loadProtectedRuntimeConfig()).resolves.toBe(true);

    const config = getConfig();
    expect(config.ha_url).toBe(FULL.ha_url);
    expect(config.family_name).toBe('Adams');
    expect(config.save_config_in_browser).toBe(false);
    expect(config.theme).toBe('midnight');
    expect(config.auto_dark_mode).toBe(false);
    expect(config.weather_entity).toBe('weather.kitchen');
    expect(config.photo_directory).toBe('/media/beacon/vacation');
    expect(config.photo_interval).toBe(45);
    expect(config.screen_saver_timeout).toBe(12);
    expect(config.ha_token).toBe('');
    expect(window.__BEACON_CONFIG__).not.toHaveProperty('ha_token');
    expect(window.__BEACON_CONFIG__?.weather_entity).toBe('weather.kitchen');
    expect(fetch).toHaveBeenCalledWith('/beacon-api/runtime-config', { cache: 'no-store' });
  });

  it('keeps public defaults when the endpoint is unpaired', async () => {
    window.__BEACON_CONFIG__ = { family_name: 'Adams', theme: 'midnight', auto_dark_mode: true };
    stubJson(401, { error: 'pairing_required' });

    await expect(loadProtectedRuntimeConfig()).resolves.toBe(false);

    const config = getConfig();
    expect(config.family_name).toBe('Adams');
    expect(config.theme).toBe('midnight');
    expect(config.auto_dark_mode).toBe(true);
    expect(config.weather_entity).toBe('weather.home');
    expect(config.photo_directory).toBe('/media/beacon/photos');
    expect(config.photo_interval).toBe(30);
    expect(config.screen_saver_timeout).toBe(5);
    expect(config.ha_url).toBe('');
    expect(config.save_config_in_browser).toBe(true);
  });

  it('keeps defaults when the fetch fails and does not reject', async () => {
    window.__BEACON_CONFIG__ = { family_name: 'Adams', theme: 'skylight', auto_dark_mode: true };
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    await expect(loadProtectedRuntimeConfig()).resolves.toBe(false);
    expect(getConfig().family_name).toBe('Adams');
    expect(getConfig().weather_entity).toBe('weather.home');
    expect(getConfig().ha_url).toBe('');
  });

  it('applies the public theme before a device has saved one', () => {
    window.__BEACON_CONFIG__ = { theme: 'midnight', family_name: 'Adams', auto_dark_mode: true };
    applyStoredTheme();
    expect(document.documentElement.style.getPropertyValue('--bg-primary'))
      .toBe(getTheme('midnight').colors.background);
  });
});
