#!/usr/bin/env node
/**
 * Beacon add-on server.
 *
 * - Serves the static SPA from /app/dist
 * - Proxies the app's permitted HA API calls using a server-only token
 * - Provides /beacon-data/* for persistent storage (survives rebuilds)
 * - Runs the Google Tasks chores sync (chores-sync.cjs)
 *
 * The HA token can have admin rights. In add-on mode only HA ingress may
 * connect; standalone mode requires a separate browser password. A parent
 * session and an entity allowlist gate privileged actions in both modes.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { createHash, randomBytes, scryptSync, timingSafeEqual } = require('crypto');
const WebSocket = require('ws');
const {
  isServiceAllowed,
  isProxyRequestAllowed,
  isTrustedIngressAddress,
  parseAllowedEntities,
  isEntityAllowed,
  isServiceTargetAllowed,
  isCrossOriginWrite,
  describeRequester,
} = require('./server-guards.cjs');
const { createChoresSync, dayKeyFormatter } = require('./chores-sync.cjs');

const PORT = Number(process.env.BEACON_PORT) || 3000;
const DIST = process.env.BEACON_DIST || '/app/dist';
const IS_ADDON = Boolean(process.env.SUPERVISOR_TOKEN);
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || process.env.HA_TOKEN || '';
const HOST = IS_ADDON ? '0.0.0.0' : (process.env.BEACON_HOST || '127.0.0.1');
const PARENT_PIN = process.env.BEACON_PARENT_PIN || '';
const BEACON_PASSWORD = process.env.BEACON_PASSWORD || '';
const ALLOWED_ENTITIES = parseAllowedEntities(process.env.BEACON_ALLOWED_ENTITIES);

if (process.env.SUPERVISOR_TOKEN && process.env.HA_TOKEN) {
  throw new Error('Set SUPERVISOR_TOKEN only in the add-on, or HA_TOKEN only in standalone mode');
}
if (!/^\d{6,8}$/.test(PARENT_PIN)) {
  throw new Error('Configure BEACON_PARENT_PIN as a 6-8 digit parent PIN before starting Family');
}
if (!IS_ADDON && BEACON_PASSWORD.length < 16) {
  throw new Error('Standalone mode requires BEACON_PASSWORD (at least 16 characters)');
}
if (!IS_ADDON && Boolean(process.env.HA_URL) !== Boolean(process.env.HA_TOKEN)) {
  throw new Error('Standalone HA access requires both HA_URL and HA_TOKEN');
}

const haBase = IS_ADDON ? 'http://supervisor/core' : process.env.HA_URL?.replace(/\/+$/, '');
if (haBase) {
  const parsed = new URL(haBase);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('HA_URL must be an http(s) URL without credentials, query or fragment');
  }
}
const HA_API_BASE = process.env.HA_API_BASE_OVERRIDE || haBase || '';
const haWebsocketUrl = HA_API_BASE ? new URL(`${HA_API_BASE}/api/websocket`) : null;
if (haWebsocketUrl) haWebsocketUrl.protocol = haWebsocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
const HA_WS_URL = process.env.HA_WS_URL_OVERRIDE || haWebsocketUrl?.toString() || '';
const haHttpClient = (url) => url.protocol === 'https:' ? https : http;
// /data/ is HA add-on persistent storage (survives container rebuilds)
const DATA_DIR = process.env.BEACON_DATA || '/data';

const PARENT_SESSION_MS = 10 * 60 * 1000;
const DISPLAY_SESSION_MS = 24 * 60 * 60 * 1000;
const PIN_LOCK_MS = 15 * 60 * 1000;
const MAX_SESSIONS = 1024;
const SESSION_COOKIE = 'beacon_session';
const parentPinDigest = createHash('sha256').update(PARENT_PIN).digest();
const passwordDigest = createHash('sha256').update(`beacon:${BEACON_PASSWORD}`).digest();
const sessions = new Map();
const pinAttempts = new Map();

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function isStandaloneAuthenticated(req) {
  const header = req.headers.authorization || '';
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(header);
  if (!match || match[1].length > 1024) return false;
  const provided = Buffer.from(match[1], 'base64');
  const digest = createHash('sha256').update(provided).digest();
  return timingSafeEqual(digest, passwordDigest);
}

function requesterIdentity(req) {
  if (!IS_ADDON) return 'standalone';
  const user = req.headers['x-remote-user-id'];
  const ingress = req.headers['x-ingress-path'];
  if (!user && !ingress) return '';
  return JSON.stringify([user || '', ingress || '']);
}

function sessionPath(req) {
  if (!IS_ADDON) return '/';
  const ingress = req.headers['x-ingress-path'];
  if (typeof ingress === 'string' && /^\/api\/hassio_ingress\/[A-Za-z0-9_-]+\/?$/.test(ingress)) {
    return ingress.replace(/\/$/, '');
  }
  return '/';
}

function setSessionCookie(req, res, token, maxAge) {
  const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=${sessionPath(req)}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
}

function readSession(req) {
  const cookie = req.headers.cookie?.match(/(?:^|;\s*)beacon_session=([a-f0-9]{64})(?:;|$)/);
  if (!cookie) return null;
  const key = createHash('sha256').update(cookie[1]).digest('hex');
  const session = sessions.get(key);
  if (!session) return null;
  if (session.expiresAt <= Date.now() || session.identity !== requesterIdentity(req)) {
    sessions.delete(key);
    return null;
  }
  return { ...session, token: cookie[1] };
}

function issueSession(req, res, role, memberId) {
  const identity = requesterIdentity(req);
  if (!identity) throw new Error('Missing trusted ingress identity');
  const token = randomBytes(32).toString('hex');
  const lifetime = role === 'parent' ? PARENT_SESSION_MS : DISPLAY_SESSION_MS;
  const old = readSession(req);
  if (old) sessions.delete(createHash('sha256').update(old.token).digest('hex'));
  if (sessions.size >= MAX_SESSIONS) {
    for (const [key, session] of sessions) {
      if (session.expiresAt <= Date.now()) sessions.delete(key);
    }
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  }
  sessions.set(createHash('sha256').update(token).digest('hex'), {
    identity, role, memberId, expiresAt: Date.now() + lifetime,
  });
  setSessionCookie(req, res, token, Math.floor(lifetime / 1000));
  return { role, ...(memberId ? { memberId } : {}) };
}

function revokeMemberSessions(memberId) {
  for (const [key, session] of sessions) {
    if (session.memberId === memberId) sessions.delete(key);
  }
}

function pinIsRateLimited(identity, limit = 5) {
  const attempt = pinAttempts.get(identity);
  if (!attempt) return false;
  if (Date.now() >= attempt.until) {
    pinAttempts.delete(identity);
    return false;
  }
  return attempt.count >= limit;
}

function failedPin(identity) {
  if (pinAttempts.size >= MAX_SESSIONS && !pinAttempts.has(identity)) {
    for (const [key, attempt] of pinAttempts) {
      if (Date.now() >= attempt.until) pinAttempts.delete(key);
    }
    if (pinAttempts.size >= MAX_SESSIONS) pinAttempts.delete(pinAttempts.keys().next().value);
  }
  const previous = pinAttempts.get(identity);
  pinAttempts.set(identity, {
    count: (previous?.count || 0) + 1,
    until: previous?.until > Date.now() ? previous.until : Date.now() + PIN_LOCK_MS,
  });
}

function hashMemberPin(pin) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`;
}

function matchesMemberPin(pin, stored) {
  if (typeof stored !== 'string') return false;
  const match = /^([a-f0-9]{32}):([a-f0-9]{64})$/.exec(stored);
  if (!match) throw storageError('A member PIN hash is invalid');
  return timingSafeEqual(scryptSync(pin, match[1], 32), Buffer.from(match[2], 'hex'));
}

function publicMember(member) {
  const { pin, pin_hash, has_pin, ...safe } = member;
  return { ...safe, has_pin: typeof pin_hash === 'string' };
}

function memberPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('Member must be an object'), { status: 400 });
  }
  if ('pin_hash' in body || 'has_pin' in body) {
    throw Object.assign(new Error('PIN hashes are server-managed'), { status: 400 });
  }
  const { pin, ...member } = body;
  if (pin !== undefined) {
    if (pin !== '' && (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin))) {
      throw Object.assign(new Error('Member PIN must have 4-8 digits'), { status: 400 });
    }
    member.pin_hash = pin ? hashMemberPin(pin) : null;
  }
  if (member.role !== undefined && member.role !== 'parent' && member.role !== 'child') {
    throw Object.assign(new Error('Invalid member role'), { status: 400 });
  }
  return member;
}

function setSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', IS_ADDON ? "frame-ancestors 'self'" : "frame-ancestors 'none'");
  res.setHeader('X-Frame-Options', IS_ADDON ? 'SAMEORIGIN' : 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

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

// Storage is required for authenticated sessions' data to be authoritative.
fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * Caching for the built app. Vite puts a content hash in every file name
 * under /assets, so those never change and can be cached for a year — a
 * new build references new names. Everything else (index.html, the
 * runtime-config.js written at startup, icons, manifest) is revalidated
 * on each load with its ETag, which costs a tiny 304 when unchanged.
 * Compression isn't done here: HA's ingress proxy compresses responses
 * on the way to the browser.
 */
function cacheControlFor(filePath) {
  const rel = path.relative(DIST, filePath).split(path.sep).join('/');
  return rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
}

async function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(DIST, urlPath === '/' ? '/index.html' : urlPath);

  // Path traversal guard
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(DIST) + path.sep) && resolved !== path.resolve(DIST)) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(filePath);
    if (stat.isDirectory()) throw new Error('directory');
  } catch {
    filePath = path.join(DIST, 'index.html');
    stat = await fsp.stat(filePath).catch(() => null);
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const headers = { 'Content-Type': contentType, 'Cache-Control': cacheControlFor(filePath) };

  // Weak validator from size + mtime: changes whenever a new build is
  // deployed or run.sh rewrites runtime-config.js / index.html at startup.
  if (stat) {
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    headers.ETag = etag;
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch.split(/\s*,\s*/).includes(etag)) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
  }

  try {
    const data = await fsp.readFile(filePath);
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

/**
 * Collect request body into a Buffer with size limit (default 1MB). Null
 * for a request that sent no body. A request that fails or closes before
 * its end (the device lost power or Wi-Fi mid-upload) rejects: it used to
 * resolve as an empty body, and a save then replaced the stored file with
 * {} (every display's settings, say).
 */
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
function collectBody(req, maxSize = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    req.on('data', (c) => {
      total += c.length;
      if (total > maxSize) {
        req.destroy();
        fail(new Error('Request body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(chunks.length > 0 ? Buffer.concat(chunks) : null);
    });
    req.on('error', () => fail(new Error('Request body incomplete')));
    // 'close' also follows a normal 'end', when it's already settled.
    req.on('close', () => fail(new Error('Request body incomplete')));
  });
}

function proxyToHA(req, res) {
  const targetUrl = `${HA_API_BASE}${req.url}`;

  collectBody(req).then((body) => {
    const pathname = req.url.split('?')[0];
    const entityPath = /^\/api\/(states|calendars)\/([a-z0-9_]+\.[a-z0-9_]+)$/.exec(pathname);
    if (entityPath && !isEntityAllowed(entityPath[2], ALLOWED_ENTITIES,
      entityPath[1] === 'calendars' ? 'calendar' : undefined)) {
      sendJson(res, 403, { error: 'Entity not allowed' });
      return;
    }
    if (req.method === 'POST') {
      let data;
      try {
        data = JSON.parse(body?.toString('utf8') || '');
      } catch {
        sendJson(res, 400, { error: 'Invalid service request body' });
        return;
      }
      const service = /^\/api\/services\/([a-z0-9_]+)\/([a-z0-9_]+)$/.exec(pathname);
      if (!service || !isServiceTargetAllowed(service[1], data, ALLOWED_ENTITIES)) {
        sendJson(res, 403, { error: 'Service entity not allowed' });
        return;
      }
    }

    const url = new URL(targetUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: req.method,
      headers: {
        'Authorization': `Bearer ${SUPERVISOR_TOKEN}`,
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
    };

    if (body) {
      options.headers['Content-Length'] = body.length;
    }

    const proxyReq = haHttpClient(url).request(options, (proxyRes) => {
      const listDomain = req.method === 'GET' && proxyRes.statusCode === 200
        && (pathname === '/api/states' || pathname === '/api/calendars');
      if (!listDomain) {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
          'Cache-Control': 'no-store',
        });
        proxyRes.pipe(res);
        return;
      }
      const chunks = [];
      let size = 0;
      proxyRes.on('data', (chunk) => {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) {
          proxyRes.destroy(new Error('HA entity list too large'));
          return;
        }
        chunks.push(chunk);
      });
      proxyRes.on('end', () => {
        try {
          const items = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!Array.isArray(items)) throw new Error('HA entity list was not an array');
          sendJson(res, 200, items.filter((item) =>
            isEntityAllowed(item?.entity_id, ALLOWED_ENTITIES,
              pathname === '/api/calendars' ? 'calendar' : undefined)));
        } catch (err) {
          console.error('Invalid Home Assistant entity list:', err);
          sendJson(res, 502, { error: 'Invalid Home Assistant entity list' });
        }
      });
      proxyRes.on('error', (err) => {
        console.error('Home Assistant entity list error:', err);
        if (!res.headersSent) sendJson(res, 502, { error: 'Failed to read Home Assistant entities' });
      });
    });

    proxyReq.setTimeout(60_000, () => proxyReq.destroy(new Error('Home Assistant request timed out')));
    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      // Once the answer has started, a second writeHead would throw.
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Failed to reach Home Assistant' }));
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  }).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

/** One line in the add-on log per to-do delete: which list, why, and who asked. */
function logTodoDelete(data, reason, from) {
  console.log(
    `[todo-delete] ${data?.entity_id} item=${JSON.stringify(data?.item)} ` +
    `reason=${reason || 'none given (older build?)'} ` +
    `from=${from}`,
  );
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
      const { domain, service, data, return_response, reason } = JSON.parse((bodyBuf || '{}').toString('utf8'));
      if (!domain || !service) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing domain or service' }));
        return;
      }

      if (!isServiceAllowed(domain, service)) {
        console.warn(
          `[blocked] service ${JSON.stringify(`${domain}.${service}`)} is not one Family uses; ` +
          describeRequester(req.headers),
        );
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Service ${domain}.${service} is not allowed` }));
        return;
      }

      if (!isServiceTargetAllowed(domain, data, ALLOWED_ENTITIES)) {
        sendJson(res, 403, { error: 'Service entity not allowed' });
        return;
      }

      // Log every to-do delete with the requesting device, so deletes coming
      // from a device still running an older build can be traced.
      if (domain === 'todo' && service === 'remove_item') {
        logTodoDelete(data, reason, req.headers['user-agent'] || 'unknown device');
      }

      const qs = return_response ? '?return_response' : '';
      const result = await haRequest('POST', `/api/services/${domain}/${service}${qs}`, data || {});
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
 * Diagnostic report from the chores sync, written to the add-on log so it
 * can be read in HA (Settings → Add-ons → Family → Log). Only sent by
 * builds that ran the sync in the browser; the add-on's own sync logs
 * directly (see /beacon-action/chores-sync).
 * POST /beacon-action/log { lines: string[] }
 */
function handleClientLog(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  collectBody(req, 64 * 1024).then((bodyBuf) => {
    try {
      const { lines } = JSON.parse((bodyBuf || '{}').toString('utf8'));
      if (Array.isArray(lines)) {
        const from = req.headers['user-agent'] || 'unknown device';
        console.log(`[chores-sync] report from ${from}`);
        for (const line of lines.slice(0, 500)) console.log(`[chores-sync]   ${String(line).slice(0, 500)}`);
      }
      res.writeHead(204);
      res.end();
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  }).catch(() => {
    if (!res.headersSent) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too large' }));
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
    if (!SUPERVISOR_TOKEN) {
      reject(new Error('No server-side Home Assistant token available'));
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
        ws.send(JSON.stringify({ type: 'auth', access_token: SUPERVISOR_TOKEN }));
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
 * Body: { op: 'create'|'update'|'delete', entity_id, uid?, event?, recurrence_id?, recurrence_range? }
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
      const { op, entity_id, uid, event, recurrence_id, recurrence_range } = JSON.parse((bodyBuf || '{}').toString('utf8'));
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
      if (!isEntityAllowed(entity_id, ALLOWED_ENTITIES, 'calendar')) {
        sendJson(res, 403, { error: 'Calendar entity not allowed' });
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

      // recurrence_id (and recurrence_range "THISANDFUTURE") pick
      // occurrences of a repeating event; without them HA changes them all.
      const occurrence = {};
      if (typeof recurrence_id === 'string' && recurrence_id) occurrence.recurrence_id = recurrence_id;
      if (typeof recurrence_range === 'string' && recurrence_range) occurrence.recurrence_range = recurrence_range;
      const command = op === 'create'
        ? { type: 'calendar/event/create', entity_id, event }
        : op === 'update'
        ? { type: 'calendar/event/update', entity_id, uid, ...occurrence, event }
        : { type: 'calendar/event/delete', entity_id, uid, ...occurrence };

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
 * POST /beacon-action/media-source
 * Body: { op: 'browse'|'resolve', media_content_id?: string }
 * Bridges media_source browse/resolve to HA's WS-only commands
 * (media_source/browse_media, media_source/resolve_media) since neither
 * is exposed as a REST-callable endpoint in HA core — both are
 * websocket_api-only (see homeassistant/components/media_source/__init__.py).
 */
function handleMediaSourceAction(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  collectBody(req).then(async (bodyBuf) => {
    try {
      const { op, media_content_id } = JSON.parse((bodyBuf || '{}').toString('utf8'));
      if (op !== 'browse' && op !== 'resolve') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'op must be "browse" or "resolve"' }));
        return;
      }

      const command = op === 'browse'
        ? { type: 'media_source/browse_media', ...(media_content_id ? { media_content_id } : {}) }
        : { type: 'media_source/resolve_media', media_content_id };

      if (op === 'resolve' && !media_content_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing media_content_id for resolve' }));
        return;
      }

      const result = await haWsCommand(command);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
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
 * Server-side atomic collection API — fixes the multi-device race where
 * two clients each fetch a whole array, modify their own copy, and save
 * it back: whichever save lands second silently overwrites the first's
 * changes, since there's no merge, just whole-array replacement.
 *
 * Moving the read-modify-write here instead lets us serialize it per
 * collection (collectionLocks below), so only one add/update/delete runs
 * at a time for a given collection regardless of how many devices are
 * writing concurrently — the fundamental fix, not just a reliability
 * improvement on delivery.
 *
 * Uses the exact same on-disk file convention as the older /beacon-data/
 * endpoint (DATA_DIR/<key>.json holding a JSON array), so existing data
 * is picked up automatically — no migration step needed.
 *
 * GET    /beacon-collection/:name        → the whole array
 * POST   /beacon-collection/:name        → add one item (body = item minus id; server assigns id)
 * PUT    /beacon-collection/:name/:id    → merge-patch one item by id
 * DELETE /beacon-collection/:name/:id    → remove one item by id
 */
const collectionLocks = new Map(); // collection name -> promise chain (serializes writes)

function withCollectionLock(name, fn) {
  const prev = collectionLocks.get(name) || Promise.resolve();
  const settle = () => {};
  const next = prev.then(fn, fn); // run fn regardless of the previous op's outcome
  collectionLocks.set(name, next.then(settle, settle));
  return next;
}

function collectionFilePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

/**
 * Keys the collection API owns (each holds a JSON array). The data API shares
 * the same DATA_DIR/<key>.json files, so it must refuse to write these: a
 * non-array body sent to /beacon-data/<one of these> would make every
 * /beacon-collection read of it answer 500 for the whole family and stall the
 * chores sync, until the file was fixed by hand.
 */
const COLLECTION_KEYS = new Set([
  'beacon_family_members',
  'beacon_chores',
  'beacon_completions',
  'beacon_streaks',
  'beacon_routines',
  'beacon_routine_completions',
  'beacon_dashboard_views',
  'beacon_chores_sync_links',
  'beacon_routine_sync_links',
]);

// A stored key is at most this long, and once this many distinct keys exist no
// new ones are created — so a client can't flood /data with files (or grow the
// in-memory maps and the /beacon-action/changes payload) with arbitrary keys.
const MAX_KEY_LENGTH = 64;
const MAX_STORED_KEYS = 512;

/** Keys already on disk, read once, so a new key can be told from an existing
 *  one without a stat on every write. */
let storedKeysPromise = null;
function knownStoredKeys() {
  if (!storedKeysPromise) {
    storedKeysPromise = fsp.readdir(DATA_DIR).then((entries) =>
      new Set(entries.filter((entry) => entry.endsWith('.json'))
        .map((entry) => entry.slice(0, -'.json'.length)))).catch((err) => {
      storedKeysPromise = null;
      throw storageError(`couldn't list stored keys: ${err.message}`);
    });
  }
  return storedKeysPromise;
}

/** Rejects (400) an over-long key, or a brand-new key once the cap is reached. */
async function assertWritableKey(key) {
  if (key.length > MAX_KEY_LENGTH) {
    throw Object.assign(new Error('key too long'), { status: 400 });
  }
  const keys = await knownStoredKeys();
  if (!keys.has(key)) {
    if (keys.size >= MAX_STORED_KEYS - 32) {
      try {
        for (const entry of await fsp.readdir(DATA_DIR)) {
          if (entry.endsWith('.json')) keys.add(entry.slice(0, -'.json'.length));
        }
      } catch (err) {
        throw storageError(`couldn't refresh stored keys: ${err.message}`);
      }
    }
    if (keys.has(key)) return false;
    if (keys.size >= MAX_STORED_KEYS) {
      throw Object.assign(new Error('too many stored keys'), { status: 400 });
    }
    keys.add(key);
    return true;
  }
  return false;
}

/**
 * Write a data file atomically: write a temporary file next to it, then
 * rename it over the original. A rename is atomic on the same filesystem,
 * so a crash or power loss mid-write leaves either the old file or the new
 * one — never a half-written file that would parse as garbage.
 */
async function writeFileAtomic(filePath, contents) {
  const tmpPath = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    await fsp.writeFile(tmpPath, contents, 'utf8');
    await fsp.rename(tmpPath, filePath);
  } catch (err) {
    await fsp.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

async function writeCollectionArray(name, items) {
  await writeFileAtomic(collectionFilePath(name), JSON.stringify(items));
  noteChanged(name);
}

/**
 * How many times each stored file (DATA_DIR/<key>.json, from either API or
 * the chores sync) has been written since the add-on started, so displays
 * can tell that something they show was changed elsewhere without
 * downloading it all again: GET /beacon-action/changes answers with every
 * count. `boot` changes when the add-on restarts, which starts the counts
 * over. Displays used to fetch family data only when opened, at midnight,
 * or after their own changes, so another display's changes never showed.
 */
const BOOT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const changeCounts = new Map();

function noteChanged(key) {
  changeCounts.set(key, (changeCounts.get(key) || 0) + 1);
}

function generateItemId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A collection's items. Only a missing file counts as empty; a file that
 * can't be read or parsed throws. A lenient read (any error = []) was used
 * before writes, so one failed read (a disk error, a hand-edited file) had
 * the next add rewrite the whole collection as that one item. The chores
 * sync would likewise take an unreadable chores file as "every chore was
 * deleted".
 */
async function readCollectionArrayStrict(name) {
  let raw;
  try {
    raw = await fsp.readFile(collectionFilePath(name), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw storageError(`couldn't read ${name}.json: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw storageError(`${name}.json isn't valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed)) throw storageError(`${name}.json does not hold a list`);
  return parsed;
}

let memberPinsMigration = null;
function ensureMemberPinsMigrated() {
  if (!memberPinsMigration) {
    memberPinsMigration = withCollectionLock('beacon_family_members', async () => {
      const members = await readCollectionArrayStrict('beacon_family_members');
      let changed = false;
      for (const member of members) {
        if (!Object.hasOwn(member, 'pin')) continue;
        if (member.pin && !member.pin_hash) {
          if (typeof member.pin !== 'string' || !/^\d{4,8}$/.test(member.pin)) {
            throw storageError('A stored member has an invalid legacy PIN');
          }
          member.pin_hash = hashMemberPin(member.pin);
        }
        delete member.pin;
        changed = true;
      }
      if (changed) await writeCollectionArray('beacon_family_members', members);
    }).catch((err) => {
      memberPinsMigration = null;
      throw err;
    });
  }
  return memberPinsMigration;
}

/** A problem with the stored data rather than the request: answered with 500. */
function storageError(message) {
  return Object.assign(new Error(message), { status: 500 });
}

function writeErrorStatus(err) {
  if (err.status) return err.status;
  if (err.message?.includes('too large')) return 413;
  if (err instanceof SyntaxError || err.message === 'Request body incomplete') return 400;
  return 500;
}

/**
 * Add one item (the server assigns its id unless it has one). An item with
 * an id that's already there is merged into it rather than added twice:
 * streaks are stored under their member id, and two first ticks at once
 * (the app and the Google Tasks sync) each added a record.
 */
function collectionAdd(name, item) {
  return withCollectionLock(name, async () => {
    const reserved = await assertWritableKey(name);
    let wrote = false;
    try {
      const items = await readCollectionArrayStrict(name);
      const idx = item.id ? items.findIndex((it) => it.id === item.id) : -1;
      const newItem = idx >= 0 ? { ...items[idx], ...item } : { ...item, id: item.id || generateItemId() };
      if (newItem.pin_hash === null) delete newItem.pin_hash;
      if (idx >= 0) items[idx] = newItem;
      else items.push(newItem);
      await writeCollectionArray(name, items);
      wrote = true;
      if (name === 'beacon_family_members' && idx >= 0
          && (Object.hasOwn(item, 'pin_hash') || Object.hasOwn(item, 'role'))) {
        revokeMemberSessions(newItem.id);
      }
      if (name === 'beacon_completions' && typeof item.member_id === 'string') {
        await advanceStreak(item.member_id);
      }
      return newItem;
    } catch (err) {
      if (reserved && !wrote) (await knownStoredKeys()).delete(name);
      throw err;
    }
  });
}

/** Merge-patch one item by id; null if there's no such item. */
function collectionUpdate(name, itemId, patch) {
  return withCollectionLock(name, async () => {
    const items = await readCollectionArrayStrict(name);
    const idx = items.findIndex((it) => it.id === itemId);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch, id: itemId };
    if (items[idx].pin_hash === null) delete items[idx].pin_hash;
    await writeCollectionArray(name, items);
    if (name === 'beacon_family_members'
        && (Object.hasOwn(patch, 'pin_hash') || Object.hasOwn(patch, 'role'))) {
      revokeMemberSessions(itemId);
    }
    return items[idx];
  });
}

/** Remove one item by id; whether it was there. */
function collectionRemove(name, itemId, displayMemberId) {
  return withCollectionLock(name, async () => {
    const items = await readCollectionArrayStrict(name);
    if (displayMemberId && items.some((item) => item.id === itemId && item.member_id !== displayMemberId)) {
      throw Object.assign(new Error('Cannot change another member'), { status: 403 });
    }
    const filtered = items.filter((it) => it.id !== itemId);
    const didRemove = filtered.length !== items.length;
    if (didRemove) {
      await writeCollectionArray(name, filtered);
      if (name === 'beacon_family_members') revokeMemberSessions(itemId);
    }
    return didRemove;
  });
}

/** Collections whose changes the chores sync pushes to Google Tasks. */
const CHORES_SYNC_TRIGGER_COLLECTIONS = new Set(['beacon_chores', 'beacon_completions']);
const DISPLAY_COLLECTIONS = new Set([
  'beacon_family_members', 'beacon_chores', 'beacon_completions',
  'beacon_streaks', 'beacon_routines', 'beacon_routine_completions',
]);
const DISPLAY_COMPLETIONS = new Set(['beacon_completions', 'beacon_routine_completions']);

function displayItems(name, items, memberId) {
  if (name === 'beacon_family_members') return items.filter((item) => item.id === memberId);
  if (name === 'beacon_chores') {
    return items.filter((item) => Array.isArray(item.assigned_to) && item.assigned_to.includes(memberId));
  }
  return items.filter((item) => item.member_id === memberId);
}

function isDisplayRequestAllowed(req) {
  const pathname = req.url.split('?')[0];
  if (req.method === 'GET' && (pathname === '/beacon-action/changes'
    || pathname === '/beacon-action/chores-sync'
    || pathname === '/beacon-data/beacon-settings')) return true;
  const match = /^\/beacon-collection\/([a-zA-Z0-9_-]+)(?:\/([^/]+))?$/.exec(pathname);
  if (!match) return false;
  if (req.method === 'GET') return !match[2] && DISPLAY_COLLECTIONS.has(match[1]);
  return DISPLAY_COMPLETIONS.has(match[1])
    && ((req.method === 'POST' && !match[2]) || (req.method === 'DELETE' && !!match[2]));
}

async function displayCompletion(name, item, memberId) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || item.member_id !== memberId
      || item.verified_by || Object.keys(item).some((key) =>
        !['id', 'chore_id', 'routine_id', 'task_id', 'member_id', 'completed_at', 'verified_by'].includes(key))) {
    throw Object.assign(new Error('Invalid display completion'), { status: 403 });
  }
  const now = new Date();
  const dayKey = dayKeyFormatter(await getHaTimeZone());
  const today = dayKey(now);
  if (name === 'beacon_completions') {
    const chores = await readCollectionArrayStrict('beacon_chores');
    const chore = chores.find((candidate) => candidate.id === item.chore_id
      && Array.isArray(candidate.assigned_to) && candidate.assigned_to.includes(memberId));
    if (!chore) throw Object.assign(new Error('Chore is not assigned to this display'), { status: 403 });
    const settings = await readSettingsFile();
    const weekStartsOn = settings?.weekStartsOn === 1 ? 1 : 0;
    const [year, month, day] = today.split('-').map(Number);
    const back = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() - weekStartsOn + 7) % 7;
    const week = new Date(Date.UTC(year, month - 1, day - back)).toISOString().slice(0, 10);
    const round = chore.frequency === 'once' ? 'once' : chore.frequency === 'weekly' ? week : today;
    return {
      id: `chore-${encodeURIComponent(chore.id)}:${encodeURIComponent(memberId)}:${round}`,
      chore_id: chore.id, member_id: memberId, completed_at: now.toISOString(),
    };
  }
  const routines = await readCollectionArrayStrict('beacon_routines');
  const routine = routines.find((candidate) => candidate.id === item.routine_id
    && candidate.member_id === memberId
    && Array.isArray(candidate.tasks) && candidate.tasks.some((task) => task.id === item.task_id));
  if (!routine) throw Object.assign(new Error('Routine task is not assigned to this display'), { status: 403 });
  return {
    id: `routine-${encodeURIComponent(routine.id)}:${encodeURIComponent(item.task_id)}:${encodeURIComponent(memberId)}:${today}`,
    routine_id: routine.id, task_id: item.task_id, member_id: memberId, completed_at: now.toISOString(),
  };
}

async function handleCollectionApi(req, res, session) {
  const parts = req.url.split('?')[0].replace(/^\/beacon-collection\//, '').split('/').filter(Boolean);
  const name = parts[0] || '';
  let itemId = null;
  try {
    if (parts[1]) itemId = decodeURIComponent(parts[1]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Malformed item id' }));
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name) || parts.length > 2) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid collection name or path' }));
    return;
  }

  try {
    if (name === 'beacon_family_members') await ensureMemberPinsMigrated();
    if (req.method === 'GET' && !itemId) {
      let items = await readCollectionArrayStrict(name);
      // ?since=<ISO time>: only items completed then or later. Completion
      // history grows every day and displays reload it on every change;
      // they need today's, or this month's for the leaderboard.
      // &once_chores: also one-off chores' items, whenever completed (a
      // one-off stays done). Looked up here rather than listed in the URL,
      // which grew with every task imported from Google Tasks.
      const query = new URLSearchParams(req.url.split('?')[1] || '');
      const since = Date.parse(query.get('since') || '');
      if (!Number.isNaN(since)) {
        const choreIds = new Set(query.has('once_chores')
          ? (await readCollectionArrayStrict('beacon_chores')).filter((c) => c?.frequency === 'once').map((c) => c.id)
          : []);
        items = items.filter((it) => (typeof it?.completed_at === 'string' && Date.parse(it.completed_at) >= since)
          || choreIds.has(it?.chore_id));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const visible = session.role === 'display' ? displayItems(name, items, session.memberId) : items;
      res.end(JSON.stringify(name === 'beacon_family_members' ? visible.map(publicMember) : visible));
      return;
    }

    if (req.method === 'POST' && !itemId) {
      const bodyBuf = await collectBody(req);
      if (!bodyBuf) throw Object.assign(new Error('Missing request body'), { status: 400 });
      const parsed = JSON.parse(bodyBuf.toString('utf8'));
      const item = name === 'beacon_family_members' ? memberPatch(parsed)
        : session.role === 'display' ? await displayCompletion(name, parsed, session.memberId) : parsed;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw Object.assign(new Error('Collection item must be an object'), { status: 400 });
      }
      const created = await collectionAdd(name, item);
      if (CHORES_SYNC_TRIGGER_COLLECTIONS.has(name)) choresSync.requestSoon();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(name === 'beacon_family_members' ? publicMember(created) : created));
      return;
    }

    if (req.method === 'PUT' && itemId) {
      const bodyBuf = await collectBody(req);
      const parsed = JSON.parse((bodyBuf || '{}').toString('utf8'));
      const patch = name === 'beacon_family_members' ? memberPatch(parsed) : parsed;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw Object.assign(new Error('Collection patch must be an object'), { status: 400 });
      }
      const updated = await collectionUpdate(name, itemId, patch);
      if (updated && CHORES_SYNC_TRIGGER_COLLECTIONS.has(name)) choresSync.requestSoon();
      if (!updated) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Item not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(name === 'beacon_family_members' ? publicMember(updated) : updated));
      return;
    }

    if (req.method === 'DELETE' && itemId) {
      const removed = await collectionRemove(name, itemId,
        session.role === 'display' ? session.memberId : undefined);
      if (removed && CHORES_SYNC_TRIGGER_COLLECTIONS.has(name)) choresSync.requestSoon();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: removed }));
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    res.writeHead(writeErrorStatus(err), { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Persistent data API — stores JSON in /data/ (survives add-on rebuilds).
 *
 * GET  /beacon-data/:key  → read stored JSON
 * PUT  /beacon-data/:key  → write JSON body to storage
 */
async function handleDataApi(req, res, session) {
  const [pathname, query = ''] = req.url.split('?');
  const key = pathname.slice('/beacon-data/'.length);
  // ?merge: shallow-merge the body object into the stored object instead
  // of replacing it, so a client can send only the fields it changed.
  const merge = new URLSearchParams(query).has('merge');
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid data key' }));
    return;
  }

  const filePath = path.join(DATA_DIR, `${key}.json`);

  if (COLLECTION_KEYS.has(key)) {
    sendJson(res, 409, { error: `${key} is a collection; use /beacon-collection/${key}` });
    return;
  }

  if (req.method === 'GET') {
    try {
      const data = await fsp.readFile(filePath, 'utf8');
      if (session.role === 'display') {
        const settings = JSON.parse(data);
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
          throw storageError('Stored settings are invalid');
        }
        const visibleKeys = [
          'timeFormat', 'currencySymbol', 'screenSaverEnabled', 'dimTimeout',
          'screenSaverTimeout', 'weekStartsOn', 'choresSyncEnabled',
        ];
        sendJson(res, 200, Object.fromEntries(visibleKeys
          .filter((setting) => Object.hasOwn(settings, setting))
          .map((setting) => [setting, settings[setting]])));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('null');
      } else {
        sendJson(res, 500, { error: err.message });
      }
    }
    return;
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const bodyBuf = await collectBody(req);
      // An empty save would replace the stored data with {}.
      if (!bodyBuf) throw Object.assign(new Error('Missing request body'), { status: 400 });
      const body = bodyBuf.toString('utf8');
      const parsed = JSON.parse(body); // validate JSON
      if (merge && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
        throw Object.assign(new Error('merge body must be a JSON object'), { status: 400 });
      }
      // Same lock as the collection API: both store DATA_DIR/<key>.json.
      await withCollectionLock(key, async () => {
        const reserved = await assertWritableKey(key);
        try {
          if (!merge) {
            await writeFileAtomic(filePath, body);
            return;
          }
          // Only a missing file counts as empty: on any other read or parse
          // error, merging into {} would replace every stored setting with
          // just this patch.
          let existing = {};
          let raw = null;
          try {
            raw = await fsp.readFile(filePath, 'utf8');
          } catch (err) {
            if (err.code !== 'ENOENT') throw storageError(`couldn't read ${key}.json: ${err.message}`);
          }
          if (raw !== null) {
            let current;
            try {
              current = JSON.parse(raw);
            } catch (err) {
              throw storageError(`${key}.json isn't valid JSON: ${err.message}`);
            }
            if (current && typeof current === 'object' && !Array.isArray(current)) existing = current;
          }
          await writeFileAtomic(filePath, JSON.stringify({ ...existing, ...parsed }));
        } catch (err) {
          if (reserved) (await knownStoredKeys()).delete(key);
          throw err;
        }
      });
      noteChanged(key);
      if (key === SETTINGS_KEY) void choresSync.settingsChanged();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(writeErrorStatus(err), { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

/* ------------------------------------------------------------------ */
/*  Voice / natural-language intent parser (keyword-based, no LLM)    */
/* ------------------------------------------------------------------ */

const INTENT_PATTERNS = [
  {
    name: 'add_item',
    patterns: [/add\s+(.+?)\s+to\s+(?:the\s+)?(.+)/i],
    handler: (m) => ({
      domain: 'todo', service: 'add_item',
      data: { item: m[1].trim() },
      entityHint: m[2].trim(),
      response: `Added ${m[1].trim()} to ${m[2].trim()}`,
    }),
  },
  {
    name: 'complete_item',
    patterns: [
      /(?:check off|mark)\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed)/i,
      /(?:complete|finish)\s+(.+)/i,
    ],
    handler: (m) => ({
      domain: 'todo', service: 'update_item',
      data: { item: m[1].trim(), status: 'completed' },
      entityHint: null,
      response: `Marked ${m[1].trim()} as done`,
    }),
  },
  {
    name: 'play_music',
    patterns: [/\b(?:play\s+music|resume\s+music|resume\s+playback|play)\b/i],
    handler: () => ({
      domain: 'media_player', service: 'media_play',
      data: {},
      entityHint: null,
      response: 'Playing music',
    }),
  },
  {
    name: 'pause_music',
    patterns: [/\b(?:pause|stop\s+music|pause\s+music|stop\s+playback)\b/i],
    handler: () => ({
      domain: 'media_player', service: 'media_pause',
      data: {},
      entityHint: null,
      response: 'Paused music',
    }),
  },
  {
    name: 'next_track',
    patterns: [/\b(?:next\s+(?:song|track)|skip)\b/i],
    handler: () => ({
      domain: 'media_player', service: 'media_next_track',
      data: {},
      entityHint: null,
      response: 'Skipping to next track',
    }),
  },
  {
    name: 'set_volume',
    patterns: [/set\s+volume\s+(?:to\s+)?(\d+)/i, /volume\s+(\d+)/i],
    handler: (m) => {
      const level = Math.min(100, Math.max(0, parseInt(m[1], 10)));
      return {
        domain: 'media_player', service: 'volume_set',
        data: { volume_level: level / 100 },
        entityHint: null,
        response: `Volume set to ${level}%`,
      };
    },
  },
  {
    name: 'navigate',
    patterns: [/(?:show|go\s+to|open|navigate\s+to)\s+(?:the\s+)?(.+)/i],
    handler: (m) => ({
      navigation: true,
      view: m[1].trim().toLowerCase(),
      response: `Navigating to ${m[1].trim()}`,
    }),
  },
  {
    name: 'calendar',
    patterns: [/\b(?:what(?:'s| is)\s+on\s+(?:today|my\s+calendar|my\s+schedule)|today(?:'s)?\s+(?:schedule|events|calendar|agenda))\b/i],
    handler: () => ({
      fetch: 'calendar',
      response: null, // filled after fetch
    }),
  },
  {
    name: 'weather',
    patterns: [/\b(?:what(?:'s| is)\s+the\s+weather|weather\s+(?:today|now|forecast))\b/i],
    handler: () => ({
      fetch: 'weather',
      response: null, // filled after fetch
    }),
  },
];

function parseIntent(text) {
  for (const intent of INTENT_PATTERNS) {
    for (const pat of intent.patterns) {
      const match = text.match(pat);
      if (match) {
        return { name: intent.name, ...intent.handler(match) };
      }
    }
  }
  return null;
}

/**
 * Helper: make a request to the HA Supervisor API and return parsed JSON.
 * With `timeoutMs`, gives up (rejects) when HA goes quiet for that long.
 */
function haRequest(method, apiPath, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const url = new URL(`${HA_API_BASE}${apiPath}`);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    if (bodyBuf) options.headers['Content-Length'] = bodyBuf.length;

    const r = haHttpClient(url).request(options, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: resp.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: resp.statusCode, data: raw }); }
      });
    });
    r.on('error', reject);
    if (timeoutMs) {
      r.setTimeout(timeoutMs, () => r.destroy(new Error(`no answer from Home Assistant after ${timeoutMs / 1000}s`)));
    }
    if (bodyBuf) r.write(bodyBuf);
    r.end();
  });
}

/**
 * The to-do list with an open item titled `title` (any case), and that
 * item's uid — for "complete milk", which names no list.
 */
async function findOpenTodoItem(states, title) {
  const wanted = title.trim().toLowerCase();
  const lists = states.filter((e) => typeof e.entity_id === 'string' && e.entity_id.startsWith('todo.') && e.state !== 'unavailable');
  // All lists at once: one slow (Google-backed) list used to hold up the rest.
  const found = await Promise.all(lists.map(async (e) => {
    const resp = await haRequest('POST', '/api/services/todo/get_items?return_response', { entity_id: e.entity_id, status: ['needs_action'] }, 10_000).catch(() => null);
    const items = resp?.data?.service_response?.[e.entity_id]?.items ?? [];
    const item = items.find((it) => typeof it.summary === 'string' && it.summary.trim().toLowerCase() === wanted);
    return item ? { entityId: e.entity_id, item: item.uid || item.summary } : null;
  }));
  return found.find(Boolean) ?? null;
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

  collectBody(req).then(async (bodyBuf) => {
    try {
      const { text } = JSON.parse((bodyBuf || '{}').toString('utf8'));
      if (!text || typeof text !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or invalid "text" field' }));
        return;
      }

      const intent = parseIntent(text.trim());

      // Cache states for the duration of this request (avoids 4x /api/states calls)
      let _cachedStates = null;
      async function getStates() {
        if (!_cachedStates) {
          _cachedStates = haRequest('GET', '/api/states').then((r) => {
            if (r.status !== 200 || !Array.isArray(r.data)) {
              throw new Error(`Home Assistant states unavailable (HTTP ${r.status})`);
            }
            return r.data.filter((item) => isEntityAllowed(item?.entity_id, ALLOWED_ENTITIES));
          });
        }
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
          const todoEntities = states.filter(
            (e) => typeof e.entity_id === 'string' && e.entity_id.startsWith('todo.')
          );
          // Match by friendly name (case-insensitive, partial). "the grocery
          // list" means the list called Grocery: drop the word "list".
          const hint = intent.entityHint.toLowerCase().replace(/\s+list$/, '');
          const match = todoEntities.find((e) => {
            const name = (e.attributes?.friendly_name || '').toLowerCase();
            return name === hint || name.includes(hint) || e.entity_id.toLowerCase().includes(hint);
          });
          if (match) entityId = match.entity_id;
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

      // "Complete milk" names no list: use the one with an open "milk".
      if (intent.name === 'complete_item') {
        try {
          const found = await findOpenTodoItem(await getStates(), intent.data.item);
          if (found) {
            entityId = found.entityId;
            serviceData.item = found.item;
          }
        } catch { /* reported as not found below */ }
      }
      if (entityId) serviceData.entity_id = entityId;

      // To-do services need a list; without one HA only answers with an error.
      if (intent.domain === 'todo' && !entityId) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          response: intent.name === 'add_item'
            ? `I couldn't find a list called ${intent.entityHint}.`
            : `I couldn't find ${intent.data.item} on any list.`,
          action: intent.name,
          success: false,
        }));
        return;
      }

      if (intent.domain && !isServiceTargetAllowed(intent.domain, serviceData, ALLOWED_ENTITIES)) {
        sendJson(res, 403, { error: 'Voice action entity not allowed' });
        return;
      }

      try {
        // No ?return_response: add_item and update_item return nothing, and
        // HA rejects asking them for a response (every to-do intent failed).
        let resp = await haRequest('POST', `/api/services/${intent.domain}/${intent.service}`, serviceData);

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
  }).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Google Tasks chores sync (logic in chores-sync.cjs)                */
/* ------------------------------------------------------------------ */

/** /beacon-data key of the app settings (sync on/off, each member's list). */
const SETTINGS_KEY = 'beacon-settings';
/** Longest the sync waits for one HA call (a Google refresh can be slow). */
const SYNC_HA_TIMEOUT_MS = 60_000;

async function readSettingsFile() {
  try {
    return JSON.parse(await fsp.readFile(path.join(DATA_DIR, `${SETTINGS_KEY}.json`), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** HA service call for the sync; throws when HA answers with an error. */
async function callHaServiceForSync(domain, service, data, { returnResponse = false, reason } = {}) {
  if (!isServiceAllowed(domain, service) || !isServiceTargetAllowed(domain, data, ALLOWED_ENTITIES)) {
    throw new Error(`Chores sync target is not allowed for ${domain}.${service}`);
  }
  if (domain === 'todo' && service === 'remove_item') logTodoDelete(data, reason, 'chores sync (add-on)');
  const qs = returnResponse ? '?return_response' : '';
  const result = await haRequest('POST', `/api/services/${domain}/${service}${qs}`, data, SYNC_HA_TIMEOUT_MS);
  if (result.status >= 400) {
    const detail = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
    throw new Error(`${domain}.${service} failed (HTTP ${result.status}): ${String(detail).slice(0, 200)}`);
  }
  return result.data;
}

/**
 * Home Assistant's configured time zone, which decides when "today" starts
 * for chore completions. Re-read hourly; if HA can't be asked, the last
 * known zone (or the container's own) is used.
 */
let haTimeZone = { name: undefined, fetchedAt: 0 };
async function getHaTimeZone() {
  if (!haTimeZone.name || Date.now() - haTimeZone.fetchedAt > 60 * 60 * 1000) {
    try {
      const result = await haRequest('GET', '/api/config', null, 10_000);
      if (result.status === 200 && typeof result.data?.time_zone === 'string') {
        haTimeZone = { name: result.data.time_zone, fetchedAt: Date.now() };
      }
    } catch { /* keep the last known zone */ }
  }
  return haTimeZone.name || process.env.TZ || undefined;
}

async function advanceStreak(memberId) {
  const timeZone = await getHaTimeZone();
  const dayKey = dayKeyFormatter(timeZone);
  const now = new Date();
  const today = dayKey(now);
  const [year, month, day] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  await withCollectionLock('beacon_streaks', async () => {
    const streaks = await readCollectionArrayStrict('beacon_streaks');
    const index = streaks.findIndex((streak) => streak.member_id === memberId);
    const existing = streaks[index];
    if (dayKey(existing?.last_completed) === today) return;
    const current = dayKey(existing?.last_completed) === yesterday ? (existing.current || 0) + 1 : 1;
    const updated = {
      id: memberId,
      member_id: memberId,
      current,
      longest: Math.max(existing?.longest || 0, current),
      last_completed: now.toISOString(),
    };
    const reserved = await assertWritableKey('beacon_streaks');
    try {
      if (index === -1) streaks.push(updated);
      else streaks[index] = updated;
      await writeCollectionArray('beacon_streaks', streaks);
    } catch (err) {
      if (reserved) (await knownStoredKeys()).delete('beacon_streaks');
      throw err;
    }
  });
}

const choresSync = createChoresSync({
  store: {
    list: readCollectionArrayStrict,
    add: collectionAdd,
    update: collectionUpdate,
    remove: collectionRemove,
  },
  callService: callHaServiceForSync,
  readSettings: readSettingsFile,
  getTimeZone: getHaTimeZone,
  haAvailable: () => !!SUPERVISOR_TOKEN,
  log: (line) => console.log(`[chores-sync] ${line}`),
});

/**
 * GET  /beacon-action/chores-sync → sync status (last synced, last error,
 *                                   when it last changed Family's data)
 * POST /beacon-action/chores-sync → run a pass now ("Sync Now"), write its
 *                                   full report to the add-on log, and
 *                                   answer with the status and report
 */
function handleChoresSyncAction(req, res, session) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    const status = choresSync.status();
    res.end(JSON.stringify(session.role === 'display'
      ? { running: status.running, lastChangeAt: status.lastChangeAt, lastSyncedAt: status.lastSyncedAt,
        lastError: null, problems: [] }
      : status));
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  collectBody(req, 64 * 1024).then(async () => {
    console.log(`[chores-sync] Sync Now requested from ${req.headers['user-agent'] || 'unknown device'}`);
    const { outcome, report } = await choresSync.runNow({ verbose: true });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...choresSync.status(), outcome, report }));
  }).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

/**
 * GET /beacon-action/changes → { boot, counts: { [key]: writes } }: how
 * often each stored file has been written (see changeCounts). Polled by
 * every display, so it's small and never cached.
 */
function handleChangesAction(req, res, session) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  const counts = session.role === 'display'
    ? [...changeCounts].filter(([key]) => DISPLAY_COLLECTIONS.has(key) || key === SETTINGS_KEY)
    : changeCounts;
  res.end(JSON.stringify({ boot: BOOT_ID, counts: Object.fromEntries(counts) }));
}

async function getDisplayMember(memberId) {
  await ensureMemberPinsMigrated();
  const members = await readCollectionArrayStrict('beacon_family_members');
  return members.find((member) => member.id === memberId);
}

async function handleAuthorization(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const identity = requesterIdentity(req);
  if (!identity) {
    sendJson(res, 403, { error: 'Missing trusted ingress identity' });
    return;
  }

  try {
    const session = readSession(req);
    if (url.pathname === '/beacon-auth/session' && req.method === 'GET') {
      const displayId = url.searchParams.get('display');
      if (url.searchParams.has('display') && !displayId) {
        sendJson(res, 400, { error: 'Missing display member' });
        return;
      }
      if (displayId) {
        const member = await getDisplayMember(displayId);
        if (!member) {
          sendJson(res, 404, { error: 'Display member not found' });
          return;
        }
        if (!session || session.role !== 'display' || session.memberId !== displayId) {
          if (session?.role === 'parent' || !member.pin_hash) {
            sendJson(res, 200, issueSession(req, res, 'display', displayId));
          } else {
            sendJson(res, 200, { role: 'none', requiresPin: true });
          }
          return;
        }
      }
      if (session?.role === 'display') {
        sessions.get(createHash('sha256').update(session.token).digest('hex')).expiresAt = Date.now() + DISPLAY_SESSION_MS;
        setSessionCookie(req, res, session.token, Math.floor(DISPLAY_SESSION_MS / 1000));
      }
      sendJson(res, 200, session
        ? { role: session.role, ...(session.memberId ? { memberId: session.memberId } : {}) }
        : { role: 'none' });
      return;
    }

    if (url.pathname === '/beacon-auth/parents' && req.method === 'GET') {
      await ensureMemberPinsMigrated();
      const members = await readCollectionArrayStrict('beacon_family_members');
      sendJson(res, 200, members.filter((member) => member.role === 'parent' && member.pin_hash)
        .map((member) => ({ id: member.id, name: member.name })));
      return;
    }

    if (url.pathname === '/beacon-auth/logout' && req.method === 'POST') {
      if (session) sessions.delete(createHash('sha256').update(session.token).digest('hex'));
      setSessionCookie(req, res, '', 0);
      sendJson(res, 200, { role: 'none' });
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    const body = await collectBody(req, 1024);
    let data;
    try {
      data = JSON.parse(body?.toString('utf8') || '');
    } catch {
      sendJson(res, 400, { error: 'Invalid authorization request body' });
      return;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      sendJson(res, 400, { error: 'Invalid authorization request body' });
      return;
    }

    if (url.pathname === '/beacon-auth/display') {
      if (session?.role !== 'parent') {
        sendJson(res, 403, { error: 'Parent session required' });
        return;
      }
      const member = typeof data.member_id === 'string' && await getDisplayMember(data.member_id);
      if (!member) {
        sendJson(res, 404, { error: 'Display member not found' });
        return;
      }
      sendJson(res, 200, issueSession(req, res, 'display', member.id));
      return;
    }

    if (url.pathname !== '/beacon-auth/parent' && url.pathname !== '/beacon-auth/child') {
      sendJson(res, 404, { error: 'Unknown authorization action' });
      return;
    }
    const limiterIdentity = IS_ADDON ? (req.headers['x-remote-user-id'] || identity) : identity;
    const attemptKey = `${limiterIdentity}:${url.pathname}`;
    const globalKey = `all:${url.pathname}`;
    if (pinIsRateLimited(attemptKey) || pinIsRateLimited(globalKey, 50)) {
      res.setHeader('Retry-After', '900');
      sendJson(res, 429, { error: 'Too many PIN attempts; try again later' });
      return;
    }

    const pin = data.pin;
    let valid = false;
    let role = 'parent';
    let memberId;
    if (typeof pin === 'string' && /^\d{4,8}$/.test(pin)) {
      if (url.pathname === '/beacon-auth/child' || data.member_id) {
        const member = typeof data.member_id === 'string' && await getDisplayMember(data.member_id);
        if (member?.pin_hash && (url.pathname === '/beacon-auth/child' || member.role === 'parent')) {
          valid = matchesMemberPin(pin, member.pin_hash);
          memberId = member.id;
          role = url.pathname === '/beacon-auth/child' ? 'display' : 'parent';
        }
      } else {
        valid = timingSafeEqual(createHash('sha256').update(pin).digest(), parentPinDigest);
      }
    }
    if (!valid) {
      failedPin(attemptKey);
      failedPin(globalKey);
      sendJson(res, 401, { error: 'Invalid PIN' });
      return;
    }
    pinAttempts.delete(attemptKey);
    sendJson(res, 200, issueSession(req, res, role, memberId));
  } catch (err) {
    console.error('Authorization failed:', err);
    const status = writeErrorStatus(err);
    sendJson(res, status, { error: status < 500 ? err.message : 'Authorization unavailable' });
  }
}

async function handleHealth(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!SUPERVISOR_TOKEN || !HA_API_BASE) {
    sendJson(res, 200, { status: 'local-only' });
    return;
  }
  try {
    const result = await haRequest('GET', '/api/config', null, 4000);
    if (result.status !== 200) {
      sendJson(res, 503, { error: `Home Assistant returned ${result.status}` });
      return;
    }
    sendJson(res, 200, { status: 'ok' });
  } catch (err) {
    console.error('Home Assistant health check failed:', err);
    sendJson(res, 503, { error: 'Home Assistant unavailable' });
  }
}

/**
 * Answers 500 when an async route fails in a way it didn't handle itself.
 * Otherwise the rejection goes unhandled, which ends the whole add-on
 * process — every display loses its server, and the chores sync stops.
 */
function answerUnexpectedError(req, res) {
  return (err) => {
    console.error(`[error] ${req.method} ${JSON.stringify(req.url.split('?')[0].slice(0, 200))}: ${err?.stack || err}`);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  };
}

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);
  const localHealth = req.url === '/beacon-action/health'
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (IS_ADDON && !localHealth && !isTrustedIngressAddress(req.socket.remoteAddress)) {
    sendJson(res, 403, { error: 'Only Home Assistant ingress may access this add-on' });
    return;
  }
  if (!IS_ADDON && !localHealth && !isStandaloneAuthenticated(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Family", charset="UTF-8"');
    sendJson(res, 401, { error: 'Browser password required' });
    return;
  }
  if (localHealth) {
    handleHealth(req, res).catch(answerUnexpectedError(req, res));
    return;
  }

  // Refuse writes sent by another website (CSRF) before any route runs.
  if (isCrossOriginWrite(req.method, req.headers)) {
    console.warn(
      `[blocked] cross-origin ${req.method} ${JSON.stringify(req.url.split('?')[0].slice(0, 200))} ` +
      `origin=${JSON.stringify(req.headers.origin || '')} ` +
      `sec-fetch-site=${JSON.stringify(req.headers['sec-fetch-site'] || '')} ` +
      `host=${JSON.stringify(req.headers['x-forwarded-host'] || req.headers.host || '')} ` +
      describeRequester(req.headers),
    );
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Cross-origin request blocked' }));
    return;
  }

  if (req.url.startsWith('/beacon-auth/')) {
    handleAuthorization(req, res).catch(answerUnexpectedError(req, res));
    return;
  }

  const protectedPath = req.url.startsWith('/beacon-action/')
    || req.url.startsWith('/beacon-collection/')
    || req.url.startsWith('/beacon-data/')
    || req.url.startsWith('/api/');
  if (!protectedPath) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    serveStatic(req, res).catch(answerUnexpectedError(req, res));
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  const session = readSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Parent or display session required' });
    return;
  }
  if (session.role === 'display' && !isDisplayRequestAllowed(req)) {
    sendJson(res, 403, { error: 'Parent session required' });
    return;
  }

  // Voice / natural-language action API
  if (req.url === '/beacon-action/voice') {
    handleVoiceAction(req, res);
    return;
  }

  // Which stored data has changed, for displays to catch up
  if (req.url === '/beacon-action/changes') {
    handleChangesAction(req, res, session);
    return;
  }

  // Google Tasks chores sync: status (GET) and Sync Now (POST)
  if (req.url === '/beacon-action/chores-sync') {
    handleChoresSyncAction(req, res, session);
    return;
  }

  // Chores sync diagnostic report from older builds -> add-on log
  if (req.url === '/beacon-action/log') {
    handleClientLog(req, res);
    return;
  }

  // Service call API (avoids ingress POST issues)
  if (req.url === '/beacon-action/service') {
    handleServiceCall(req, res);
    return;
  }

  // Calendar event update/delete (WS-only commands in current HA core)
  if (req.url === '/beacon-action/calendar-event') {
    handleCalendarEventAction(req, res);
    return;
  }

  // Media source browse/resolve (WS-only commands — no REST equivalent)
  if (req.url === '/beacon-action/media-source') {
    handleMediaSourceAction(req, res);
    return;
  }

  // Atomic collection API (members, chores, routines, completions, etc.)
  if (req.url.startsWith('/beacon-collection/')) {
    handleCollectionApi(req, res, session).catch(answerUnexpectedError(req, res));
    return;
  }

  // Persistent data API
  if (req.url.startsWith('/beacon-data/')) {
    handleDataApi(req, res, session).catch(answerUnexpectedError(req, res));
    return;
  }

  // Proxy API requests to HA — only the reads and services Family uses
  if (req.url.startsWith('/api/')) {
    if (!SUPERVISOR_TOKEN) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'No server-side Home Assistant token available' }));
    } else if (!isProxyRequestAllowed(req.method, req.url)) {
      console.warn(
        `[blocked] ${req.method} ${JSON.stringify(req.url.split('?')[0].slice(0, 200))} is not an HA API path Family uses; ` +
        describeRequester(req.headers),
      );
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not allowed' }));
    } else {
      proxyToHA(req, res);
    }
    return;
  }

  sendJson(res, 404, { error: 'Unknown API route' });
});

// No WebSocket proxy: Family's pages talk to Home Assistant over REST
// through this server (the browser holds no token in the add-on), so
// nothing opens one. The proxy that was here only added risk: a client
// resetting its connection mid-upgrade crashed the add-on.
server.on('upgrade', (req, socket) => {
  socket.on('error', () => {});
  const allowed = IS_ADDON
    ? isTrustedIngressAddress(req.socket.remoteAddress)
    : isStandaloneAuthenticated(req);
  socket.end(`HTTP/1.1 ${allowed ? '404 Not Found' : '403 Forbidden'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
});

server.listen(PORT, HOST, () => {
  console.log(`Family server listening on port ${PORT} (${IS_ADDON ? 'ingress' : HOST})`);
  console.log(`Server-side HA access: ${SUPERVISOR_TOKEN ? 'available' : 'not configured (local-only)'}`);
  console.log(`Data directory: ${DATA_DIR}`);
  ensureMemberPinsMigrated().then(() => choresSync.start()).catch((err) => {
    console.error('Cannot migrate stored member PINs:', err);
    server.close();
    process.exitCode = 1;
  });
});
