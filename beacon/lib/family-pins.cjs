'use strict';

/**
 * Family PINs are stored as salted scrypt hashes.
 *
 *   pinHash: scrypt$N$r$p$saltB64$hashB64
 *
 * N=16384, r=8, p=1, 16-byte salt, 32-byte key. The plaintext `pin` field
 * is never written back. Callers that rewrite beacon_family_members.json
 * must go through mergeFamilyMembers so an omitted pin keeps the hash.
 */

const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');

const FAMILY_FILE = 'beacon_family_members.json';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_LEN = 16;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const migrations = new Map();

function normalizePin(pin) {
  return String(pin ?? '').replace(/\D/g, '').slice(0, 6);
}

function scryptKey(password, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, {
      N: params.N,
      r: params.r,
      p: params.p,
      maxmem: SCRYPT_MAXMEM,
    }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

function formatPinHash(salt, key) {
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

function parsePinHash(pinHash) {
  const parts = String(pinHash || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return null;
  const salt = Buffer.from(parts[4], 'base64');
  const hash = Buffer.from(parts[5], 'base64');
  if (salt.length !== SCRYPT_SALT_LEN || hash.length !== SCRYPT_KEYLEN) return null;
  return { N, r, p, salt, hash };
}

async function hashPin(pin) {
  const normalized = normalizePin(pin);
  if (!normalized) throw new Error('empty pin');
  const salt = crypto.randomBytes(SCRYPT_SALT_LEN);
  const key = await scryptKey(normalized, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return formatPinHash(salt, key);
}

/**
 * Verify a PIN against a stored hash. A malformed hash still runs scrypt
 * and timingSafeEqual so the reject path is not a fast tell.
 */
async function verifyPinHash(pin, pinHash) {
  const parsed = parsePinHash(pinHash);
  const entered = normalizePin(pin);
  if (!parsed) {
    const dummySalt = Buffer.alloc(SCRYPT_SALT_LEN, 1);
    const dummy = await scryptKey(entered || '0', dummySalt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    return crypto.timingSafeEqual(dummy, Buffer.alloc(SCRYPT_KEYLEN, 2)) && false;
  }
  const key = await scryptKey(entered, parsed.salt, parsed);
  if (key.length !== parsed.hash.length) return false;
  return crypto.timingSafeEqual(key, parsed.hash);
}

function familyFile(dataDir) {
  return path.join(dataDir, FAMILY_FILE);
}

async function atomicWriteJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(tmp, filePath);
  try { await fsp.chmod(filePath, 0o600); } catch { /* some mounts ignore this */ }
}

async function readFamilyMemberList(dataDir) {
  try {
    const raw = await fsp.readFile(familyFile(dataDir), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Replace plaintext `pin` with `pinHash` and drop `pin`. Idempotent.
 * Logs only how many PINs were hashed.
 */
async function migrateFamilyPins(dataDir) {
  const key = path.resolve(dataDir);
  const prev = migrations.get(key) || Promise.resolve();
  const run = prev.then(() => migrateFamilyPinsOnce(dataDir), () => migrateFamilyPinsOnce(dataDir));
  migrations.set(key, run.then(() => {}, () => {}));
  return run;
}

async function migrateFamilyPinsOnce(dataDir) {
  const filePath = familyFile(dataDir);
  let members;
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    members = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  if (!Array.isArray(members)) return 0;

  let changed = false;
  let count = 0;
  const next = [];
  for (const member of members) {
    if (!member || typeof member !== 'object' || Array.isArray(member)) {
      next.push(member);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(member, 'pin')) {
      next.push(member);
      continue;
    }
    const copy = { ...member };
    const pin = normalizePin(copy.pin);
    delete copy.pin;
    changed = true;
    if (pin) {
      copy.pinHash = await hashPin(pin);
      count += 1;
    }
    next.push(copy);
  }
  if (!changed) return 0;
  await atomicWriteJson(filePath, next);
  if (count > 0) console.log(`[beacon] migrated ${count} family PINs`);
  return count;
}

function toPublicMember(member) {
  if (!member || typeof member !== 'object' || Array.isArray(member)) return member;
  const next = { ...member };
  const hasPin = (typeof next.pinHash === 'string' && next.pinHash.startsWith('scrypt$'))
    || normalizePin(next.pin).length > 0;
  delete next.pin;
  delete next.pinHash;
  next.hasPin = hasPin;
  return next;
}

function toPublicMembers(value) {
  if (!Array.isArray(value)) return [];
  return value.map(toPublicMember);
}

async function applyMemberPin(member, stored) {
  if (!member || typeof member !== 'object' || Array.isArray(member)) return member;
  const next = { ...member };
  delete next.pinHash;
  delete next.hasPin;
  const setsPin = Object.prototype.hasOwnProperty.call(member, 'pin');
  if (!setsPin) {
    delete next.pin;
    if (stored && typeof stored.pinHash === 'string' && stored.pinHash) {
      next.pinHash = stored.pinHash;
    } else if (stored && normalizePin(stored.pin)) {
      next.pinHash = await hashPin(stored.pin);
    }
    return next;
  }
  const pin = normalizePin(member.pin);
  delete next.pin;
  if (!pin) return next;
  next.pinHash = await hashPin(pin);
  return next;
}

/**
 * Incoming list is what a client PUT. `pin` sets or replaces the hash.
 * `pin: null` or `''` clears it. Omitting `pin` keeps the stored hash.
 * Client-supplied pinHash and hasPin are ignored.
 */
async function mergeFamilyMembers(stored, incoming) {
  if (!Array.isArray(incoming)) throw new Error('family members must be a list');
  const storedList = Array.isArray(stored) ? stored : [];
  const byId = new Map();
  for (const member of storedList) {
    if (member && typeof member.id === 'string' && member.id) byId.set(member.id, member);
  }
  const next = [];
  for (const member of incoming) {
    const storedMember = member && typeof member.id === 'string' ? byId.get(member.id) : undefined;
    next.push(await applyMemberPin(member, storedMember));
  }
  return next;
}

async function readFamilyPinHashes(dataDir) {
  await migrateFamilyPins(dataDir);
  const members = await readFamilyMemberList(dataDir);
  const hashes = [];
  for (const member of members) {
    if (member && typeof member.pinHash === 'string' && member.pinHash) hashes.push(member.pinHash);
  }
  return hashes;
}

/**
 * Check `pin` against stored hashes. Every hash is verified. When memberId
 * is set, only that member can match, but the other hashes still run.
 */
async function verifyFamilyPin(dataDir, pin, memberId) {
  await migrateFamilyPins(dataDir);
  const members = await readFamilyMemberList(dataDir);
  const wanted = typeof memberId === 'string' && memberId ? memberId : '';
  const checks = members.map(async (member) => {
    if (!member || typeof member.pinHash !== 'string' || !member.pinHash) return null;
    const ok = await verifyPinHash(pin, member.pinHash);
    return ok ? member : null;
  });
  const matched = await Promise.all(checks);
  for (const member of matched) {
    if (!member) continue;
    if (wanted && member.id !== wanted) continue;
    return { ok: true, memberId: typeof member.id === 'string' ? member.id : undefined };
  }
  return { ok: false };
}

module.exports = {
  FAMILY_FILE,
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
  SCRYPT_KEYLEN,
  SCRYPT_SALT_LEN,
  atomicWriteJson,
  hashPin,
  mergeFamilyMembers,
  migrateFamilyPins,
  normalizePin,
  parsePinHash,
  readFamilyMemberList,
  readFamilyPinHashes,
  toPublicMember,
  toPublicMembers,
  verifyFamilyPin,
  verifyPinHash,
};
