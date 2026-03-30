// NOTE: On web, tokens are stored in localStorage (not encrypted). Only native platforms use secure storage.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Storage keys used throughout the Beacon app.
 */
export const StorageKeys = {
  HA_URL: 'beacon_ha_url',
  HA_TOKEN: 'beacon_ha_token',
  HA_REFRESH_TOKEN: 'beacon_ha_refresh_token',
  ONBOARDED: 'beacon_onboarded',
} as const;

const isNative = Capacitor.isNativePlatform();

/**
 * Retrieve a value by key. Uses Capacitor Preferences on native
 * platforms and localStorage on the web.
 */
export async function getSecureItem(key: string): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    return value;
  }
  return localStorage.getItem(key);
}

/**
 * Store a key/value pair. Uses Capacitor Preferences on native
 * platforms and localStorage on the web.
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key, value });
  } else {
    localStorage.setItem(key, value);
  }
}

/**
 * Remove a stored value by key. Uses Capacitor Preferences on native
 * platforms and localStorage on the web.
 */
export async function removeSecureItem(key: string): Promise<void> {
  if (isNative) {
    await Preferences.remove({ key });
  } else {
    localStorage.removeItem(key);
  }
}
