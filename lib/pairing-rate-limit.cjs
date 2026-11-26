'use strict';

/**
 * Pairing attempts are limited three ways. The numbers below are the policy.
 *
 * 1. Fast lockout, keyed by client IP plus the non-secret
 *    `beacon_pair_attempt` cookie. A missing or malformed cookie shares one
 *    bucket per IP (the empty id). Each failure on that key waits 1s, then
 *    2s, 4s, and 8s. The 5th failure locks that IP+cookie for 15 minutes.
 *    The next lockout on the same key is 30 minutes, then 60, doubling up
 *    to 24 hours. A correct PIN or code is rejected while that lockout holds.
 *    A different cookie on the same IP has its own fast lockout.
 *
 * 2. Per-IP ceiling: 30 failures in a rolling hour lock that IP for the
 *    same escalating window (15 minutes, then 30, then 60, up to 24 hours).
 *    Failures count even when each request presents a new cookie, so
 *    clearing `beacon_pair_attempt` cannot brute-force a 4-digit PIN.
 *    A successful pair does not erase this window.
 *
 * 3. Global, unchanged: at most 30 attempts per minute, and 20 failures
 *    lock every client for the same escalating window.
 */

const crypto = require('crypto');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const FIFTEEN_MIN = 15 * MINUTE;
const FAST_LOCKOUT_AFTER = 5;
const IP_FAILURES_PER_HOUR = 30;
const PAIR_ATTEMPT_COOKIE = 'beacon_pair_attempt';
const PAIR_ATTEMPT_MAX_AGE_SEC = 30 * 24 * 60 * 60;

function createPairingLimiter(options = {}) {
  const now = options.now || (() => Date.now());
  const lockoutAfter = options.lockoutAfter ?? FAST_LOCKOUT_AFTER;
  const baseLockoutMs = options.baseLockoutMs ?? FIFTEEN_MIN;
  const maxLockoutMs = options.maxLockoutMs ?? 24 * 60 * MINUTE;
  const baseBackoffMs = options.baseBackoffMs ?? 1000;
  const maxBackoffMs = options.maxBackoffMs ?? 8000;
  const globalMaxAttempts = options.globalMaxAttempts ?? 30;
  const globalWindowMs = options.globalWindowMs ?? MINUTE;
  const globalLockoutAfter = options.globalLockoutAfter ?? 20;
  const ipMaxFailures = options.ipMaxFailures ?? IP_FAILURES_PER_HOUR;
  const ipWindowMs = options.ipWindowMs ?? HOUR;
  const onLockout = options.onLockout || (() => {});

  const attempts = new Map();
  const ips = new Map();
  const global = {
    attempts: [],
    failures: 0,
    lockoutLevel: 0,
    lockedUntil: 0,
  };

  function attemptKey(ip, attemptId) {
    return `${ip}\n${normalizeAttemptId(attemptId)}`;
  }

  function attemptState(ip, attemptId) {
    const key = attemptKey(ip, attemptId);
    let state = attempts.get(key);
    if (!state) {
      state = { failures: 0, lockoutLevel: 0, lockedUntil: 0, nextAttemptAt: 0 };
      attempts.set(key, state);
    }
    return state;
  }

  function ipState(ip) {
    let state = ips.get(ip);
    if (!state) {
      state = { failureTimes: [], lockoutLevel: 0, lockedUntil: 0 };
      ips.set(ip, state);
    }
    return state;
  }

  function pruneAttempts(t) {
    if (attempts.size <= 4000) return;
    for (const [key, state] of attempts) {
      if (attempts.size <= 2000) break;
      if (state.lockedUntil > t) continue;
      attempts.delete(key);
    }
  }

  function blocked(until, scope) {
    return { ok: false, retryAfterMs: Math.max(0, until - now()), scope };
  }

  function check(ip, attemptId) {
    const t = now();
    pruneAttempts(t);
    const attempt = attemptState(ip, attemptId);
    const address = ipState(ip);
    if (global.lockedUntil > t) return blocked(global.lockedUntil, 'global');
    if (address.lockedUntil > t) return blocked(address.lockedUntil, 'ip');
    if (attempt.lockedUntil > t) return blocked(attempt.lockedUntil, 'attempt');
    if (attempt.nextAttemptAt > t) return blocked(attempt.nextAttemptAt, 'attempt-backoff');
    global.attempts = global.attempts.filter((ts) => t - ts < globalWindowMs);
    if (global.attempts.length >= globalMaxAttempts) {
      const oldest = global.attempts[0] || t;
      return blocked(oldest + globalWindowMs, 'global-rate');
    }
    global.attempts.push(t);
    return { ok: true };
  }

  function lock(state, scope, ip) {
    const delay = Math.min(baseLockoutMs * (2 ** state.lockoutLevel), maxLockoutMs);
    state.lockedUntil = now() + delay;
    state.lockoutLevel += 1;
    state.failures = 0;
    if (state.nextAttemptAt !== undefined) state.nextAttemptAt = 0;
    onLockout({ scope, ip, until: state.lockedUntil, delayMs: delay });
    return blocked(state.lockedUntil, scope);
  }

  function lockIp(state, ip) {
    const delay = Math.min(baseLockoutMs * (2 ** state.lockoutLevel), maxLockoutMs);
    state.lockedUntil = now() + delay;
    state.lockoutLevel += 1;
    state.failureTimes = [];
    onLockout({ scope: 'ip', ip, until: state.lockedUntil, delayMs: delay });
    return blocked(state.lockedUntil, 'ip');
  }

  function fail(ip, attemptId) {
    const t = now();
    const attempt = attemptState(ip, attemptId);
    const address = ipState(ip);
    if (global.lockedUntil > t) return blocked(global.lockedUntil, 'global');
    if (address.lockedUntil > t) return blocked(address.lockedUntil, 'ip');
    if (attempt.lockedUntil > t) return blocked(attempt.lockedUntil, 'attempt');

    attempt.failures += 1;
    address.failureTimes = address.failureTimes.filter((ts) => t - ts < ipWindowMs);
    address.failureTimes.push(t);
    global.failures += 1;

    let result = null;
    if (global.failures >= globalLockoutAfter) {
      result = lock(global, 'global', '*');
    }
    if (address.failureTimes.length >= ipMaxFailures) {
      result = lockIp(address, ip);
    }
    if (attempt.failures >= lockoutAfter) {
      const attemptLock = lock(attempt, 'attempt', ip);
      if (!result) result = attemptLock;
    }
    if (result) return result;

    const backoff = Math.min(baseBackoffMs * (2 ** (attempt.failures - 1)), maxBackoffMs);
    attempt.nextAttemptAt = t + backoff;
    return { ok: false, retryAfterMs: backoff, scope: 'attempt-backoff' };
  }

  function success(ip, attemptId) {
    const attempt = attemptState(ip, attemptId);
    attempt.failures = 0;
    attempt.lockoutLevel = 0;
    attempt.lockedUntil = 0;
    attempt.nextAttemptAt = 0;
  }

  return { check, fail, success };
}

/** Random bucket id. Not a credential. */
function newAttemptId() {
  return crypto.randomBytes(16).toString('hex');
}

/** Accept only the shape we set, so a huge cookie cannot become a map key. */
function normalizeAttemptId(attemptId) {
  const text = String(attemptId || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(text)) return '';
  return text;
}

/**
 * Non-secret cookie. HttpOnly is omitted on purpose: the value only
 * separates pairing attempts and is not a session.
 */
function buildPairAttemptCookie(id, { secure = false } = {}) {
  const parts = [
    `${PAIR_ATTEMPT_COOKIE}=${normalizeAttemptId(id) || newAttemptId()}`,
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${PAIR_ATTEMPT_MAX_AGE_SEC}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

module.exports = {
  FAST_LOCKOUT_AFTER,
  FIFTEEN_MIN,
  HOUR,
  IP_FAILURES_PER_HOUR,
  MINUTE,
  PAIR_ATTEMPT_COOKIE,
  PAIR_ATTEMPT_MAX_AGE_SEC,
  buildPairAttemptCookie,
  createPairingLimiter,
  newAttemptId,
  normalizeAttemptId,
};
