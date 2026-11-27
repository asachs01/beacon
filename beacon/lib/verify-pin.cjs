'use strict';

/**
 * POST /beacon-auth/verify-pin { pin, memberId? } -> { ok, memberId? }
 *
 * The session gate in server.js runs before this handler. Failures are
 * counted on a pairing-limiter instance of their own (IP + beacon_pair_attempt
 * cookie, plus the per-IP ceiling) so PIN guesses do not lock pairing and
 * one device behind a shared IP does not lock the others.
 */

const { verifyFamilyPin } = require('./family-pins.cjs');
const { clientIp, readCookie, retryAfterSeconds } = require('./device-auth.cjs');
const {
  PAIR_ATTEMPT_COOKIE,
  buildPairAttemptCookie,
  newAttemptId,
  normalizeAttemptId,
} = require('./pairing-rate-limit.cjs');
const { requestIsSecure } = require('./device-sessions.cjs');

function sendJson(res, status, body, extraHeaders) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) headers[key] = value;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req, maxSize = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxSize) {
        req.destroy();
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function handleVerifyPin(req, res, deps) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  const limiter = deps.limiter;
  const dataDir = deps.dataDir;
  const ip = clientIp(req);
  const attemptId = normalizeAttemptId(readCookie(req, PAIR_ATTEMPT_COOKIE)) || newAttemptId();
  const attemptCookie = buildPairAttemptCookie(attemptId, { secure: requestIsSecure(req) });
  const send = (status, body) => {
    sendJson(res, status, body, { 'Set-Cookie': attemptCookie });
  };

  readBody(req).then(async (bodyBuf) => {
    const gate = limiter.check(ip, attemptId);
    if (!gate.ok) {
      const retryAfter = retryAfterSeconds(gate.retryAfterMs);
      sendJson(res, 429, { error: 'pin_locked', retryAfter }, {
        'Retry-After': String(retryAfter),
        'Set-Cookie': attemptCookie,
      });
      return;
    }
    let payload = {};
    try {
      payload = JSON.parse((bodyBuf.length ? bodyBuf : Buffer.from('{}')).toString('utf8'));
    } catch {
      limiter.fail(ip, attemptId);
      send(400, { error: 'Invalid JSON' });
      return;
    }
    const pin = payload && typeof payload.pin === 'string' ? payload.pin : '';
    const memberId = payload && typeof payload.memberId === 'string' ? payload.memberId : '';
    const result = await verifyFamilyPin(dataDir, pin, memberId);
    if (!result.ok) {
      const failed = limiter.fail(ip, attemptId);
      if (failed.scope === 'attempt' || failed.scope === 'ip' || failed.scope === 'global') {
        const retryAfter = retryAfterSeconds(failed.retryAfterMs);
        sendJson(res, 429, { error: 'pin_locked', retryAfter }, {
          'Retry-After': String(retryAfter),
          'Set-Cookie': attemptCookie,
        });
        return;
      }
      send(200, { ok: false });
      return;
    }
    limiter.success(ip, attemptId);
    const body = { ok: true };
    if (result.memberId) body.memberId = result.memberId;
    send(200, body);
  }).catch((err) => {
    if (!res.headersSent) sendJson(res, err.status || 400, { error: err.message || 'Bad request' });
  });
}

module.exports = {
  handleVerifyPin,
};
