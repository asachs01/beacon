'use strict';

/**
 * Pairing attempts are limited per client IP and globally.
 *
 * Per IP: each failure waits 1s, 2s, 4s, then 8s. The 5th failure locks
 * that IP for 15 minutes. The next lockout is 30 minutes, then 60, up to
 * 24 hours. A correct PIN or code is rejected while the lockout holds.
 *
 * Globally: at most 30 attempts per minute, and 20 failures lock every
 * client for the same escalating window.
 */

const MINUTE = 60 * 1000;
const FIFTEEN_MIN = 15 * MINUTE;

function createPairingLimiter(options = {}) {
  const now = options.now || (() => Date.now());
  const lockoutAfter = options.lockoutAfter ?? 5;
  const baseLockoutMs = options.baseLockoutMs ?? FIFTEEN_MIN;
  const maxLockoutMs = options.maxLockoutMs ?? 24 * 60 * MINUTE;
  const baseBackoffMs = options.baseBackoffMs ?? 1000;
  const maxBackoffMs = options.maxBackoffMs ?? 8000;
  const globalMaxAttempts = options.globalMaxAttempts ?? 30;
  const globalWindowMs = options.globalWindowMs ?? MINUTE;
  const globalLockoutAfter = options.globalLockoutAfter ?? 20;
  const onLockout = options.onLockout || (() => {});

  const ips = new Map();
  const global = {
    attempts: [],
    failures: 0,
    lockoutLevel: 0,
    lockedUntil: 0,
  };

  function ipState(ip) {
    let state = ips.get(ip);
    if (!state) {
      state = { failures: 0, lockoutLevel: 0, lockedUntil: 0, nextAttemptAt: 0 };
      ips.set(ip, state);
    }
    return state;
  }

  function blocked(until, scope) {
    return { ok: false, retryAfterMs: Math.max(0, until - now()), scope };
  }

  function check(ip) {
    const t = now();
    const state = ipState(ip);
    if (global.lockedUntil > t) return blocked(global.lockedUntil, 'global');
    if (state.lockedUntil > t) return blocked(state.lockedUntil, 'ip');
    if (state.nextAttemptAt > t) return blocked(state.nextAttemptAt, 'ip-backoff');
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

  function fail(ip) {
    const t = now();
    const state = ipState(ip);
    if (global.lockedUntil > t) return blocked(global.lockedUntil, 'global');
    if (state.lockedUntil > t) return blocked(state.lockedUntil, 'ip');
    state.failures += 1;
    global.failures += 1;
    let result = null;
    if (global.failures >= globalLockoutAfter) {
      result = lock(global, 'global', '*');
    }
    if (state.failures >= lockoutAfter) {
      return lock(state, 'ip', ip);
    }
    const backoff = Math.min(baseBackoffMs * (2 ** (state.failures - 1)), maxBackoffMs);
    state.nextAttemptAt = t + backoff;
    return result || { ok: false, retryAfterMs: backoff, scope: 'ip-backoff' };
  }

  function success(ip) {
    const state = ipState(ip);
    state.failures = 0;
    state.lockoutLevel = 0;
    state.lockedUntil = 0;
    state.nextAttemptAt = 0;
  }

  return { check, fail, success };
}

module.exports = {
  createPairingLimiter,
  MINUTE,
  FIFTEEN_MIN,
};
