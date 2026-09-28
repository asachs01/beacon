/**
 * Kid Display (focus mode) resolution.
 *
 * A display is locked to one family member either by URL param
 * (?display=<memberId>, wins — survives kiosk-browser reboots) or by a
 * device-local localStorage key.
 *
 * Deliberately NOT part of BeaconSettings: settings sync across devices
 * via beacon-store, and the display assignment must stay per-device.
 */

const FOCUS_STORAGE_KEY = 'beacon_display_member';
const FOCUS_URL_PARAM = 'display';

export function getFocusMemberId(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get(FOCUS_URL_PARAM);
  if (fromUrl) return fromUrl;
  try {
    return localStorage.getItem(FOCUS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setDeviceFocusMember(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(FOCUS_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(FOCUS_STORAGE_KEY);
    }
  } catch {
    /* localStorage unavailable */
  }
}

export function clearFocusMode(): void {
  setDeviceFocusMember(null);
  const url = new URL(window.location.href);
  if (url.searchParams.has(FOCUS_URL_PARAM)) {
    url.searchParams.delete(FOCUS_URL_PARAM);
    window.history.replaceState({}, '', url);
  }
}

import { getConfig } from './config';

export function buildFocusUrl(memberId: string): string {
  const { addon_slug } = getConfig();

  // In add-on/ingress mode, window.location.href embeds the CURRENT
  // session's ephemeral ingress token (/api/hassio_ingress/<token>/...).
  // That token is not a stable, shareable address — copying it and opening
  // it later (or on another device/session) 401s once the token rotates.
  // /hassio/ingress/<slug> is HA's own stable redirect path: it resolves
  // to a fresh, valid ingress session for whoever opens it, using their
  // own current login, rather than a specific baked-in token.
  if (addon_slug) {
    const url = new URL(`/hassio/ingress/${addon_slug}`, window.location.origin);
    url.searchParams.set(FOCUS_URL_PARAM, memberId);
    return url.toString();
  }

  // Without the slug, an ingress URL contains a per-session capability.
  // Never copy it, even if the user arrived through an older ingress path.
  if (/(?:^|\/)(?:hassio_ingress|ingress)\//.test(window.location.pathname)) {
    throw new Error('Cannot share Kid Display until the add-on slug is available. Restart the add-on.');
  }

  // Standalone/dev mode: do not carry any query, fragment, or credentials
  // from the current address into a URL that will be shared.
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set(FOCUS_URL_PARAM, memberId);
  return url.toString();
}
