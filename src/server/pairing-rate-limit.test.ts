import { describe, expect, it, vi } from 'vitest';
import { createPairingLimiter, FIFTEEN_MIN, HOUR, IP_FAILURES_PER_HOUR } from '../../lib/pairing-rate-limit.cjs';

describe('pairing rate limit', () => {
  it('locks an IP and attempt cookie for 15 minutes after 5 failures and escalates', () => {
    let clock = 1_000_000;
    const lockouts: Array<{ scope: string; delayMs: number }> = [];
    const limiter = createPairingLimiter({
      now: () => clock,
      onLockout(event: { scope: string; delayMs: number }) {
        lockouts.push({ scope: event.scope, delayMs: event.delayMs });
      },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.check('10.1.1.9').ok).toBe(true);
      const failed = limiter.fail('10.1.1.9');
      if (failed.scope === 'attempt-backoff') clock += failed.retryAfterMs;
    }

    expect(lockouts).toEqual([{ scope: 'attempt', delayMs: FIFTEEN_MIN }]);
    const locked = limiter.check('10.1.1.9');
    expect(locked.ok).toBe(false);
    expect(locked.scope).toBe('attempt');
    expect(locked.retryAfterMs).toBe(FIFTEEN_MIN);

    for (let i = 0; i < 1000; i += 1) {
      expect(limiter.check('10.1.1.9').ok).toBe(false);
    }

    clock += FIFTEEN_MIN;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.check('10.1.1.9').ok).toBe(true);
      const failed = limiter.fail('10.1.1.9');
      if (failed.scope === 'attempt-backoff') clock += failed.retryAfterMs;
    }
    expect(lockouts[1]).toEqual({ scope: 'attempt', delayMs: FIFTEEN_MIN * 2 });
    expect(limiter.check('10.1.1.9').retryAfterMs).toBe(FIFTEEN_MIN * 2);
  });

  it('rate limits attempts per IP with exponential backoff before lockout', () => {
    let clock = 0;
    const limiter = createPairingLimiter({ now: () => clock });
    expect(limiter.check('10.0.0.2').ok).toBe(true);
    const first = limiter.fail('10.0.0.2');
    expect(first.retryAfterMs).toBe(1000);
    expect(limiter.check('10.0.0.2').ok).toBe(false);
    clock += 1000;
    expect(limiter.check('10.0.0.2').ok).toBe(true);
    expect(limiter.fail('10.0.0.2').retryAfterMs).toBe(2000);
    clock += 2000;
    expect(limiter.fail('10.0.0.2').retryAfterMs).toBe(4000);
  });

  it('caps attempts globally even when each IP only tries once', () => {
    let clock = 50_000;
    const limiter = createPairingLimiter({ now: () => clock, globalMaxAttempts: 30 });
    for (let i = 0; i < 30; i += 1) {
      expect(limiter.check(`10.2.0.${i}`).ok).toBe(true);
    }
    const blocked = limiter.check('10.9.9.9');
    expect(blocked.ok).toBe(false);
    expect(blocked.scope).toBe('global-rate');
    clock += 60_000;
    expect(limiter.check('10.9.9.9').ok).toBe(true);
  });

  it('locks every client after repeated global failures', () => {
    let clock = 0;
    const warn = vi.fn();
    const limiter = createPairingLimiter({
      now: () => clock,
      globalLockoutAfter: 20,
      onLockout: warn,
    });
    for (let i = 0; i < 20; i += 1) {
      const ip = `10.3.0.${i}`;
      expect(limiter.check(ip).ok).toBe(true);
      limiter.fail(ip);
    }
    expect(warn).toHaveBeenCalled();
    expect(limiter.check('10.8.8.8').ok).toBe(false);
    expect(limiter.check('10.8.8.8').scope).toBe('global');
  });

  it('clears an attempt lockout state after a successful pair', () => {
    let clock = 0;
    const limiter = createPairingLimiter({ now: () => clock });
    expect(limiter.check('10.4.4.4', 'attempt-a').ok).toBe(true);
    const failed = limiter.fail('10.4.4.4', 'attempt-a');
    clock += failed.retryAfterMs;
    limiter.success('10.4.4.4', 'attempt-a');
    expect(limiter.check('10.4.4.4', 'attempt-a').ok).toBe(true);
  });

  it('keeps a separate fast lockout per attempt cookie on one IP', () => {
    let clock = 0;
    const limiter = createPairingLimiter({ now: () => clock });
    const ip = '10.5.5.5';
    const first = 'attemptcookieaaaa';
    const second = 'attemptcookiebbbb';
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(limiter.check(ip, first).ok).toBe(true);
      const failed = limiter.fail(ip, first);
      expect(failed.scope).toBe('attempt-backoff');
      clock += failed.retryAfterMs;
    }
    expect(limiter.check(ip, second).ok).toBe(true);
    expect(limiter.fail(ip, first).scope).toBe('attempt');
    expect(limiter.check(ip, first).ok).toBe(false);
    expect(limiter.check(ip, first).scope).toBe('attempt');
    expect(limiter.check(ip, second).ok).toBe(true);
  });

  it('locks the IP after 30 failures in an hour even when every cookie is new', () => {
    let clock = 10_000;
    const lockouts: string[] = [];
    const limiter = createPairingLimiter({
      now: () => clock,
      globalLockoutAfter: 1000,
      globalMaxAttempts: 1000,
      onLockout(event: { scope: string }) { lockouts.push(event.scope); },
    });
    for (let i = 0; i < IP_FAILURES_PER_HOUR; i += 1) {
      const cookie = `cookie${String(i).padStart(8, '0')}`;
      expect(limiter.check('192.0.2.10', cookie).ok, cookie).toBe(true);
      limiter.fail('192.0.2.10', cookie);
    }
    expect(lockouts).toContain('ip');
    const locked = limiter.check('192.0.2.10', 'cookie-brand-new');
    expect(locked.ok).toBe(false);
    expect(locked.scope).toBe('ip');
    expect(locked.retryAfterMs).toBe(FIFTEEN_MIN);

    clock += FIFTEEN_MIN;
    for (let i = 0; i < IP_FAILURES_PER_HOUR; i += 1) {
      const cookie = `next${String(i).padStart(8, '0')}`;
      expect(limiter.check('192.0.2.10', cookie).ok).toBe(true);
      limiter.fail('192.0.2.10', cookie);
    }
    expect(limiter.check('192.0.2.10', 'after-second-wave').retryAfterMs).toBe(FIFTEEN_MIN * 2);
  });

  it('does not let a successful pair or a new cookie erase the hourly IP ceiling', () => {
    let clock = 20_000;
    const limiter = createPairingLimiter({
      now: () => clock,
      globalLockoutAfter: 1000,
      globalMaxAttempts: 1000,
      ipMaxFailures: 30,
    });
    for (let i = 0; i < 29; i += 1) {
      const cookie = `wave${String(i).padStart(8, '0')}`;
      expect(limiter.check('192.0.2.20', cookie).ok).toBe(true);
      limiter.fail('192.0.2.20', cookie);
    }
    limiter.success('192.0.2.20', 'wave00000000');
    expect(limiter.check('192.0.2.20', 'fresh-cookie').ok).toBe(true);
    const tripped = limiter.fail('192.0.2.20', 'fresh-cookie');
    expect(tripped.scope).toBe('ip');
    expect(limiter.check('192.0.2.20', 'another-fresh').scope).toBe('ip');
  });

  it('drops IP failures that are older than an hour', () => {
    let clock = 30_000;
    const limiter = createPairingLimiter({
      now: () => clock,
      globalLockoutAfter: 1000,
      globalMaxAttempts: 1000,
    });
    for (let i = 0; i < IP_FAILURES_PER_HOUR - 1; i += 1) {
      const cookie = `old${String(i).padStart(8, '0')}`;
      limiter.check('192.0.2.30', cookie);
      limiter.fail('192.0.2.30', cookie);
    }
    clock += HOUR;
    for (let i = 0; i < IP_FAILURES_PER_HOUR - 1; i += 1) {
      const cookie = `new${String(i).padStart(8, '0')}`;
      expect(limiter.check('192.0.2.30', cookie).ok).toBe(true);
      expect(limiter.fail('192.0.2.30', cookie).scope).not.toBe('ip');
    }
  });
});
