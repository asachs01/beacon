import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  getSecureItem,
  setSecureItem,
  removeSecureItem,
  StorageKeys,
} from '../api/secure-storage';

interface HaAuthState {
  /** Whether the user has completed onboarding */
  isOnboarded: boolean;
  /** The HA instance URL */
  haUrl: string;
  /** The current access token (short-lived from OAuth, or long-lived manual token) */
  haToken: string;
  /** Whether we're currently loading stored credentials */
  loading: boolean;
}

/**
 * Build the correct redirect URI for the current platform.
 * Native apps use a custom URL scheme; web uses the current origin.
 */
function getRedirectUri(): string {
  if (Capacitor.isNativePlatform()) {
    return 'beacon://auth/callback';
  }
  return `${window.location.origin}/auth/callback`;
}

/**
 * The client_id for HA OAuth2 is the application origin URL.
 */
function getClientId(): string {
  if (Capacitor.isNativePlatform()) {
    return 'beacon://';
  }
  return window.location.origin;
}

/**
 * Strip trailing slashes from a URL to keep storage consistent.
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
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
        const [onboarded, haUrl, haToken] = await Promise.all([
          getSecureItem(StorageKeys.ONBOARDED),
          getSecureItem(StorageKeys.HA_URL),
          getSecureItem(StorageKeys.HA_TOKEN),
        ]);

        if (cancelled) return;

        // Onboarded is true if the flag is set — token is optional (standalone mode)
        const isOnboarded = onboarded === 'true';

        setState({
          isOnboarded,
          haUrl: haUrl ?? '',
          haToken: haToken ?? '',
          loading: false,
        });
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
      // Clear any stale refresh token from a prior OAuth session
      removeSecureItem(StorageKeys.HA_REFRESH_TOKEN),
    ]);

    setState({
      isOnboarded: true,
      haUrl: url,
      haToken: token,
      loading: false,
    });
  }, []);

  /**
   * Start the OAuth2 authorization flow by opening the HA auth page.
   * Persists the HA URL so we can use it when the callback arrives.
   */
  const startOAuth = useCallback((haUrl: string) => {
    const url = normalizeUrl(haUrl);
    const clientId = getClientId();
    const redirectUri = getRedirectUri();

    // Persist the URL before navigating away so handleOAuthCallback can read it
    setSecureItem(StorageKeys.HA_URL, url);

    const authUrl =
      `${url}/auth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code`;

    window.location.href = authUrl;
  }, []);

  /**
   * Exchange an authorization code for access + refresh tokens.
   */
  const handleOAuthCallback = useCallback(async (code: string) => {
    const haUrl = (await getSecureItem(StorageKeys.HA_URL)) ?? '';
    if (!haUrl) {
      throw new Error('useHaAuth: no HA URL stored — cannot exchange code');
    }

    const clientId = getClientId();
    const tokenUrl = `${haUrl}/auth/token`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    const { access_token, refresh_token } = data as {
      access_token: string;
      refresh_token: string;
    };

    await Promise.all([
      setSecureItem(StorageKeys.HA_TOKEN, access_token),
      setSecureItem(StorageKeys.HA_REFRESH_TOKEN, refresh_token),
      setSecureItem(StorageKeys.ONBOARDED, 'true'),
    ]);

    setState({
      isOnboarded: true,
      haUrl,
      haToken: access_token,
      loading: false,
    });
  }, []);

  /**
   * Use the stored refresh token to obtain a new access token.
   * Returns the new access token, or null if refresh fails.
   */
  const refreshToken = useCallback(async (): Promise<string | null> => {
    const [haUrl, storedRefresh] = await Promise.all([
      getSecureItem(StorageKeys.HA_URL),
      getSecureItem(StorageKeys.HA_REFRESH_TOKEN),
    ]);

    if (!haUrl || !storedRefresh) {
      console.warn('useHaAuth: missing URL or refresh token — cannot refresh');
      return null;
    }

    const clientId = getClientId();
    const tokenUrl = `${haUrl}/auth/token`;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: storedRefresh,
      client_id: clientId,
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        console.error('useHaAuth: token refresh failed', response.status);
        return null;
      }

      const data = await response.json();
      const { access_token } = data as { access_token: string };

      await setSecureItem(StorageKeys.HA_TOKEN, access_token);

      setState((prev) => ({ ...prev, haToken: access_token }));

      return access_token;
    } catch (err) {
      console.error('useHaAuth: token refresh error', err);
      return null;
    }
  }, []);

  /**
   * Mark the user as onboarded without HA credentials (standalone mode).
   */
  const markOnboarded = useCallback(async () => {
    await setSecureItem(StorageKeys.ONBOARDED, 'true');
    setState((prev) => ({ ...prev, isOnboarded: true }));
  }, []);

  /**
   * Clear all stored credentials and reset state.
   */
  const logout = useCallback(async () => {
    await Promise.all([
      removeSecureItem(StorageKeys.HA_URL),
      removeSecureItem(StorageKeys.HA_TOKEN),
      removeSecureItem(StorageKeys.HA_REFRESH_TOKEN),
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
    markOnboarded,
    startOAuth,
    handleOAuthCallback,
    refreshToken,
    logout,
  };
}
