import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  hashPin,
  mergeFamilyMembers,
  migrateFamilyPins,
  parsePinHash,
  toPublicMembers,
  verifyFamilyPin,
  verifyPinHash,
} from '../../lib/family-pins.cjs';

describe('family PIN hashes', () => {
  it('stores scrypt$N$r$p$salt$hash and verifies with a new salt each time', async () => {
    const hash = await hashPin('12-34');
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/);
    expect(hash).not.toContain('1234');
    const parsed = parsePinHash(hash);
    expect(parsed.salt.length).toBe(16);
    expect(parsed.hash.length).toBe(32);
    expect(await verifyPinHash('1234', hash)).toBe(true);
    expect(await verifyPinHash('0000', hash)).toBe(false);
    expect(await verifyPinHash('', hash)).toBe(false);
    const again = await hashPin('1234');
    expect(again).not.toBe(hash);
    expect(await verifyPinHash('1234', again)).toBe(true);
  });

  it('rejects a hash that is not the configured scrypt parameters', async () => {
    expect(await verifyPinHash('1234', 'scrypt$2$1$1$c2FsdA==$aGFzaA==')).toBe(false);
    expect(await verifyPinHash('1234', 'not-a-hash')).toBe(false);
  });
});

describe('family PIN migration', () => {
  it('replaces plaintext pins with hashes and leaves other fields alone', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-pin-migrate-'));
    const file = join(dataDir, 'beacon_family_members.json');
    const original = [
      { id: 'ada', name: 'Ada', color: '#3b82f6', role: 'parent', pin: '12-34', avatar: '👩' },
      { id: 'ben', name: 'Ben', role: 'child', pin: '', calendar_entity: 'calendar.ben' },
      { id: 'cam', name: 'Cam', role: 'child', pinHash: 'scrypt$16384$8$1$already$already' },
    ];
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, JSON.stringify(original));
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((message) => {
      logs.push(String(message));
    });
    try {
      expect(await migrateFamilyPins(dataDir)).toBe(1);
      expect(logs).toEqual(['[beacon] migrated 1 family PINs']);
      expect(logs.join('\n')).not.toContain('1234');
      const stored = JSON.parse(await readFile(file, 'utf8'));
      expect(stored[0]).toMatchObject({ id: 'ada', name: 'Ada', color: '#3b82f6', role: 'parent', avatar: '👩' });
      expect(stored[0].pin).toBeUndefined();
      expect(await verifyPinHash('1234', stored[0].pinHash)).toBe(true);
      expect(stored[1]).toEqual({ id: 'ben', name: 'Ben', role: 'child', calendar_entity: 'calendar.ben' });
      expect(stored[2].pinHash).toBe('scrypt$16384$8$1$already$already');
      const mode = (await stat(file)).mode & 0o777;
      expect(mode & 0o077).toBe(0);

      expect(await migrateFamilyPins(dataDir)).toBe(0);
      const second = JSON.parse(await readFile(file, 'utf8'));
      expect(second).toEqual(stored);
    } finally {
      spy.mockRestore();
    }
  });

  it('is a no-op when the file is missing or already hashed', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-pin-empty-'));
    expect(await migrateFamilyPins(dataDir)).toBe(0);
  });
});

describe('family member reads and writes', () => {
  it('never returns pin or pinHash and reports hasPin', async () => {
    const hash = await hashPin('5555');
    const pub = toPublicMembers([
      { id: 'ada', name: 'Ada', pin: '5555', pinHash: hash, color: '#fff' },
      { id: 'ben', name: 'Ben' },
    ]);
    expect(JSON.stringify(pub)).not.toContain('pinHash');
    expect(JSON.stringify(pub)).not.toContain('"pin"');
    expect(pub[0]).toEqual({ id: 'ada', name: 'Ada', color: '#fff', hasPin: true });
    expect(pub[1]).toEqual({ id: 'ben', name: 'Ben', hasPin: false });
  });

  it('sets, replaces, clears, and preserves hashes from a client write', async () => {
    const existing = await hashPin('1234');
    const kept = await hashPin('5555');
    const merged = await mergeFamilyMembers(
      [
        { id: 'ada', name: 'Ada', pinHash: existing, color: '#111' },
        { id: 'ben', name: 'Ben', pinHash: kept },
      ],
      [
        { id: 'ada', name: 'Ada Lovelace', color: '#111', hasPin: true, pinHash: 'client-supplied' },
        { id: 'ben', name: 'Ben', pin: '9999', hasPin: true },
        { id: 'cam', name: 'Cam', pin: null },
        { id: 'dee', name: 'Dee', pin: '2468' },
      ],
    );
    expect(merged[0].pin).toBeUndefined();
    expect(merged[0].pinHash).toBe(existing);
    expect(merged[0].hasPin).toBeUndefined();
    expect(merged[0].name).toBe('Ada Lovelace');
    expect(await verifyPinHash('9999', merged[1].pinHash)).toBe(true);
    expect(merged[1].pinHash).not.toBe(kept);
    expect(merged[2].pinHash).toBeUndefined();
    expect(merged[2].pin).toBeUndefined();
    expect(await verifyPinHash('2468', merged[3].pinHash)).toBe(true);

    const cleared = await mergeFamilyMembers(merged, [
      { id: 'dee', name: 'Dee', pin: '' },
    ]);
    expect(cleared[0].pinHash).toBeUndefined();
  });

  it('verifies a migrated PIN and can limit the check to one member', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-pin-verify-'));
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dataDir, 'beacon_family_members.json'), JSON.stringify([
      { id: 'ada', name: 'Ada', pin: '1234' },
      { id: 'ben', name: 'Ben', pin: '5555' },
    ]));
    expect(await verifyFamilyPin(dataDir, '1234')).toEqual({ ok: true, memberId: 'ada' });
    expect(await verifyFamilyPin(dataDir, '5555', 'ben')).toEqual({ ok: true, memberId: 'ben' });
    expect(await verifyFamilyPin(dataDir, '1234', 'ben')).toEqual({ ok: false });
    expect(await verifyFamilyPin(dataDir, '0000')).toEqual({ ok: false });
    const stored = JSON.parse(await readFile(join(dataDir, 'beacon_family_members.json'), 'utf8'));
    expect(stored[0].pin).toBeUndefined();
    expect(stored[1].pin).toBeUndefined();
  });
});
