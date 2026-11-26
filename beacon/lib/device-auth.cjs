'use strict';

/**
 * Who may call Beacon.
 *
 * Ingress trust is the socket peer, and only in add-on mode. The Supervisor
 * ingress proxy connects from 172.30.32.2. Headers such as X-Ingress-Path,
 * X-Forwarded-For, and X-Hass-Source are never consulted.
 *
 * Standalone mode never trusts that address, even if a client somehow
 * presents it.
 */

const { COOKIE_NAME } = require('./device-sessions.cjs');

const INGRESS_IP = '172.30.32.2';

const PUBLIC_PATHS = new Set([
  '/health',
  '/beacon-auth/pair',
  '/beacon-auth/session',
]);

function normalizeIp(address) {
  const raw = String(address || '');
  if (raw.startsWith('::ffff:')) return raw.slice('::ffff:'.length);
  return raw;
}

function clientIp(req) {
  return normalizeIp(req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * @param {{ mode: 'addon' | 'standalone', remoteAddress?: string }} input
 */
function isTrustedIngress(input) {
  if (!input || input.mode !== 'addon') return false;
  return normalizeIp(input.remoteAddress) === INGRESS_IP;
}

function classifyPath(pathname) {
  const pathOnly = pathname || '/';
  if (PUBLIC_PATHS.has(pathOnly)) return 'public';
  if (pathOnly.startsWith('/api/')) return 'protected';
  if (pathOnly.startsWith('/beacon-ws/')) return 'protected';
  if (pathOnly.startsWith('/beacon-data/')) return 'protected';
  if (pathOnly.startsWith('/beacon-action/')) return 'protected';
  if (pathOnly.startsWith('/beacon-api/')) return 'protected';
  if (pathOnly.startsWith('/beacon-auth/')) return 'protected';
  return 'public';
}

function readCookie(req, name) {
  const header = req.headers?.cookie || '';
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) {
      try {
        return decodeURIComponent(trimmed.slice(eq + 1));
      } catch {
        return '';
      }
    }
  }
  return '';
}

function readBearer(req) {
  const header = String(req.headers?.authorization || '');
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : '';
}

function readQuerySession(req) {
  const raw = req.url || '';
  const query = raw.split('?')[1] || '';
  if (!query) return '';
  return new URLSearchParams(query).get('session') || '';
}

/**
 * Cookie, then Authorization bearer, then `session` query (native webviews
 * and websocket upgrades, which cannot always send a header).
 */
function readPresentedToken(req) {
  return readCookie(req, COOKIE_NAME) || readBearer(req) || readQuerySession(req);
}

/** Drop the Beacon session query before a URL is forwarded to Home Assistant. */
function stripSessionQuery(url) {
  const raw = String(url || '');
  const q = raw.indexOf('?');
  if (q === -1) return raw;
  const params = new URLSearchParams(raw.slice(q + 1));
  if (!params.has('session')) return raw;
  params.delete('session');
  const rest = params.toString();
  return rest ? `${raw.slice(0, q)}?${rest}` : raw.slice(0, q);
}

/**
 * Copy headers for an upstream Home Assistant request without the Beacon
 * session cookie or a bearer token that is the Beacon session.
 */
function headersForUpstream(req) {
  const headers = { ...(req.headers || {}) };
  const presented = readPresentedToken(req);
  const authorization = String(headers.authorization || '');
  if (presented && authorization === `Bearer ${presented}`) delete headers.authorization;
  if (headers.cookie) {
    const kept = String(headers.cookie)
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith(`${COOKIE_NAME}=`));
    if (kept.length) headers.cookie = kept.join('; ');
    else delete headers.cookie;
  }
  return headers;
}

function createSocketRegistry() {
  const bySession = new Map();

  function track(sessionId, socket) {
    if (!sessionId || !socket) return;
    let set = bySession.get(sessionId);
    if (!set) {
      set = new Set();
      bySession.set(sessionId, set);
    }
    set.add(socket);
    const drop = () => {
      set.delete(socket);
      if (set.size === 0) bySession.delete(sessionId);
    };
    socket.on?.('close', drop);
  }

  function closeSession(sessionId) {
    const set = bySession.get(sessionId);
    if (!set) return;
    const sockets = [...set];
    bySession.delete(sessionId);
    for (const socket of sockets) {
      try {
        if (typeof socket.terminate === 'function') socket.terminate();
        else if (typeof socket.destroy === 'function') socket.destroy();
        else socket.close?.();
      } catch { /* already closed */ }
    }
  }

  return { track, closeSession };
}

function retryAfterSeconds(retryAfterMs) {
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

module.exports = {
  INGRESS_IP,
  PUBLIC_PATHS,
  classifyPath,
  clientIp,
  createSocketRegistry,
  isTrustedIngress,
  normalizeIp,
  readBearer,
  readCookie,
  headersForUpstream,
  readPresentedToken,
  readQuerySession,
  stripSessionQuery,
  retryAfterSeconds,
};
