import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashPin } from '../../lib/family-pins.cjs';
import { createPairingLimiter } from '../../lib/pairing-rate-limit.cjs';
import { handleVerifyPin } from '../../lib/verify-pin.cjs';

function mockReq(body: unknown, { cookie = '', ip = '10.1.1.1' } = {}) {
  const req = new EventEmitter() as EventEmitter & {
    method: string;
    headers: { cookie?: string };
    socket: { remoteAddress: string };
  };
  req.method = 'POST';
  req.headers = cookie ? { cookie } : {};
  req.socket = { remoteAddress: ip };
  const payload = Buffer.from(JSON.stringify(body));
  queueMicrotask(() => {
    req.emit('data', payload);
    req.emit('end');
  });
  return req;
}

function mockRes() {
  let status = 0;
  let headers: Record<string, string> = {};
  let body = '';
  let finish = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return {
    finished,
    get status() { return status; },
    get headers() { return headers; },
    get body() { return body; },
    headersSent: false,
    writeHead(code: number, extra?: Record<string, string>) {
      status = code;
      headers = extra || {};
      this.headersSent = true;
    },
    end(payload?: string) {
      body = payload || '';
      finish();
    },
  };
}

async function post(
  deps: { dataDir: string; limiter: ReturnType<typeof createPairingLimiter> },
  body: unknown,
  options?: { cookie?: string; ip?: string },
) {
  const req = mockReq(body, options);
  const res = mockRes();
  handleVerifyPin(req, res, deps);
  await res.finished;
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null, headers: res.headers };
}

describe('POST /beacon-auth/verify-pin', () => {
  it('accepts the right PIN, rejects the wrong one, and isolates devices on one IP', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'beacon-verify-pin-'));
    const ada = await hashPin('1234');
    await writeFile(join(dataDir, 'beacon_family_members.json'), JSON.stringify([
      { id: 'ada', name: 'Ada', pinHash: ada, color: '#fff' },
    ]));
    let clock = 1_000_000;
    const pinLimiter = createPairingLimiter({
      now: () => clock,
      baseBackoffMs: 0,
      maxBackoffMs: 0,
      lockoutAfter: 5,
      baseLockoutMs: 60_000,
      ipMaxFailures: 30,
    });
    const pairingLimiter = createPairingLimiter({
      now: () => clock,
      baseBackoffMs: 0,
      maxBackoffMs: 0,
      lockoutAfter: 5,
    });
    const deps = { dataDir, limiter: pinLimiter };
    const deviceA = 'beacon_pair_attempt=device-a1';
    const deviceB = 'beacon_pair_attempt=device-b2';

    const wrong = await post(deps, { pin: '0000' }, { cookie: deviceA, ip: '10.9.9.9' });
    expect(wrong.status).toBe(200);
    expect(wrong.json).toEqual({ ok: false });

    const ok = await post(deps, { pin: '12-34' }, { cookie: deviceA, ip: '10.9.9.9' });
    expect(ok.status).toBe(200);
    expect(ok.json).toEqual({ ok: true, memberId: 'ada' });
    expect(JSON.stringify(ok.json)).not.toContain('pinHash');

    for (let i = 0; i < 4; i += 1) {
      const attempt = await post(deps, { pin: '9999' }, { cookie: deviceA, ip: '10.9.9.9' });
      expect(attempt.status).toBe(200);
      expect(attempt.json).toEqual({ ok: false });
    }
    const locked = await post(deps, { pin: '9999' }, { cookie: deviceA, ip: '10.9.9.9' });
    expect(locked.status).toBe(429);
    expect(locked.json.error).toBe('pin_locked');

    const stillLocked = await post(deps, { pin: '1234' }, { cookie: deviceA, ip: '10.9.9.9' });
    expect(stillLocked.status).toBe(429);
    expect(stillLocked.json.error).toBe('pin_locked');

    const otherDevice = await post(deps, { pin: '1234' }, { cookie: deviceB, ip: '10.9.9.9' });
    expect(otherDevice.status).toBe(200);
    expect(otherDevice.json).toEqual({ ok: true, memberId: 'ada' });

    expect(pairingLimiter.check('10.9.9.9', 'device-a1').ok).toBe(true);
    expect(pairingLimiter.check('10.9.9.9', 'device-b2').ok).toBe(true);
  });
});
