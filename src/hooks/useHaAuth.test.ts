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

  it("leaves the add-on's connection alone", async () => {
    saveLogin();
    window.__BEACON_CONFIG__ = { ha_url: '', ha_token: '' };
    const { getConfig, applySavedLogin } = await reload();

    await applySavedLogin();

    expect(getConfig()).toMatchObject({ ha_url: '', ha_token: '' });
  });

  it("ignores a token when onboarding didn't finish", async () => {
    saveLogin({ onboarded: false });
    const { getConfig, applySavedLogin } = await reload();

    await applySavedLogin();

    expect(getConfig().ha_token).toBe('');
  });
});
