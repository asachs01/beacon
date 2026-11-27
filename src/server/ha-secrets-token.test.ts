import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSessionStore } from '../../lib/device-sessions.cjs';
import {
  INSTALLER_TOKEN_LABEL,
  ensureBeaconToken,
  hasBeaconTokenKey,
} from '../../lib/ha-secrets-token.cjs';

async function storeIn(dir: string) {
  const store = createSessionStore({ dataDir: dir });
  await store.load();
  return store;
}

describe('Home Assistant beacon_token secret', () => {
  it('ignores comments and indented keys', () => {
    expect(hasBeaconTokenKey('# beacon_token: "Bearer no"\n')).toBe(false);
    expect(hasBeaconTokenKey('nested:\n  beacon_token: "Bearer no"\n')).toBe(false);
    expect(hasBeaconTokenKey('beacon_token_backup: "Bearer no"\n')).toBe(false);
    expect(hasBeaconTokenKey('beacon_token: "Bearer yes"\n')).toBe(true);
    expect(hasBeaconTokenKey('"beacon_token": "Bearer yes"\n')).toBe(true);
  });

  it('mints once when the key is absent and preserves other keys', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'beacon-secrets-'));
    const store = await storeIn(dir);
    const secretsPath = join(dir, 'secrets.yaml');
    await writeFile(secretsPath, 'http_password: keep-me\n# beacon_token: "Bearer comment"\n');
    let mints = 0;
    const createToken = async (label: string) => {
      mints += 1;
      expect(label).toBe(INSTALLER_TOKEN_LABEL);
      return store.createSession(label, { kind: 'token' });
    };

    expect(await ensureBeaconToken({
      secretsPath,
      createToken,
      revokeToken: (id: string) => store.revoke(id),
    })).toEqual({ added: true });
    expect(mints).toBe(1);

    const written = await readFile(secretsPath, 'utf8');
    expect(written.startsWith('http_password: keep-me\n# beacon_token: "Bearer comment"\n')).toBe(true);
    expect(written.endsWith('\n')).toBe(true);
    const match = /^beacon_token: "Bearer ([^"]+)"$/m.exec(written);
    expect(match).toBeTruthy();
    const token = match?.[1] || '';
    expect(store.verify(token)?.kind).toBe('token');
    expect(store.verify(token)?.label).toBe(INSTALLER_TOKEN_LABEL);
    expect(store.list('').filter((item: { kind: string }) => item.kind === 'token')).toHaveLength(1);

    expect(await ensureBeaconToken({
      secretsPath,
      createToken,
      revokeToken: (id: string) => store.revoke(id),
    })).toEqual({ added: false });
    expect(mints).toBe(1);
    expect(await readFile(secretsPath, 'utf8')).toBe(written);
    expect(store.list('').filter((item: { kind: string }) => item.kind === 'token')).toHaveLength(1);
  });

  it('does not mint or rewrite the file when beacon_token is already set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'beacon-secrets-keep-'));
    const secretsPath = join(dir, 'secrets.yaml');
    const original = 'other: stay\nbeacon_token: "Bearer existing-value"\n';
    await writeFile(secretsPath, original);
    const createToken = vi.fn();
    expect(await ensureBeaconToken({ secretsPath, createToken })).toEqual({ added: false });
    expect(createToken).not.toHaveBeenCalled();
    expect(await readFile(secretsPath, 'utf8')).toBe(original);
  });

  it('creates a missing secrets file as mode 0600', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'beacon-secrets-new-'));
    const store = await storeIn(dir);
    const secretsPath = join(dir, 'secrets.yaml');
    expect(await ensureBeaconToken({
      secretsPath,
      createToken: (label: string) => store.createSession(label, { kind: 'token' }),
      revokeToken: (id: string) => store.revoke(id),
    })).toEqual({ added: true });
    expect((await stat(secretsPath)).mode & 0o777).toBe(0o600);
    const written = await readFile(secretsPath, 'utf8');
    expect(written.startsWith('beacon_token: "Bearer ')).toBe(true);
    expect(written.endsWith('\n')).toBe(true);
  });

  it('does nothing when the Home Assistant config directory is missing', async () => {
    const createToken = vi.fn();
    const missing = join(tmpdir(), 'beacon-no-such-config-dir', 'secrets.yaml');
    expect(await ensureBeaconToken({ secretsPath: missing, createToken })).toEqual({ added: false });
    expect(createToken).not.toHaveBeenCalled();
  });
});
