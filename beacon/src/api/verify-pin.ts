/**
 * Ask Beacon whether a family PIN is valid.
 * A network error, HTTP 5xx, or an 8 second timeout fails closed.
 * There is no on-device comparison to fall back to.
 */
import { getIngressBasePath } from '../utils/ha-env';

export const VERIFY_PIN_TIMEOUT_MS = 8000;

export type VerifyPinResult =
  | { status: 'accepted'; memberId?: string }
  | { status: 'rejected' }
  | { status: 'unreachable' }
  | { status: 'locked' };

export async function verifyFamilyPin(pin: string, memberId?: string): Promise<VerifyPinResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_PIN_TIMEOUT_MS);
  try {
    const base = getIngressBasePath();
    const body: { pin: string; memberId?: string } = { pin };
    if (memberId) body.memberId = memberId;
    const res = await fetch(`${base}/beacon-auth/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 429) return { status: 'locked' };
    if (!res.ok) return { status: 'unreachable' };
    const data = await res.json().catch(() => null) as { ok?: boolean; memberId?: unknown } | null;
    if (data && data.ok === true) {
      return {
        status: 'accepted',
        memberId: typeof data.memberId === 'string' ? data.memberId : undefined,
      };
    }
    return { status: 'rejected' };
  } catch {
    return { status: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
