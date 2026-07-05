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

export function buildFocusUrl(memberId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(FOCUS_URL_PARAM, memberId);
  return url.toString();
}
