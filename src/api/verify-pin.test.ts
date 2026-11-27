import { afterEach, describe, expect, it, vi } from 'vitest';
import { VERIFY_PIN_TIMEOUT_MS, verifyFamilyPin } from './verify-pin';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('verifyFamilyPin', () => {
  it('returns accepted and rejected from the server body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, memberId: 'ada' }), { status: 200 })));
    await expect(verifyFamilyPin('1234')).resolves.toEqual({ status: 'accepted', memberId: 'ada' });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 200 })));
    await expect(verifyFamilyPin('0000')).resolves.toEqual({ status: 'rejected' });
  });

  it('fails closed on a network error, HTTP 500, and an 8 second timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    await expect(verifyFamilyPin('1234')).resolves.toEqual({ status: 'unreachable' });

    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })));
    await expect(verifyFamilyPin('1234')).resolves.toEqual({ status: 'unreachable' });

    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    })));
    const pending = verifyFamilyPin('1234');
    await vi.advanceTimersByTimeAsync(VERIFY_PIN_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ status: 'unreachable' });
  });

  it('reports a lockout without treating it as a successful PIN', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'pin_locked' }), {
      status: 429,
      headers: { 'Retry-After': '60' },
    })));
    await expect(verifyFamilyPin('1234')).resolves.toEqual({ status: 'locked' });
  });
});
