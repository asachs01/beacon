import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildSessionCookie,
  createSessionStore,
  hashToken,
  pairingSecretOk,
  readFamilyPins,
  requestIsSecure,
} from '../../lib/device-sessions.cjs';

describe('device sessions', () => {
  it('stores only the hash of a session token and can revoke it', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-sessions-'));
    const closed: string[] = [];
    const store = createSessionStore({ dataDir, onRevoke: (id: string) => closed.push(id) });
    const code = await store.load();
    expect(code).toMatch(/^\d{6}$/);

    const created = await store.createSession('Kitchen tablet');
    const raw = await readFile(store.filePath, 'utf8');
    expect(raw).not.toContain(created.token);
    expect(raw).toContain(hashToken(created.token));
    expect(store.verify(created.token)?.label).toBe('Kitchen tablet');
    expect(store.verify(created.token)?.kind).toBe('device');
    expect(store.list(created.session.id)[0].kind).toBe('device');
    expect(store.verify('not-the-token')).toBeNull();

    const access = await store.createSession('Home Assistant automations', { kind: 'token' });
    const withToken = await readFile(store.filePath, 'utf8');
    expect(withToken).not.toContain(access.token);
    expect(withToken).toContain(hashToken(access.token));
    expect(access.session.kind).toBe('token');
    expect(store.list(created.session.id).find((item: { id: string }) => item.id === access.session.id)?.kind).toBe('token');
    expect(await store.revoke(access.session.id)).toBe(true);
    expect(store.verify(access.token)).toBeNull();

    expect(await store.revoke(created.session.id)).toBe(true);
    expect(closed).toEqual([access.session.id, created.session.id]);
    expect(store.verify(created.token)).toBeNull();
    const after = await readFile(store.filePath, 'utf8');
    expect(after).not.toContain(created.token);
    expect(after).not.toContain(hashToken(created.token));
  });

  it('accepts a family PIN or the pairing code, not a guest PIN', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-pins-'));
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dataDir, 'beacon_family_members.json'), JSON.stringify([
      { name: 'Ada', pin: '1234' },
      { name: 'Ben', pin: '' },
    ]));
    const pins = await readFamilyPins(dataDir);
    const code = '042981';
    expect(pairingSecretOk('12-34', code, pins)).toBe(true);
    expect(pairingSecretOk(code, code, pins)).toBe(true);
    expect(pairingSecretOk('999999', code, pins)).toBe(false);
    expect(pairingSecretOk('', code, pins)).toBe(false);
    expect(pairingSecretOk('0000', code, pins)).toBe(false);
  });

  it('sets an httpOnly SameSite=Lax cookie and Secure only on https', () => {
    const cookie = buildSessionCookie('abc', { secure: false });
    expect(cookie).toContain('beacon_session=abc');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    expect(buildSessionCookie('abc', { secure: true })).toContain('Secure');

    expect(requestIsSecure({ socket: { encrypted: true }, headers: {} })).toBe(true);
    expect(requestIsSecure({ socket: {}, headers: { 'x-forwarded-proto': 'https' } })).toBe(true);
    expect(requestIsSecure({ socket: {}, headers: { 'x-forwarded-proto': 'http' } })).toBe(false);
  });
});
