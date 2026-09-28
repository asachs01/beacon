import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const clients: string[][] = [];
vi.mock('../api/homeassistant', () => ({
  HomeAssistantClient: class {
    constructor(url: string, token: string) { clients.push([url, token]); }
    setConnectionChangeHandler() {}
    connect() { return Promise.resolve(); }
    disconnect() {}
  },
}));

/** Fresh modules, as after onboarding reloads the page. */
async function reload() {
  vi.resetModules();
  const { getConfig } = await import('../config');
  const { applySavedLogin } = await import('./useHaAuth');
  const { useHomeAssistant } = await import('./useHomeAssistant');
  return { getConfig, applySavedLogin, useHomeAssistant };
}

function saveLogin({ onboarded = true } = {}) {
  localStorage.setItem('beacon_ha_url', 'http://ha.local:8123');
  localStorage.setItem('beacon_ha_token', 'saved-token');
  if (onboarded) localStorage.setItem('beacon_onboarded', 'true');
}

beforeEach(() => {
  clients.length = 0;
});

afterEach(() => {
  delete window.__BEACON_CONFIG__;
  localStorage.removeItem('beacon_family_members');
});

describe('applySavedLogin', () => {
  // Onboarding saved the login and reloaded, but the HA client read only
  // the config: the app skipped onboarding and stayed in demo mode.
  it('connects the HA client with the login onboarding saved', async () => {
    saveLogin();
    const { getConfig, applySavedLogin, useHomeAssistant } = await reload();
    const readBeforehand = getConfig(); // as App.tsx does when it loads

    await applySavedLogin();
    renderHook(() => useHomeAssistant());

    await waitFor(() => expect(clients).toEqual([['http://ha.local:8123', 'saved-token']]));
    expect(readBeforehand).toMatchObject({ ha_url: 'http://ha.local:8123', ha_token: 'saved-token' });
  });

  it("leaves the server's connection alone and removes an obsolete browser token", async () => {
    saveLogin();
    localStorage.setItem('beacon_family_members', '[{"id":"kai","pin":"1234"}]');
    window.__BEACON_CONFIG__ = { ha_url: '', ha_token: '' };
    const { getConfig, applySavedLogin } = await reload();

    await applySavedLogin();

    expect(getConfig()).toMatchObject({ ha_url: '', ha_token: '' });
    expect(localStorage.getItem('beacon_ha_token')).toBeNull();
    expect(localStorage.getItem('beacon_family_members')).toBeNull();
  });

  it('does not claim an HA connection when the server is local-only', async () => {
    window.__BEACON_CONFIG__ = { ha_url: '', ha_token: '', ha_available: false };
    const { applySavedLogin, useHomeAssistant } = await reload();
    await applySavedLogin();
    const { result } = renderHook(() => useHomeAssistant());
    expect(result.current.connected).toBe(false);
    expect(clients).toEqual([]);
  });

  it("ignores a token when onboarding didn't finish", async () => {
    saveLogin({ onboarded: false });
    const { getConfig, applySavedLogin } = await reload();

    await applySavedLogin();

    expect(getConfig().ha_token).toBe('');
  });
});
