import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage';

/**
 * Storage keys used throughout the Beacon app.
 */
export const StorageKeys = {
  HA_URL: 'beacon_ha_url',
  HA_TOKEN: 'beacon_ha_token',
  ONBOARDED: 'beacon_onboarded',
} as const;

/*
 * On native platforms values go to the iOS Keychain, or on Android are
 * encrypted with a Keystore key; neither leaves the device in a backup
 * (the Keychain items are "this device only"; Android's backup rules are in
 * android/app/src/main/res/xml). Earlier builds kept them in Capacitor
 * Preferences — UserDefaults and SharedPreferences, which Android backs up
 * — and a value still there is moved over the first time it's read.
 * The web has nothing better than localStorage.
 */

const isNative = Capacitor.isNativePlatform();

// setItem stores with the default access; not the plugin's "when unlocked",
// which also goes into iCloud and encrypted iTunes backups.
const keychainReady = isNative
  ? SecureStorage.setDefaultKeychainAccess(KeychainAccess.afterFirstUnlockThisDeviceOnly)
  : Promise.resolve();

/**
 * Retrieve a value by key: from secure storage on native platforms,
 * localStorage on the web.
 */
export async function getSecureItem(key: string): Promise<string | null> {
  if (!isNative) return localStorage.getItem(key);
  await keychainReady;
  const value = await SecureStorage.getItem(key);
  if (value !== null) return value;

  const { value: saved } = await Preferences.get({ key });
  if (saved === null) return null;
  await SecureStorage.setItem(key, saved);
  await Preferences.remove({ key });
  return saved;
}

/**
 * Store a key/value pair: in secure storage on native platforms,
 * localStorage on the web.
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
  if (!isNative) {
    localStorage.setItem(key, value);
    return;
  }
  await keychainReady;
  await SecureStorage.setItem(key, value);
  await Preferences.remove({ key });
}

/**
 * Remove a stored value by key, including any copy an earlier build left
 * in Preferences.
 */
export async function removeSecureItem(key: string): Promise<void> {
  if (!isNative) {
    localStorage.removeItem(key);
    return;
  }
  await SecureStorage.removeItem(key);
  await Preferences.remove({ key });
}
