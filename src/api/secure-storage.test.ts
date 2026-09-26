import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * The native path, with in-memory stand-ins for the secure storage plugin
 * (Keychain / Keystore) and Capacitor Preferences.
 */
const native = vi.hoisted(() => ({
  secure: new Map<string, { value: string; access: number }>(),
  prefs: new Map<string, string>(),
  access: 0,
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: native.prefs.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { native.prefs.set(key, value); },
    remove: async ({ key }: { key: string }) => { native.prefs.delete(key); },
  },
}));
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  KeychainAccess: { whenUnlocked: 0, afterFirstUnlockThisDeviceOnly: 3 },
  SecureStorage: {
    setDefaultKeychainAccess: async (access: number) => { native.access = access; },
    getItem: async (key: string) => native.secure.get(key)?.value ?? null,
    setItem: async (key: string, value: string) => { native.secure.set(key, { value, access: native.access }); },
    removeItem: async (key: string) => { native.secure.delete(key); },
  },
}));

import { getSecureItem, setSecureItem, removeSecureItem, StorageKeys } from './secure-storage';

const THIS_DEVICE_ONLY = 3;

beforeEach(() => {
  native.secure.clear();
  native.prefs.clear();
});

describe('secure storage on native platforms', () => {
  // Earlier builds kept the login in Preferences, which Android backs up.
  it('moves a login saved by an earlier build out of Preferences', async () => {
    native.prefs.set(StorageKeys.HA_TOKEN, 'old-token');

    expect(await getSecureItem(StorageKeys.HA_TOKEN)).toBe('old-token');
    expect(native.secure.get(StorageKeys.HA_TOKEN)).toEqual({ value: 'old-token', access: THIS_DEVICE_ONLY });
    expect(native.prefs.has(StorageKeys.HA_TOKEN)).toBe(false);
    expect(await getSecureItem(StorageKeys.HA_TOKEN)).toBe('old-token');
  });

  it('saves to this device only, dropping any copy left in Preferences', async () => {
    native.prefs.set(StorageKeys.HA_TOKEN, 'old-token');

    await setSecureItem(StorageKeys.HA_TOKEN, 'new-token');

    expect(native.secure.get(StorageKeys.HA_TOKEN)).toEqual({ value: 'new-token', access: THIS_DEVICE_ONLY });
    expect(native.prefs.size).toBe(0);
  });

  it('removes both copies', async () => {
    native.prefs.set(StorageKeys.HA_URL, 'http://old.local');
    await setSecureItem(StorageKeys.HA_URL, 'http://ha.local:8123');
    native.prefs.set(StorageKeys.HA_URL, 'http://old.local');

    await removeSecureItem(StorageKeys.HA_URL);

    expect(await getSecureItem(StorageKeys.HA_URL)).toBeNull();
  });
});
