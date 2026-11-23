#!/usr/bin/env node
/**
 * Beacon add-on server.
 *
 * - Serves the static SPA from /app/dist
 * - Proxies /api/* to HA Supervisor API with SUPERVISOR_TOKEN
 * - Provides /beacon-data/* for persistent storage (survives rebuilds)
 */

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000;
const DIST = process.env.BEACON_DIST || '/app/dist';
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || '';
const HA_API_BASE = process.env.HA_API_BASE_OVERRIDE || 'http://supervisor/core';
const HA_WS_URL = process.env.HA_WS_URL_OVERRIDE || 'ws://supervisor/core/api/websocket';
// /data/ is HA add-on persistent storage (survives container rebuilds)
const DATA_DIR = process.env.BEACON_DATA || '/data';
const { createGooglePhotoCache, REFRESH_MS } = require('./lib/google-photos-cache.cjs');
const { acceptedChoreEvents, createPrivilegeScheduler } = require('./lib/chore-privileges.cjs');
const { readStoredResetTime } = require('./lib/chore-day.cjs');
const { parseIntent, resolveTodoEntity } = require('./lib/voice-intents.cjs');
const { completeStoredChore, handleCompleteChore } = require('./lib/complete-chore.cjs');
const { listStoredChores, handleChoresLeft } = require('./lib/chores-left.cjs');
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

function proxyToHA(req, res) {
  const targetUrl = `${HA_API_BASE}${req.url}`;

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = chunks.length > 0 ? Buffer.concat(chunks) : null;

    const url = new URL(targetUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
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

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Failed to reach Home Assistant' }));
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
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
      reject(new Error('No Supervisor token available'));
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
 * with the Supervisor token. Missing token or an HA error is logged and
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
    if (!SUPERVISOR_TOKEN) {
      console.warn('[beacon] chore events skipped: no Supervisor token');
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
      await fsp.writeFile(filePath, body, 'utf8');
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

/** Helper: make a request to the HA Supervisor API and return parsed JSON. */
function haRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const url = new URL(`${HA_API_BASE}${apiPath}`);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    if (bodyBuf) options.headers['Content-Length'] = bodyBuf.length;

    const r = http.request(options, (resp) => {
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
  hasToken: () => !!SUPERVISOR_TOKEN,
  log: (message) => console.warn(message),
});

async function publishStoredChoreEvents(events) {
  if (!SUPERVISOR_TOKEN) {
    console.warn('[beacon] chore events skipped: no Supervisor token');
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

  // Google Photos shared-album cache. The browser never calls Google.
  if (req.url.startsWith('/beacon-api/google-photos')) {
    googlePhotos.handle(req, res);
    return;
  }

  // Proxy API requests to HA
  if (req.url.startsWith('/api/')) {
    if (SUPERVISOR_TOKEN) {
      proxyToHA(req, res);
    } else {
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'No Supervisor token available' }));
    }
    return;
  }

  serveStatic(req, res);
});

// Handle WebSocket upgrades for /api/websocket
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/api/websocket') || !SUPERVISOR_TOKEN) {
    socket.destroy();
    return;
  }

  const url = new URL(`${HA_API_BASE}${req.url}`);
  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method: 'GET',
    headers: {
      ...req.headers,
      host: url.hostname,
    },
  };

  const proxyReq = http.request(options);
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

server.listen(PORT, () => {
  console.log(`Beacon server listening on port ${PORT}`);
  console.log(`Supervisor token: ${SUPERVISOR_TOKEN ? 'available' : 'NOT available'}`);
  console.log(`Data directory: ${DATA_DIR}`);
});

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
