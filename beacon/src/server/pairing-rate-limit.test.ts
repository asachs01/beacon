import { describe, expect, it, vi } from 'vitest';
import { createPairingLimiter, FIFTEEN_MIN } from '../../lib/pairing-rate-limit.cjs';

describe('pairing rate limit', () => {
  it('locks an IP for 15 minutes after 5 failures and escalates', () => {
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
      if (failed.scope === 'ip-backoff') clock += failed.retryAfterMs;
    }

    expect(lockouts).toEqual([{ scope: 'ip', delayMs: FIFTEEN_MIN }]);
    const locked = limiter.check('10.1.1.9');
    expect(locked.ok).toBe(false);
    expect(locked.scope).toBe('ip');
    expect(locked.retryAfterMs).toBe(FIFTEEN_MIN);

    for (let i = 0; i < 1000; i += 1) {
      expect(limiter.check('10.1.1.9').ok).toBe(false);
    }

    clock += FIFTEEN_MIN;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.check('10.1.1.9').ok).toBe(true);
      const failed = limiter.fail('10.1.1.9');
      if (failed.scope === 'ip-backoff') clock += failed.retryAfterMs;
    }
    expect(lockouts[1]).toEqual({ scope: 'ip', delayMs: FIFTEEN_MIN * 2 });
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

  it('clears an IP lockout state after a successful pair', () => {
    let clock = 0;
    const limiter = createPairingLimiter({ now: () => clock });
    expect(limiter.check('10.4.4.4').ok).toBe(true);
    const failed = limiter.fail('10.4.4.4');
    clock += failed.retryAfterMs;
    limiter.success('10.4.4.4');
    expect(limiter.check('10.4.4.4').ok).toBe(true);
  });
});
