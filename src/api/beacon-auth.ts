import { getIngressBasePath } from '../utils/ha-env';

export type BeaconSession =
  | { role: 'none'; requiresPin?: boolean }
  | { role: 'parent' }
  | { role: 'display'; memberId: string };

function parseSession(value: unknown): BeaconSession {
  if (value && typeof value === 'object' && 'role' in value) {
    const session = value as Record<string, unknown>;
    if (session.role === 'none') return { role: 'none', requiresPin: session.requiresPin === true };
    if (session.role === 'parent') return { role: 'parent' };
    if (session.role === 'display' && typeof session.memberId === 'string') {
      return { role: 'display', memberId: session.memberId };
    }
  }
  throw new Error('Invalid authorization response from Family server');
}

async function request(path: string, body?: object): Promise<unknown> {
  const res = await fetch(`${getIngressBasePath()}${path}`, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  } : undefined);
  const payload: unknown = await res.json();
  if (!res.ok) {
    const detail = payload && typeof payload === 'object' && 'error' in payload
      ? String(payload.error)
      : `Authorization request failed (${res.status})`;
    throw new Error(detail);
  }
  return payload;
}

export async function getBeaconSession(displayId?: string | null): Promise<BeaconSession> {
  const query = displayId ? `?display=${encodeURIComponent(displayId)}` : '';
  return parseSession(await request(`/beacon-auth/session${query}`));
}

export async function unlockParent(pin: string, memberId?: string): Promise<BeaconSession> {
  return parseSession(await request('/beacon-auth/parent', { pin, ...(memberId ? { member_id: memberId } : {}) }));
}

export async function unlockDisplay(pin: string, memberId: string): Promise<BeaconSession> {
  return parseSession(await request('/beacon-auth/child', { pin, member_id: memberId }));
}

export async function enterDisplay(memberId: string): Promise<BeaconSession> {
  return parseSession(await request('/beacon-auth/display', { member_id: memberId }));
}

export async function getParentPinMembers(): Promise<Array<{ id: string; name: string }>> {
  const value = await request('/beacon-auth/parents');
  if (!Array.isArray(value) || !value.every((item) =>
    item && typeof item.id === 'string' && typeof item.name === 'string')) {
    throw new Error('Invalid parent list from Family server');
  }
  return value;
}

export function clearSensitiveCache(): void {
  for (const key of Object.keys(localStorage)) {
    if ((key.startsWith('beacon_') || key.startsWith('beacon-')) && key !== 'beacon_display_member') {
      localStorage.removeItem(key);
    }
  }
}
