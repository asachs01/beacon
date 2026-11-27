'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { readFamilyPinHashes, verifyPinHash } = require('./family-pins.cjs');

const SESSION_FILE = 'device-sessions.json';
const COOKIE_NAME = 'beacon_session';
const SESSION_MAX_AGE_SEC = 400 * 24 * 60 * 60;

function normalizePin(pin) {
  return String(pin || '').replace(/\D/g, '').slice(0, 6);
}

function hashBytes(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

function secretsEqual(a, b) {
  return crypto.timingSafeEqual(hashBytes(a), hashBytes(b));
}

function cleanLabel(value, fallback = 'This device') {
  const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  return text || fallback;
}

function newPairingCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function createSessionStore(options = {}) {
  const dataDir = options.dataDir;
  const now = options.now || (() => new Date());
  const onRevoke = options.onRevoke || (() => {});
  const filePath = path.join(dataDir, SESSION_FILE);
  let state = { sessions: [], pairingCode: '' };
  let loaded = false;
  let saveTimer = null;

  function stamp(date = now()) {
    return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  }

  async function load() {
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const sessions = Array.isArray(parsed.sessions) ? parsed.sessions.filter(validSession) : [];
      const pairingCode = typeof parsed.pairingCode === 'string' && /^\d{6}$/.test(parsed.pairingCode)
        ? parsed.pairingCode
        : '';
      state = { sessions, pairingCode };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[beacon] device session store could not be read: ${err.message}`);
      }
      state = { sessions: [], pairingCode: '' };
    }
    if (!state.pairingCode) {
      state.pairingCode = newPairingCode();
      await saveNow();
    }
    loaded = true;
    return state.pairingCode;
  }

  function validSession(session) {
    return session
      && typeof session.id === 'string'
      && typeof session.tokenHash === 'string'
      && session.tokenHash.length === 64
      && typeof session.label === 'string'
      && typeof session.createdAt === 'string'
      && typeof session.lastSeenAt === 'string';
  }

  function assertLoaded() {
    if (!loaded) throw new Error('device session store is not loaded');
  }

  async function saveNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await fsp.mkdir(dataDir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    const body = JSON.stringify({
      sessions: state.sessions,
      pairingCode: state.pairingCode,
    });
    await fsp.writeFile(tmp, body, { encoding: 'utf8', mode: 0o600 });
    await fsp.rename(tmp, filePath);
    try { await fsp.chmod(filePath, 0o600); } catch { /* Windows and some mounts ignore this */ }
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveNow().catch((err) => {
        console.warn(`[beacon] device session store could not be saved: ${err.message}`);
      });
    }, 1000);
    saveTimer.unref?.();
  }

  function pairingCode() {
    assertLoaded();
    return state.pairingCode;
  }

  async function regeneratePairingCode() {
    assertLoaded();
    const previous = state.pairingCode;
    let next = newPairingCode();
    while (next === previous) next = newPairingCode();
    state.pairingCode = next;
    await saveNow();
    return state.pairingCode;
  }

  function findByHash(tokenHash) {
    const presented = Buffer.from(tokenHash, 'hex');
    if (presented.length !== 32) return null;
    for (const session of state.sessions) {
      const stored = Buffer.from(session.tokenHash, 'hex');
      if (stored.length === presented.length && crypto.timingSafeEqual(stored, presented)) {
        return session;
      }
    }
    return null;
  }

  function verify(token) {
    assertLoaded();
    if (!token || typeof token !== 'string') return null;
    return findByHash(hashToken(token));
  }

  function touch(id) {
    const session = state.sessions.find((item) => item.id === id);
    if (!session) return;
    session.lastSeenAt = stamp();
    scheduleSave();
  }

  async function createSession(label, options = {}) {
    assertLoaded();
    const kind = options && options.kind === 'token' ? 'token' : 'device';
    const token = newToken();
    const session = {
      id: crypto.randomBytes(16).toString('hex'),
      tokenHash: hashToken(token),
      label: cleanLabel(label, kind === 'token' ? 'Access token' : 'This device'),
      kind,
      createdAt: stamp(),
      lastSeenAt: stamp(),
    };
    state.sessions.push(session);
    await saveNow();
    return { token, session: publicSession(session, session.id) };
  }

  function list(currentId) {
    assertLoaded();
    return state.sessions.map((session) => publicSession(session, currentId));
  }

  async function revoke(id) {
    assertLoaded();
    const next = state.sessions.filter((session) => session.id !== id);
    if (next.length === state.sessions.length) return false;
    state.sessions = next;
    await saveNow();
    onRevoke(id);
    return true;
  }

  function publicSession(session, currentId) {
    return {
      id: session.id,
      label: session.label,
      kind: session.kind === 'token' ? 'token' : 'device',
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      current: session.id === currentId,
    };
  }

  return {
    load,
    pairingCode,
    regeneratePairingCode,
    verify,
    touch,
    createSession,
    list,
    revoke,
    filePath,
  };
}

async function readFamilyPins(dataDir) {
  try {
    return await readFamilyPinHashes(dataDir);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[beacon] family PINs could not be read: ${err.message}`);
    }
    return [];
  }
}

/**
 * Accept a family PIN or the current pairing code. Guest PINs are not in
 * the family member file and are never accepted here.
 * The pairing-code check and every family-PIN hash check always run, so a
 * match is not faster than a mismatch.
 * `familyPins` is a list of pinHash strings, not plaintext.
 */
async function pairingSecretOk(secret, pairingCode, familyPins) {
  const entered = normalizePin(secret);
  const codeOk = entered.length === 6 && secretsEqual(entered, pairingCode);
  const hashes = Array.isArray(familyPins) ? familyPins : [];
  const results = await Promise.all(hashes.map((hash) => verifyPinHash(entered, hash)));
  let pinOk = false;
  for (const ok of results) {
    if (ok) pinOk = true;
  }
  return codeOk || pinOk;
}

function buildSessionCookie(token, { secure = false } = {}) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function requestIsSecure(req) {
  if (req.socket && req.socket.encrypted) return true;
  const forwarded = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return forwarded === 'https';
}

module.exports = {
  COOKIE_NAME,
  SESSION_FILE,
  SESSION_MAX_AGE_SEC,
  buildSessionCookie,
  cleanLabel,
  createSessionStore,
  hashToken,
  normalizePin,
  pairingSecretOk,
  readFamilyPins,
  requestIsSecure,
  secretsEqual,
};
