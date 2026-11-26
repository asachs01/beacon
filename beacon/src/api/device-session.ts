/**
 * Beacon device session for native shells.
 *
 * Browsers keep the session in an httpOnly cookie set by POST /beacon-auth/pair.
 * Capacitor webviews do not always keep that cookie, so the pair response
 * also returns the token. Native code stores it with Capacitor Preferences
 * (`beacon_device_session`) and sends it as `Authorization: Bearer` on fetch
 * and as the `session` query on Beacon websockets and same-origin media URLs
 * (image tags cannot set a header). The web app does not put the token in
 * localStorage.
 *
 * Manual test (iOS or Android):
 * 1. Open the Beacon server URL in the Capacitor shell.
 * 2. Pair with a family PIN or the 6-digit code from the add-on log.
 * 3. Force-quit the app and reopen it. The dashboard should load without
 *    asking to pair again.
 * 4. In Settings → Devices, revoke that device. The next request should
 *    return to the pairing screen, including a websocket that was open.
 */

import { Capacitor } from '@capacitor/core';
import { getSecureItem, removeSecureItem, setSecureItem } from './secure-storage';

export const DEVICE_SESSION_KEY = 'beacon_device_session';
export const PAIRING_REQUIRED_EVENT = 'beacon-pairing-required';

let memoryToken: string | null = null;
let fetchInstalled = false;

export function getDeviceSessionToken(): string | null {
  return memoryToken;
}

export function setDeviceSessionToken(token: string | null): void {
  memoryToken = token;
}

export async function loadDeviceSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  memoryToken = await getSecureItem(DEVICE_SESSION_KEY);
}

export async function saveDeviceSession(token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  memoryToken = token;
  await setSecureItem(DEVICE_SESSION_KEY, token);
}

export async function clearDeviceSession(): Promise<void> {
  memoryToken = null;
  if (Capacitor.isNativePlatform()) {
    await removeSecureItem(DEVICE_SESSION_KEY);
  }
}

/** Attach the native session token to a Beacon URL. Other hosts are unchanged. */
export function withDeviceSession(url: string): string {
  const token = memoryToken;
  if (!token || !url) return url;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    try {
      const parsed = new URL(url);
      const beaconPath = parsed.pathname.endsWith('/beacon-ws/ha');
      const sameHost = typeof window !== 'undefined' && parsed.host === window.location.host;
      if (!beaconPath && !sameHost) return url;
      parsed.searchParams.set('session', token);
      return parsed.toString();
    } catch {
      return url;
    }
  }
  const [base, hash = ''] = url.split('#');
  const join = base.includes('?') ? '&' : '?';
  const next = `${base}${join}session=${encodeURIComponent(token)}`;
  return hash ? `${next}#${hash}` : next;
}

export function installDeviceSessionFetch(): void {
  if (fetchInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  fetchInstalled = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (memoryToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${memoryToken}`);
    }
    const response = await original(input, { ...init, headers });
    if (response.status === 401) {
      void response.clone().json().then((body) => {
        if (body && body.error === 'pairing_required') {
          window.dispatchEvent(new CustomEvent(PAIRING_REQUIRED_EVENT));
        }
      }).catch(() => { /* not JSON */ });
    }
    return response;
  };
}
