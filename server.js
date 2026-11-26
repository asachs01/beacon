#!/usr/bin/env node
/**
 * Beacon add-on server.
 *
 * - Serves the static SPA from /app/dist
 * - Proxies an allowlisted subset of /api/* to Home Assistant with the
 *   Supervisor token, or HA_TOKEN when this process is not running as an add-on.
 *   Anything else is 403 and is not forwarded. Server-internal haRequest calls
 *   are not part of that proxy.
 * - Provides /beacon-data/* for persistent storage (survives rebuilds)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const WebSocket = require('ws');
const { describeHaHttpTarget, resolveHaConnection, standaloneConfigError } = require('./lib/ha-connection.cjs');
const { attachHaWsBridge } = require('./lib/ha-ws-bridge.cjs');
const { createHomeSensorGate } = require('./lib/home-sensor-gate.cjs');
const { handleHomeSensorEntities } = require('./lib/home-sensor-entities.cjs');
const { evaluateHaProxyPolicy, isHaMediaUpload, proxySettingsFromStore } = require('./lib/ha-proxy-policy.cjs');
const {
  PAIR_ATTEMPT_COOKIE,
  buildPairAttemptCookie,
  createPairingLimiter,
  newAttemptId,
  normalizeAttemptId,
} = require('./lib/pairing-rate-limit.cjs');
const {
  buildSessionCookie,
  cleanLabel,
  createSessionStore,
  pairingSecretOk,
  readFamilyPins,
  requestIsSecure,
} = require('./lib/device-sessions.cjs');
const {
  classifyPath,
  clientIp,
  headersForUpstream,
  stripSessionQuery,
  createSocketRegistry,
  isTrustedIngress,
  readCookie,
  readPresentedToken,
  retryAfterSeconds,
} = require('./lib/device-auth.cjs');
const { warnIfBrowserTokenSet } = require('./lib/runtime-config.cjs');

// BEACON_PORT is for tests. The add-on keeps listening on 3000.
const PORT = process.env.BEACON_PORT ? Number(process.env.BEACON_PORT) : 3000;
const DIST = process.env.BEACON_DIST || '/app/dist';
// Add-on: Supervisor token and http://supervisor/core.
// Standalone: HA_URL + HA_TOKEN. Overrides still win when set.
const haConnection = resolveHaConnection(process.env);
const HA_API_BASE = haConnection.apiBase;
const HA_WS_URL = haConnection.wsUrl;
const HA_ACCESS_TOKEN = haConnection.token;
const HA_MODE = haConnection.mode;
const haBridgeServer = new WebSocket.Server({ noServer: true });
// /data/ is HA add-on persistent storage (survives container rebuilds)
const DATA_DIR = process.env.BEACON_DATA || '/data';
const homeSensorGate = createHomeSensorGate({
  readSettings: async () => JSON.parse(await fsp.readFile(path.join(DATA_DIR, 'beacon-settings.json'), 'utf8')),
  fetchEntityState: async (entityId) => {
    const result = await haRequestTimed('GET', `/api/states/${encodeURIComponent(entityId)}`);
    if (!result || result.status !== 200 || !result.data || typeof result.data !== 'object') return null;
    return result.data;
  },
});
homeSensorGate.load().catch((err) => {
  console.warn(`[beacon] home sensor selection load failed: ${err.message}`);
});
const { createGooglePhotoCache, REFRESH_MS } = require('./lib/google-photos-cache.cjs');
const { acceptedChoreEvents, createPrivilegeScheduler } = require('./lib/chore-privileges.cjs');
const { readStoredResetTime } = require('./lib/chore-day.cjs');
const { parseIntent, resolveTodoEntity } = require('./lib/voice-intents.cjs');
const { completeStoredChore, handleCompleteChore } = require('./lib/complete-chore.cjs');
const { listStoredChores, handleChoresLeft } = require('./lib/chores-left.cjs');
const { backupMealPlanFile } = require('./lib/meal-plan-files.cjs');
const googlePhotos = createGooglePhotoCache({
  dataDir: path.join(DATA_DIR, 'photo-cache', 'google'),
});

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

// Ensure data directory exists
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }

const deviceSockets = createSocketRegistry();
const sessionStore = createSessionStore({
  dataDir: DATA_DIR,
  onRevoke(id) { deviceSockets.closeSession(id); },
});
const pairingLimiter = createPairingLimiter({
  onLockout({ scope, ip, until }) {
    const who = scope === 'global' ? 'all clients' : ip;
    console.warn(`[beacon] pairing lockout (${scope}) for ${who} until ${new Date(until).toISOString()}`);
  },
});

function ingressTrusted(req) {
  return isTrustedIngress({
    mode: HA_MODE === 'addon' ? 'addon' : 'standalone',
    remoteAddress: req.socket && req.socket.remoteAddress,
  });
}

function json(res, status, body, extraHeaders) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers[key] = value;
    }
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

/** Session cookie, bearer token, or (for websockets and native media) query. Ingress skips this. */
function establishedSession(req) {
  if (ingressTrusted(req)) return { ok: true, via: 'ingress', session: null };
  const token = readPresentedToken(req);
  const session = token ? sessionStore.verify(token) : null;
  if (!session) return { ok: false };
  sessionStore.touch(session.id);
  return { ok: true, via: 'session', session };
}

function requireSession(req, res) {
  const auth = establishedSession(req);
  if (!auth.ok) {
    json(res, 401, { error: 'pairing_required' });
    return null;
  }
  return auth;
}

function denyUpgrade(socket) {
  try {
    socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{"error":"pairing_required"}');
  } catch { /* peer already gone */ }
  socket.destroy();
}

function handleHealth(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  json(res, 200, { ok: true });
}

function handleSessionStatus(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  const auth = establishedSession(req);
  json(res, 200, { paired: auth.ok, ingress: auth.ok && auth.via === 'ingress' });
}

function handlePair(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  const ip = clientIp(req);
  const attemptId = normalizeAttemptId(readCookie(req, PAIR_ATTEMPT_COOKIE)) || newAttemptId();
  const attemptCookie = buildPairAttemptCookie(attemptId, { secure: requestIsSecure(req) });
  const send = (status, body, extraHeaders) => {
    const extra = { ...(extraHeaders || {}) };
    const cookies = [attemptCookie];
    if (extra['Set-Cookie']) cookies.push(extra['Set-Cookie']);
    extra['Set-Cookie'] = cookies;
    json(res, status, body, extra);
  };
  collectBody(req).then(async (bodyBuf) => {
    const gate = pairingLimiter.check(ip, attemptId);
    if (!gate.ok) {
      const retryAfter = retryAfterSeconds(gate.retryAfterMs);
      send(429, { error: 'pairing_locked', retryAfter }, { 'Retry-After': String(retryAfter) });
      return;
    }
    let payload = {};
    try {
      payload = JSON.parse((bodyBuf || '{}').toString('utf8'));
    } catch {
      pairingLimiter.fail(ip, attemptId);
      send(401, { error: 'pairing_failed' });
      return;
    }
    const pins = await readFamilyPins(DATA_DIR);
    const ok = pairingSecretOk(payload.secret, sessionStore.pairingCode(), pins);
    if (!ok) {
      const failed = pairingLimiter.fail(ip, attemptId);
      if (failed.scope === 'attempt' || failed.scope === 'ip' || failed.scope === 'global') {
        const retryAfter = retryAfterSeconds(failed.retryAfterMs);
        send(429, { error: 'pairing_locked', retryAfter }, { 'Retry-After': String(retryAfter) });
        return;
      }
      send(401, { error: 'pairing_failed' });
      return;
    }
    pairingLimiter.success(ip, attemptId);
    const created = await sessionStore.createSession(cleanLabel(payload.label));
    // The raw token is returned once in this body and is not logged.
    send(200, { ok: true, token: created.token, device: created.session }, {
      'Set-Cookie': buildSessionCookie(created.token, { secure: requestIsSecure(req) }),
    });
  }).catch((err) => {
    if (!res.headersSent) json(res, 400, { error: err.message || 'Bad request' });
  });
}

function handleAccessTokenCreate(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  const auth = requireSession(req, res);
  if (!auth) return;
  collectBody(req).then(async (bodyBuf) => {
    let payload = {};
    try {
      payload = JSON.parse((bodyBuf || '{}').toString('utf8'));
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }
    const label = typeof payload.label === 'string' ? payload.label : '';
    const created = await sessionStore.createSession(label, { kind: 'token' });
    // Returned once. Not written to the log, and not stored except as a hash.
    json(res, 200, { ok: true, token: created.token, device: created.session });
  }).catch((err) => {
    if (!res.headersSent) json(res, 400, { error: err.message || 'Bad request' });
  });
}

function handleDeviceList(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  const auth = requireSession(req, res);
  if (!auth) return;
  json(res, 200, {
    pairingCode: sessionStore.pairingCode(),
    devices: sessionStore.list(auth.session && auth.session.id),
  });
}

function handleDeviceRevoke(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  const auth = requireSession(req, res);
  if (!auth) return;
  collectBody(req).then(async (bodyBuf) => {
    let payload = {};
    try {
      payload = JSON.parse((bodyBuf || '{}').toString('utf8'));
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }
    if (!payload.id || typeof payload.id !== 'string') {
      json(res, 400, { error: 'Missing device id' });
      return;
    }
    const removed = await sessionStore.revoke(payload.id);
    json(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Device not found' });
  }).catch((err) => {
    if (!res.headersSent) json(res, 400, { error: err.message || 'Bad request' });
  });
}

function handlePairingCodeRegenerate(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  const auth = requireSession(req, res);
  if (!auth) return;
  sessionStore.regeneratePairingCode().then((code) => {
    console.log('Beacon pairing code regenerated');
    json(res, 200, { pairingCode: code });
  }).catch((err) => {
    if (!res.headersSent) json(res, 500, { error: err.message });
  });
}

async function serveStatic(req, res) {
  let filePath = path.join(DIST, req.url === '/' ? '/index.html' : req.url.split('?')[0]);

  // Path traversal guard
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(DIST) + path.sep) && resolved !== path.resolve(DIST)) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  try {
    await fsp.stat(filePath);
  } catch {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = await fsp.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

/** Collect request body into a Buffer with size limit (default 1MB). */
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
function collectBody(req, maxSize = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > maxSize) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : null));
    req.on('error', () => resolve(null));
  });
}

/** http or https, with port 80/443 when the URL does not name one. */
function openHaRequest(targetUrl, options, onResponse) {
  const target = describeHaHttpTarget(targetUrl);
  const lib = target.secure ? https : http;
  const headers = { ...options.headers };
  if (options.body) headers['Content-Length'] = options.body.length;
  return lib.request({
    hostname: target.hostname,
    port: target.port,
    path: target.path,
    method: options.method,
    headers,
  }, onResponse);
}

function rejectJson(res, status, payload) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function parseProxyJsonBody(body, contentType) {
  if (!body || body.length === 0) return null;
  const type = String(contentType || '').toLowerCase();
  if (type.includes('multipart/form-data')) return null;
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
}

async function readStoredJson(name) {
  try {
    const raw = await fsp.readFile(path.join(DATA_DIR, name), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[beacon] could not read ${name}: ${err.message}`);
    return null;
  }
}

/** Entity scope for the public proxy, from the same JSON files /beacon-data writes. */
async function loadHaProxySettings() {
  const [beaconSettings, dashboardLayout, familyMembers] = await Promise.all([
    readStoredJson('beacon-settings.json'),
    readStoredJson('beacon-dashboard-layout.json'),
    readStoredJson('beacon_family_members.json'),
  ]);
  return proxySettingsFromStore({
    beaconSettings: beaconSettings && typeof beaconSettings === 'object' ? beaconSettings : {},
    dashboardLayout,
    familyMembers: Array.isArray(familyMembers) ? familyMembers : [],
  });
}

/**
 * Public /api/* proxy. evaluateHaProxyPolicy runs before Home Assistant is
 * contacted. A denial is 403 JSON and the request is not forwarded.
 */
function proxyToHA(req, res) {
  proxyToHAAsync(req, res).catch((err) => {
    console.error('Proxy error:', err.message);
    rejectJson(res, 502, { error: 'Failed to reach Home Assistant' });
  });
}

async function proxyToHAAsync(req, res) {
  if (!HA_API_BASE) {
    rejectJson(res, 503, { error: 'HA_URL is not set' });
    return;
  }

  const limit = isHaMediaUpload(req.method, req.url) ? MAX_MEDIA_UPLOAD : MAX_BODY_SIZE;
  let body;
  try {
    body = await collectBody(req, limit);
  } catch (err) {
    rejectJson(res, 413, { error: err.message });
    return;
  }

  const settings = await loadHaProxySettings();
  const upstreamPath = stripSessionQuery(req.url);
  const decision = evaluateHaProxyPolicy(
    req.method,
    upstreamPath,
    parseProxyJsonBody(body, req.headers['content-type']),
    settings,
  );
  if (!decision.allowed) {
    rejectJson(res, 403, { error: 'not_allowed', detail: decision.detail });
    return;
  }

  const targetUrl = `${HA_API_BASE}${upstreamPath}`;
  const proxyReq = openHaRequest(targetUrl, {
    method: req.method,
    body,
    headers: {
      'Authorization': `Bearer ${HA_ACCESS_TOKEN}`,
      'Content-Type': req.headers['content-type'] || 'application/json',
    },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    rejectJson(res, 502, { error: 'Failed to reach Home Assistant' });
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}

/**
 * Direct HA service call — avoids proxy issues with POST body forwarding.
 * POST /beacon-action/service { domain, service, data }
 */
function handleServiceCall(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  collectBody(req).then(async (bodyBuf) => {
    try {
      const { domain, service, data, return_response } = JSON.parse((bodyBuf || '{}').toString('utf8'));
      if (!domain || !service) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing domain or service' }));
        return;
      }

      const qs = return_response ? '?return_response' : '';
      const apiPath = `/api/services/${domain}/${service}${qs}`;
      // Same allowlist as the /api proxy. This endpoint is how the add-on UI
      // calls services; it is not a server-internal haRequest.
      const decision = evaluateHaProxyPolicy('POST', apiPath, data || {}, await loadHaProxySettings());
      if (!decision.allowed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_allowed', detail: decision.detail }));
        return;
      }
      const result = await haRequest('POST', apiPath, data || {});
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.data));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

/**
 * Send one command over HA's WebSocket API and resolve with its result.
 * Used for calendar event update/delete, which HA moved off the REST
 * services API to WS-only commands (calendar/event/update, /delete) —
 * see homeassistant/components/calendar/__init__.py. Opens a short-lived
 * connection per call rather than keeping one open; call volume here is
 * low (user-triggered edits/deletes), so the extra connect/auth round
 * trip is an acceptable tradeoff for not having to manage a persistent
 * connection's lifecycle across container restarts.
 */
function haWsCommand(command, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!HA_ACCESS_TOKEN) {
      reject(new Error('No Home Assistant token available'));
      return;
    }
    if (!HA_WS_URL) {
      reject(new Error('HA_URL is not set'));
      return;
    }

    const ws = new WebSocket(HA_WS_URL);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.terminate();
      reject(new Error('Home Assistant WebSocket command timed out'));
    }, timeoutMs);

    function finish(fn, arg) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      fn(arg);
    }

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }

      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: HA_ACCESS_TOKEN }));
        return;
      }
      if (msg.type === 'auth_invalid') {
        finish(reject, new Error('Home Assistant WebSocket auth failed'));
        return;
      }
      if (msg.type === 'auth_ok') {
        ws.send(JSON.stringify({ id: 1, ...command }));
        return;
      }
      if (msg.type === 'result' && msg.id === 1) {
        if (msg.success) {
          finish(resolve, msg.result);
        } else {
          finish(reject, Object.assign(new Error(msg.error?.message || 'Home Assistant command failed'), {
            code: msg.error?.code,
          }));
        }
      }
    });

    ws.on('error', (err) => finish(reject, err));
    ws.on('close', () => {
      if (!settled) finish(reject, new Error('Home Assistant WebSocket closed unexpectedly'));
    });
  });
}

/**
 * POST /beacon-action/calendar-event
 * Body: { op: 'create'|'update'|'delete', entity_id, uid?, event? }
 * Bridges calendar event create/update/delete to HA's WS-only commands
 * (calendar/event/create, calendar/event/update, calendar/event/delete)
 * since those are no longer exposed as REST-callable services in current
 * HA core.
 */
function handleCalendarEventAction(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  collectBody(req).then(async (bodyBuf) => {
    try {
      const { op, entity_id, uid, event } = JSON.parse((bodyBuf || '{}').toString('utf8'));
      if (!op || !entity_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing op or entity_id' }));
        return;
      }
      if (op !== 'create' && op !== 'update' && op !== 'delete') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'op must be "create", "update", or "delete"' }));
        return;
      }
      if ((op === 'update' || op === 'delete') && !uid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing uid for update/delete' }));
        return;
      }
      if ((op === 'create' || op === 'update') && (!event || typeof event !== 'object')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Missing event payload for ${op}` }));
        return;
      }

      const command = op === 'create'
        ? { type: 'calendar/event/create', entity_id, event }
        : op === 'update'
        ? { type: 'calendar/event/update', entity_id, uid, event }
        : { type: 'calendar/event/delete', entity_id, uid };

      const result = await haWsCommand(command);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err) {
      // HA's ERR_NOT_SUPPORTED (calendar lacks create/update/delete support)
      // is a distinct, expected case — surface it as 501 with the code intact
      // so the UI can show "this calendar doesn't support X" instead of a
      // generic error.
      const status = err.code === 'not_supported' ? 501 : 502;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, code: err.code || null }));
    }
  }).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

/**
 * POST /beacon-action/chore-events
 * Body: { events: [{ event, data }] }
 * Fires beacon_chore_completed / beacon_all_chores_done on the HA event bus
 * with the Home Assistant token. Missing token or an HA error is logged and
 * returned as a soft failure so the chore toggle is never blocked.
 */
function handleChoreEvents(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  collectBody(req).then(async (bodyBuf) => {
    let payload;
    try {
      payload = JSON.parse((bodyBuf || '{}').toString('utf8'));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const events = acceptedChoreEvents(payload.events);
    if (!HA_ACCESS_TOKEN) {
      console.warn('[beacon] chore events skipped: no Home Assistant token');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, skipped: true, fired: 0 }));
      return;
    }

    let fired = 0;
    for (const entry of events) {
      try {
        const result = await haRequestTimed('POST', `/api/events/${entry.event}`, entry.data);
        if (result.status >= 200 && result.status < 300) fired += 1;
        else console.warn(`[beacon] ${entry.event} failed: HTTP ${result.status}`);
      } catch (err) {
        console.warn(`[beacon] ${entry.event} failed: ${err.message}`);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, fired, accepted: events.length }));
  }).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

/**
 * Persistent data API — stores JSON in /data/ (survives add-on rebuilds).
 *
 * GET  /beacon-data/:key  → read stored JSON
 * PUT  /beacon-data/:key  → write JSON body to storage
 */
async function handleDataApi(req, res) {
  // Sanitize key: only allow alphanumeric, hyphens, underscores
  const key = req.url.replace('/beacon-data/', '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!key) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing key' }));
    return;
  }

  const filePath = path.join(DATA_DIR, `${key}.json`);

  if (req.method === 'GET') {
    try {
      const data = await fsp.readFile(filePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('null');
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  if (req.method === 'PUT') {
    try {
      const bodyBuf = await collectBody(req);
      const body = (bodyBuf || '{}').toString('utf8');
      JSON.parse(body); // validate JSON
      // The first rewrite of the meal plan keeps the previous file.
      if (key === 'beacon_meal_plans') {
        try { backupMealPlanFile(DATA_DIR); } catch { /* backup is best-effort */ }
      }
      await fsp.writeFile(filePath, body, 'utf8');
      if (key === 'beacon-settings') {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch { parsed = null; }
        homeSensorGate.applySettings(parsed).catch((err) => {
          console.warn(`[beacon] home sensor selection update failed: ${err.message}`);
        });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(err.message?.includes('too large') ? 413 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

/**
 * Forward a raw body to Home Assistant without writing it to /data.
 * The media upload keeps the original multipart Content-Type.
 */
function haForward(method, apiPath, bodyBuf, contentType) {
  return new Promise((resolve, reject) => {
    if (!HA_ACCESS_TOKEN) {
      reject(new Error('No Home Assistant token available'));
      return;
    }
    if (!HA_API_BASE) {
      reject(new Error('HA_URL is not set'));
      return;
    }
    const headers = { Authorization: `Bearer ${HA_ACCESS_TOKEN}` };
    if (contentType) headers['Content-Type'] = contentType;
    const r = openHaRequest(`${HA_API_BASE}${apiPath}`, {
      method,
      body: bodyBuf,
      headers,
    }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => resolve({ status: resp.statusCode, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    if (bodyBuf) r.write(bodyBuf);
    r.end();
  });
}

const MAX_MEDIA_UPLOAD = 12 * 1024 * 1024;

/**
 * POST /beacon-action/media-upload
 * Forwards the multipart body to HA's local media upload. The bytes stay
 * in this request buffer and are never written under /data.
 */
function handleMediaUpload(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  const chunks = [];
  let total = 0;
  let rejected = false;
  req.on('data', (chunk) => {
    if (rejected) return;
    total += chunk.length;
    if (total > MAX_MEDIA_UPLOAD) {
      rejected = true;
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'This file is larger than 10 MB.' }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (rejected) return;
    const body = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
    haForward('POST', '/api/media_source/local_source/upload', body, req.headers['content-type'])
      .then((result) => {
        res.writeHead(result.status || 502, { 'Content-Type': 'application/json' });
        res.end(result.body.length > 0 ? result.body : JSON.stringify({ error: 'Empty upload response' }));
      })
      .catch((err) => {
        if (res.headersSent) return;
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
  });
  req.on('error', () => {
    if (res.headersSent) return;
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Upload failed' }));
  });
}

function handleMediaBrowse(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  collectBody(req).then(() => haWsCommand({
    type: 'media_source/browse_media',
    media_content_id: 'media-source://media_source',
  })).then((result) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result ?? {}));
  }).catch((err) => {
    if (res.headersSent) return;
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
}

function handleMediaRemove(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  collectBody(req).then(async (bodyBuf) => {
    const { media_content_id: mediaContentId } = JSON.parse((bodyBuf || '{}').toString('utf8'));
    if (typeof mediaContentId !== 'string' || !mediaContentId.startsWith('media-source://media_source/')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing local media id' }));
      return;
    }
    await haWsCommand({
      type: 'media_source/local_source/remove',
      media_content_id: mediaContentId,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }).catch((err) => {
    if (res.headersSent) return;
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
}

/**
 * Server-internal Home Assistant request. Intentionally not checked by the
 * public proxy allowlist. Voice intents, chore events, privilege sync, and
 * the server's own config read use this directly and must keep working.
 */
function haRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    if (!HA_API_BASE) {
      reject(new Error('HA_URL is not set'));
      return;
    }
    const bodyBuf = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const r = openHaRequest(`${HA_API_BASE}${apiPath}`, {
      method,
      body: bodyBuf,
      headers: {
        'Authorization': `Bearer ${HA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: resp.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: resp.statusCode, data: raw }); }
      });
    });
    r.on('error', reject);
    if (bodyBuf) r.write(bodyBuf);
    r.end();
  });
}

/** haRequest with a deadline so a hung Home Assistant call cannot stall the server. */
function haRequestTimed(method, apiPath, body, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Home Assistant request timed out')), timeoutMs);
    haRequest(method, apiPath, body).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

let haTimeZone = null;
let haTimeZoneKnown = false;

async function readHaTimeZone() {
  if (haTimeZoneKnown) return haTimeZone;
  const result = await haRequestTimed('GET', '/api/config');
  const tz = result.data && typeof result.data.time_zone === 'string' ? result.data.time_zone.trim() : '';
  // Cache a successful read, including an empty zone, so a missing field does
  // not hit /api/config every 30s. A thrown request stays uncached and retries.
  haTimeZone = tz || null;
  haTimeZoneKnown = true;
  return haTimeZone;
}

async function readJsonList(name) {
  try {
    const raw = await fsp.readFile(path.join(DATA_DIR, name), 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`${name} is not a list`);
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function readPrivilegeSnapshot() {
  const [members, chores, completions] = await Promise.all([
    readJsonList('beacon_family_members.json'),
    readJsonList('beacon_chores.json'),
    readJsonList('beacon_completions.json'),
  ]);
  return { members, chores, completions };
}

async function applyStoredPrivileges(decisions, info) {
  for (const decision of decisions) {
    try {
      const result = await haRequestTimed(
        'POST',
        `/api/services/${decision.domain}/${decision.service}`,
        { entity_id: decision.entityId },
      );
      if (result.status < 200 || result.status >= 300) {
        console.warn(`[beacon] privilege ${decision.service} ${decision.entityId} failed: HTTP ${result.status} (${info.reason})`);
      }
    } catch (err) {
      console.warn(`[beacon] privilege ${decision.service} ${decision.entityId} failed: ${err.message} (${info.reason})`);
    }
  }
  if (decisions.length > 0) {
    console.log(`[beacon] privilege sync (${info.reason}) ${info.localDate}: ${decisions.map((decision) => `${decision.entityId}=${decision.service}`).join(', ')}`);
  }
}

// Re-apply privilege switches at startup and when the chore day changes.
// The day starts at choresResetTime (local midnight when unset), in Home
// Assistant's time_zone when /api/config answers, and otherwise in the
// add-on process zone. It is never the UTC date.
const privilegeTick = createPrivilegeScheduler({
  now: () => new Date(),
  getTimeZone: readHaTimeZone,
  getResetTime: () => readStoredResetTime(DATA_DIR),
  readSnapshot: readPrivilegeSnapshot,
  apply: applyStoredPrivileges,
  hasToken: () => !!HA_ACCESS_TOKEN,
  log: (message) => console.warn(message),
});

async function publishStoredChoreEvents(events) {
  if (!HA_ACCESS_TOKEN) {
    console.warn('[beacon] chore events skipped: no Home Assistant token');
    return;
  }
  for (const entry of events) {
    try {
      const result = await haRequestTimed('POST', `/api/events/${entry.event}`, entry.data);
      if (result.status < 200 || result.status >= 300) {
        console.warn(`[beacon] ${entry.event} failed: HTTP ${result.status}`);
      }
    } catch (err) {
      console.warn(`[beacon] ${entry.event} failed: ${err.message}`);
    }
  }
}

/**
 * Complete a FamilyStore chore from a voice phrase or the complete-chore
 * endpoint. Writes beacon_completions.json, then fires the same events and
 * privilege service calls as a toggle on the wall.
 */
function completeChoreDeps() {
  return {
    dataDir: DATA_DIR,
    now: () => new Date(),
    readTimeZone: async () => {
      try {
        return await readHaTimeZone();
      } catch {
        return null;
      }
    },
    readResetTime: () => readStoredResetTime(DATA_DIR),
    publishEvents: publishStoredChoreEvents,
    applyPrivileges: (decisions) => applyStoredPrivileges(decisions, { reason: 'voice', localDate: '' }),
    log: (message) => console.warn(message),
  };
}

function runCompleteChore(chore, name) {
  return completeStoredChore(completeChoreDeps(), { chore, name });
}

function handleCompleteChoreFromServer(req, res) {
  handleCompleteChore(req, res, completeChoreDeps());
}

function handleChoresLeftFromServer(req, res) {
  handleChoresLeft(req, res, completeChoreDeps());
}

/**
 * POST /beacon-action/voice
 * Body: { "text": "add milk to the grocery list" }
 * Returns: { "response": "...", "action": "...", "success": true|false }
 */
function handleVoiceAction(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const { text } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!text || typeof text !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or invalid "text" field' }));
        return;
      }

      const intent = parseIntent(text.trim());

      // Cache states for the duration of this request (avoids 4x /api/states calls)
      let _cachedStates = null;
      async function getStates() {
        if (!_cachedStates) _cachedStates = haRequest('GET', '/api/states').then(r => r.data || []);
        return _cachedStates;
      }

      if (!intent) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          response: "Sorry, I didn't understand that.",
          action: null,
          success: false,
        }));
        return;
      }

      // --- Beacon chore (FamilyStore, not todo.chores) ---
      if (intent.name === 'chores_left') {
        try {
          const result = await listStoredChores(completeChoreDeps(), intent.memberName || '');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            response: `Couldn't read the chore chart: ${err.message}`,
            action: 'chores_left',
            success: false,
          }));
        }
        return;
      }

      if (intent.name === 'complete_chore') {
        try {
          const result = await runCompleteChore(intent.chore, intent.memberName || '');
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.body));
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            response: `Couldn't complete that chore: ${err.message}`,
            action: 'complete_chore',
            success: false,
          }));
        }
        return;
      }

      // --- Navigation intent (no HA call needed) ---
      if (intent.navigation) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          response: intent.response,
          action: 'navigate',
          view: intent.view,
          success: true,
        }));
        return;
      }

      // --- Calendar fetch ---
      if (intent.fetch === 'calendar') {
        try {
          // Get all calendar entities
          const states = await getStates();
          const calendars = states.filter(
            (e) => typeof e.entity_id === 'string' && e.entity_id.startsWith('calendar.')
          );

          const now = new Date();
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

          const calResults = await Promise.all(
            calendars.map(async (cal) => {
              try {
                const evResp = await haRequest(
                  'GET',
                  `/api/calendars/${cal.entity_id}?start=${encodeURIComponent(startOfDay)}&end=${encodeURIComponent(endOfDay)}`
                );
                if (Array.isArray(evResp.data)) {
                  return evResp.data.map((ev) => ({ calendar: cal.attributes?.friendly_name || cal.entity_id, ...ev }));
                }
              } catch { /* skip unavailable calendars */ }
              return [];
            })
          );
          const allEvents = calResults.flat();

          const summary = allEvents.length === 0
            ? 'No events on your calendar today.'
            : `You have ${allEvents.length} event${allEvents.length > 1 ? 's' : ''} today: ${allEvents.map((e) => e.summary || 'Untitled').join(', ')}.`;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            response: summary,
            action: 'calendar',
            events: allEvents,
            success: true,
          }));
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ response: 'Failed to fetch calendar.', action: 'calendar', success: false, error: err.message }));
        }
        return;
      }

      // --- Weather fetch ---
      if (intent.fetch === 'weather') {
        try {
          const states = await getStates();
          const weatherEntity = states.find(
            (e) => typeof e.entity_id === 'string' && e.entity_id.startsWith('weather.')
          );
          if (!weatherEntity) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: 'No weather entity found.', action: 'weather', success: false }));
            return;
          }
          const attrs = weatherEntity.attributes || {};
          const temp = attrs.temperature != null ? `${attrs.temperature}${attrs.temperature_unit || ''}` : '';
          const condition = weatherEntity.state || '';
          const summary = `Currently ${condition}${temp ? `, ${temp}` : ''}.`;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            response: summary,
            action: 'weather',
            entity: weatherEntity.entity_id,
            state: weatherEntity.state,
            attributes: attrs,
            success: true,
          }));
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ response: 'Failed to fetch weather.', action: 'weather', success: false, error: err.message }));
        }
        return;
      }

      // --- Service call intents (add_item, complete_item, media, volume) ---
      // For todo intents, resolve the entity_id from the hint
      let entityId = null;
      if (intent.domain === 'todo' && intent.entityHint) {
        try {
          const states = await getStates();
          entityId = resolveTodoEntity(states, intent.entityHint);
        } catch { /* proceed without entity */ }
      }

      // For media_player, find the first active media player
      if (intent.domain === 'media_player' && !entityId) {
        try {
          const states = await getStates();
          const players = states.filter(
            (e) => typeof e.entity_id === 'string' && e.entity_id.startsWith('media_player.')
          );
          // Prefer one that's playing, then paused, then any
          const playing = players.find((e) => e.state === 'playing');
          const paused = players.find((e) => e.state === 'paused');
          entityId = (playing || paused || players[0])?.entity_id || null;
        } catch { /* proceed without entity */ }
      }

      const serviceData = { ...intent.data };
      if (entityId) serviceData.entity_id = entityId;

      try {
        const qs = intent.domain === 'todo' ? '?return_response' : '';
        let resp = await haRequest('POST', `/api/services/${intent.domain}/${intent.service}${qs}`, serviceData);

        // Fallback chain for media controls: try media_play_pause, then toggle
        if (resp.status >= 400 && intent.domain === 'media_player' &&
            ['media_play', 'media_pause', 'media_next_track'].includes(intent.service)) {
          resp = await haRequest('POST', `/api/services/media_player/media_play_pause`, serviceData);
          if (resp.status >= 400) {
            resp = await haRequest('POST', `/api/services/media_player/toggle`, serviceData);
          }
        }

        const ok = resp.status >= 200 && resp.status < 300;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          response: ok ? intent.response : `Action failed (${resp.status}).`,
          action: intent.name,
          entity_id: entityId,
          success: ok,
        }));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          response: `Action failed: ${err.message}`,
          action: intent.name,
          success: false,
        }));
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];

  // Session or verified ingress. The Home Assistant proxy allowlist, when
  // present, still applies inside /api/* after this gate.
  if (classifyPath(pathname) === 'protected') {
    if (!requireSession(req, res)) return;
  }

  if (pathname === '/health') {
    handleHealth(req, res);
    return;
  }
  if (pathname === '/beacon-auth/pair') {
    handlePair(req, res);
    return;
  }
  if (pathname === '/beacon-auth/session') {
    handleSessionStatus(req, res);
    return;
  }
  if (pathname === '/beacon-auth/devices') {
    handleDeviceList(req, res);
    return;
  }
  if (pathname === '/beacon-auth/devices/revoke') {
    handleDeviceRevoke(req, res);
    return;
  }
  if (pathname === '/beacon-auth/pairing-code') {
    handlePairingCodeRegenerate(req, res);
    return;
  }
  if (pathname === '/beacon-auth/access-tokens') {
    handleAccessTokenCreate(req, res);
    return;
  }

  // Voice / natural-language action API
  if (req.url === '/beacon-action/voice') {
    handleVoiceAction(req, res);
    return;
  }

  // Complete a Beacon chore in FamilyStore (used by HA Assist intents).
  if (req.url.split('?')[0] === '/beacon-action/complete-chore') {
    handleCompleteChoreFromServer(req, res);
    return;
  }

  // Remaining chores on today's chart (used by HA Assist and the voice API).
  if (req.url.split('?')[0] === '/beacon-action/chores-left') {
    handleChoresLeftFromServer(req, res);
    return;
  }

  // Local media upload for AI Task attachments. Not under /api, so ingress
  // does not rewrite the multipart body. The handler does not touch /data.
  const mediaPath = req.url.split('?')[0];
  if (mediaPath === '/beacon-action/media-upload') {
    handleMediaUpload(req, res);
    return;
  }
  if (mediaPath === '/beacon-action/media-browse') {
    handleMediaBrowse(req, res);
    return;
  }
  if (mediaPath === '/beacon-action/media-remove') {
    handleMediaRemove(req, res);
    return;
  }

  // Service call API (avoids ingress POST issues)
  if (req.url === '/beacon-action/service') {
    handleServiceCall(req, res);
    return;
  }

  // Chore completion events for Home Assistant automations
  if (req.url === '/beacon-action/chore-events') {
    handleChoreEvents(req, res);
    return;
  }

  // Calendar event update/delete (WS-only commands in current HA core)
  if (req.url === '/beacon-action/calendar-event') {
    handleCalendarEventAction(req, res);
    return;
  }

  // Persistent data API
  if (req.url.startsWith('/beacon-data/')) {
    handleDataApi(req, res);
    return;
  }

  // Home sensors picker. Metadata only; same reachability as settings writes.
  if ((req.url || '').split('?')[0] === '/beacon-api/home-sensors/entities') {
    handleHomeSensorEntities(req, res, {
      fetchStates: async () => {
        const result = await haRequestTimed('GET', '/api/states');
        if (!result || result.status !== 200 || !Array.isArray(result.data)) {
          throw new Error('Home Assistant states unavailable');
        }
        return result.data;
      },
    }).catch((err) => {
      console.warn(`[beacon] home sensor catalog failed: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Home Assistant states unavailable' }));
      }
    });
    return;
  }

  // Google Photos shared-album cache. The browser never calls Google.
  if (req.url.startsWith('/beacon-api/google-photos')) {
    googlePhotos.handle(req, res);
    return;
  }

  // Proxy API requests to HA
  if (req.url.startsWith('/api/')) {
    if (HA_ACCESS_TOKEN) {
      proxyToHA(req, res);
    } else {
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'No Home Assistant token available' }));
    }
    return;
  }

  serveStatic(req, res);
});

// /beacon-ws/ha is the home-sensor bridge: the server authenticates upstream
// and only forwards the read commands that bridge allows.
// /api/websocket is a raw pass-through. The server token is not attached
// there; the browser authenticates itself after auth_required.
// Both require a paired session or a verified ingress connection.
server.on('upgrade', (req, socket, head) => {
  const pathOnly = (req.url || '').split('?')[0];
  let auth = null;
  if (classifyPath(pathOnly) === 'protected') {
    auth = establishedSession(req);
    if (!auth.ok) {
      denyUpgrade(socket);
      return;
    }
    if (auth.session) deviceSockets.track(auth.session.id, socket);
  }
  if (pathOnly === '/beacon-ws/ha') {
    if (!HA_ACCESS_TOKEN || !HA_WS_URL) {
      socket.destroy();
      return;
    }
    haBridgeServer.handleUpgrade(req, socket, head, (browserWs) => {
      if (auth && auth.session) deviceSockets.track(auth.session.id, browserWs);
      attachHaWsBridge(browserWs, {
        url: HA_WS_URL,
        token: HA_ACCESS_TOKEN,
        WebSocketImpl: WebSocket,
        allowedEntityIds: () => homeSensorGate.allowedEntityIds(),
        registerDeliver: (deliver) => homeSensorGate.watch(deliver),
      });
    });
    return;
  }

  if (!req.url.startsWith('/api/websocket') || !HA_ACCESS_TOKEN || !HA_API_BASE) {
    socket.destroy();
    return;
  }

  const target = describeHaHttpTarget(`${HA_API_BASE}${stripSessionQuery(req.url)}`);
  const lib = target.secure ? https : http;
  const defaultPort = target.secure ? 443 : 80;
  const proxyReq = lib.request({
    hostname: target.hostname,
    port: target.port,
    path: target.path,
    method: 'GET',
    headers: {
      ...headersForUpstream(req),
      host: target.port === defaultPort ? target.hostname : `${target.hostname}:${target.port}`,
    },
  });
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n'
    );
    if (proxyHead.length > 0) socket.write(proxyHead);

    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  });

  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
});

function startBackgroundJobs() {
  if (process.env.BEACON_DISABLE_JOBS === '1') return;
  // Fill the photo cache soon after boot, then every 6 hours. A failed
  // refresh keeps the files already on disk.
  const googlePhotoBoot = setTimeout(() => {
  googlePhotos.refresh().catch((err) => {
    console.warn(`Google Photos refresh failed: ${err.message}`);
  });
}, 15_000);
const googlePhotoTimer = setInterval(() => {
  googlePhotos.refresh().catch((err) => {
    console.warn(`Google Photos refresh failed: ${err.message}`);
  });
}, REFRESH_MS);
googlePhotoBoot.unref?.();
googlePhotoTimer.unref?.();

// Privilege switches: once shortly after boot (so today's chores survive a
// restart) and every 30s thereafter, which is what notices the chore reset.
const privilegeBoot = setTimeout(() => {
  privilegeTick().catch((err) => console.warn(`[beacon] privilege sync failed: ${err.message}`));
}, 15_000);
const privilegeTimer = setInterval(() => {
  privilegeTick().catch((err) => console.warn(`[beacon] privilege sync failed: ${err.message}`));
}, 30_000);
  privilegeBoot.unref?.();
  privilegeTimer.unref?.();
}

function startBeaconServer() {
  warnIfBrowserTokenSet();
  return sessionStore.load().then((code) => {
    console.log(`Beacon pairing code: ${code}`);
    server.listen(PORT, () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : PORT;
      console.log(`Beacon server listening on port ${port}`);
      console.log(`Mode: ${HA_MODE === 'addon' ? 'add-on' : 'standalone'}`);
      console.log(`Home Assistant token: ${HA_ACCESS_TOKEN ? 'available' : 'NOT available'}`);
      console.log(`Data directory: ${DATA_DIR}`);
      const configError = standaloneConfigError(haConnection);
      if (configError) console.error(configError);
    });
    startBackgroundJobs();
    return server;
  }).catch((err) => {
    console.error(`[beacon] failed to start: ${err.message}`);
    process.exit(1);
  });
}

if (require.main === module) {
  startBeaconServer();
}
