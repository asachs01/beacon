import { useState, useEffect, useCallback } from 'react';
import {
  getSecureItem,
  setSecureItem,
  removeSecureItem,
  StorageKeys,
} from '../api/secure-storage';
import { getConfig, patchConfig } from '../config';

interface HaAuthState {
  /** Whether the user has completed onboarding */
  isOnboarded: boolean;
  /** The HA instance URL */
  haUrl: string;
  /** The long-lived access token entered during onboarding */
  haToken: string;
  /** Whether we're currently loading stored credentials */
  loading: boolean;
}

/**
 * Strip trailing slashes from a URL to keep storage consistent.
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/** The login onboarding saved on this device. */
async function readSavedLogin(): Promise<Omit<HaAuthState, 'loading'>> {
  const [onboarded, haUrl, haToken] = await Promise.all([
    getSecureItem(StorageKeys.ONBOARDED),
    getSecureItem(StorageKeys.HA_URL),
    getSecureItem(StorageKeys.HA_TOKEN),
  ]);
  return {
    isOnboarded: onboarded === 'true' && !!haToken,
    haUrl: haUrl ?? '',
    haToken: haToken ?? '',
  };
}

/**
 * Puts the login saved by onboarding into the config, where the HA client
 * and REST calls read it. Call before the app renders: onboarding reloads
 * the page once it has saved the login. Skipped when the add-on or the
 * build supplies the connection.
 */
export async function applySavedLogin(): Promise<void> {
  if (window.__BEACON_CONFIG__ || getConfig().ha_token) return;
  const { isOnboarded, haUrl, haToken } = await readSavedLogin();
  if (!isOnboarded) return;
  patchConfig(haUrl ? { ha_url: haUrl, ha_token: haToken } : { ha_token: haToken });
}

export function useHaAuth() {
  const [state, setState] = useState<HaAuthState>({
    isOnboarded: false,
    haUrl: '',
    haToken: '',
    loading: true,
  });

  // Load stored credentials on mount
  useEffect(() => {
    let cancelled = false;

    async function loadCredentials() {
      try {
        const saved = await readSavedLogin();
        if (cancelled) return;
        setState({ ...saved, loading: false });
      } catch (err) {
        console.error('useHaAuth: failed to load stored credentials', err);
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false }));
        }
      }
    }

    loadCredentials();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Save credentials from manual long-lived token entry.
   */
  const saveManualToken = useCallback(async (haUrl: string, token: string) => {
    const url = normalizeUrl(haUrl);

    await Promise.all([
      setSecureItem(StorageKeys.HA_URL, url),
      setSecureItem(StorageKeys.HA_TOKEN, token),
      setSecureItem(StorageKeys.ONBOARDED, 'true'),
    ]);

    setState({
      isOnboarded: true,
      haUrl: url,
      haToken: token,
      loading: false,
    });
  }, []);

  /**
   * Clear all stored credentials and reset state.
   */
  const logout = useCallback(async () => {
    await Promise.all([
      removeSecureItem(StorageKeys.HA_URL),
      removeSecureItem(StorageKeys.HA_TOKEN),
      removeSecureItem(StorageKeys.ONBOARDED),
    ]);

    setState({
      isOnboarded: false,
      haUrl: '',
      haToken: '',
      loading: false,
    });
  }, []);

  return {
    state,
    saveManualToken,
    logout,
  };
}
