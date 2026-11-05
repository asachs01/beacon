import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getHaResourceUrl } from '../api/ha-rest';
import { isAddOn, usesServerProxy } from './ha-env';

const originalRuntimeConfig = window.__BEACON_CONFIG__;

describe('deployment mode detection', () => {
  beforeEach(() => {
    delete window.__BEACON_CONFIG__;
  });

  afterEach(() => {
    window.__BEACON_CONFIG__ = originalRuntimeConfig;
  });

  it('uses direct HA access when no runtime config is injected', () => {
    expect(isAddOn()).toBe(false);
    expect(usesServerProxy()).toBe(false);
  });

  it('keeps add-on mode on the server proxy', () => {
    window.__BEACON_CONFIG__ = { deployment_mode: 'addon' };

    expect(isAddOn()).toBe(true);
    expect(usesServerProxy()).toBe(true);
  });

  it('uses the server proxy without treating standalone Docker as an add-on', () => {
    window.__BEACON_CONFIG__ = { deployment_mode: 'standalone' };

    expect(isAddOn()).toBe(false);
    expect(usesServerProxy()).toBe(true);
  });

  it('routes relative HA resources through the same-origin server proxy', () => {
    window.__BEACON_CONFIG__ = {
      deployment_mode: 'standalone',
      ha_url: 'http://homeassistant:8123',
    };

    expect(getHaResourceUrl('/api/media_player_proxy/music')).toBe('/api/media_player_proxy/music');
  });

  it('leaves absolute external resources unchanged', () => {
    window.__BEACON_CONFIG__ = { deployment_mode: 'standalone' };

    expect(getHaResourceUrl('https://cdn.example.com/cover.jpg')).toBe(
      'https://cdn.example.com/cover.jpg',
    );
  });

  it('keeps older injected add-on configs compatible', () => {
    window.__BEACON_CONFIG__ = {};

    expect(isAddOn()).toBe(true);
    expect(usesServerProxy()).toBe(true);
  });
});
