#!/usr/bin/env node
/**
 * Beacon add-on server.
 *
 * - Serves the static SPA from /app/dist
 * - Proxies /api/* to HA Supervisor API with SUPERVISOR_TOKEN
 * - Provides /beacon-data/* for persistent storage (survives rebuilds)
 * - Runs the Google Tasks chores sync (chores-sync.cjs)
 *
 * The Supervisor token has admin rights, so only the HA services and
 * paths Family uses are passed on, and writes from other websites are
 * refused — see server-guards.cjs.
 */

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const WebSocket = require('ws');
const {
  isServiceAllowed,
  isProxyRequestAllowed,
  isCrossOriginWrite,
  describeRequester,
} = require('./server-guards.cjs');
const { createChoresSync } = require('./chores-sync.cjs');

const PORT = Number(process.env.BEACON_PORT) || 3000;
const DIST = process.env.BEACON_DIST || '/app/dist';
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || '';
const HA_API_BASE = process.env.HA_API_BASE_OVERRIDE || 'http://supervisor/core';
const HA_WS_URL = process.env.HA_WS_URL_OVERRIDE || 'ws://supervisor/core/api/websocket';
// /data/ is HA add-on persistent storage (survives container rebuilds)
const DATA_DIR = process.env.BEACON_DATA || '/data';

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

/** A problem with the stored data rather than the request: answered with 500. */
function storageError(message) {
  return Object.assign(new Error(message), { status: 500 });
}

/**
 * Add one item (the server assigns its id unless it has one). An item with
 * an id that's already there is merged into it rather than added twice:
 * streaks are stored under their member id, and two first ticks at once
 * (the app and the Google Tasks sync) each added a record.
 */
function collectionAdd(name, item) {
  return withCollectionLock(name, async () => {
    const items = await readCollectionArrayStrict(name);
    const idx = item.id ? items.findIndex((it) => it.id === item.id) : -1;
    const newItem = idx >= 0 ? { ...items[idx], ...item } : { ...item, id: item.id || generateItemId() };
    if (idx >= 0) items[idx] = newItem;
    else items.push(newItem);
    await writeCollectionArray(name, items);
    return newItem;
  });
}

/** Merge-patch one item by id; null if there's no such item. */
function collectionUpdate(name, itemId, patch) {
  return withCollectionLock(name, async () => {
    const items = await readCollectionArrayStrict(name);
    const idx = items.findIndex((it) => it.id === itemId);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch, id: itemId };
    await writeCollectionArray(name, items);
    return items[idx];
  });
}

/** Remove one item by id; whether it was there. */
function collectionRemove(name, itemId) {
  return withCollectionLock(name, async () => {
    const items = await readCollectionArrayStrict(name);
    const filtered = items.filter((it) => it.id !== itemId);
    const didRemove = filtered.length !== items.length;
    if (didRemove) await writeCollectionArray(name, filtered);
    return didRemove;
  });
}

/** Collections whose changes the chores sync pushes to Google Tasks. */
const CHORES_SYNC_TRIGGER_COLLECTIONS = new Set(['beacon_chores', 'beacon_completions']);

async function handleCollectionApi(req, res) {
  const parts = req.url.split('?')[0].replace(/^\/beacon-collection\//, '').split('/').filter(Boolean);
  const name = (parts[0] || '').replace(/[^a-zA-Z0-9_-]/g, '');
  let itemId = null;
  try {
    if (parts[1]) itemId = decodeURIComponent(parts[1]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Malformed item id' }));
    return;
  }

  if (!name) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing collection name' }));
    return;
  }

  try {
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
      res.end(JSON.stringify(items));
      return;
    }

    if (req.method === 'POST' && !itemId) {
      const bodyBuf = await collectBody(req);
      if (!bodyBuf) throw new Error('Missing request body');
      const item = JSON.parse(bodyBuf.toString('utf8'));
      const created = await collectionAdd(name, item);
      if (CHORES_SYNC_TRIGGER_COLLECTIONS.has(name)) choresSync.requestSoon();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(created));
      return;
    }

    if (req.method === 'PUT' && itemId) {
      const bodyBuf = await collectBody(req);
      const patch = JSON.parse((bodyBuf || '{}').toString('utf8'));
      const updated = await collectionUpdate(name, itemId, patch);
      if (updated && CHORES_SYNC_TRIGGER_COLLECTIONS.has(name)) choresSync.requestSoon();
      if (!updated) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Item not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(updated));
      return;
    }

    if (req.method === 'DELETE' && itemId) {
      const removed = await collectionRemove(name, itemId);
      if (removed && CHORES_SYNC_TRIGGER_COLLECTIONS.has(name)) choresSync.requestSoon();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: removed }));
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    res.writeHead(err.status ?? (err.message?.includes('too large') ? 413 : 400), { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * Persistent data API — stores JSON in /data/ (survives add-on rebuilds).
 *
 * GET  /beacon-data/:key  → read stored JSON
 * PUT  /beacon-data/:key  → write JSON body to storage
 */
async function handleDataApi(req, res) {
  const [pathname, query = ''] = req.url.split('?');
  // Sanitize key: only allow alphanumeric, hyphens, underscores
  const key = pathname.replace('/beacon-data/', '').replace(/[^a-zA-Z0-9_-]/g, '');
  // ?merge: shallow-merge the body object into the stored object instead
  // of replacing it, so a client can send only the fields it changed.
  const merge = new URLSearchParams(query).has('merge');
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

  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const bodyBuf = await collectBody(req);
      // An empty save would replace the stored data with {}.
      if (!bodyBuf) throw new Error('Missing request body');
      const body = bodyBuf.toString('utf8');
      const parsed = JSON.parse(body); // validate JSON
      if (merge && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
        throw new Error('merge body must be a JSON object');
      }
      // Same lock as the collection API: both store DATA_DIR/<key>.json.
      await withCollectionLock(key, async () => {
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
      });
      noteChanged(key);
      if (key === SETTINGS_KEY) void choresSync.settingsChanged();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(err.status ?? (err.message?.includes('too large') ? 413 : 400), { 'Content-Type': 'application/json' });
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
function handleChoresSyncAction(req, res) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(choresSync.status()));
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
function handleChangesAction(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ boot: BOOT_ID, counts: Object.fromEntries(changeCounts) }));
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

  // Voice / natural-language action API
  if (req.url === '/beacon-action/voice') {
    handleVoiceAction(req, res);
    return;
  }

  // Which stored data has changed, for displays to catch up
  if (req.url === '/beacon-action/changes') {
    handleChangesAction(req, res);
    return;
  }

  // Google Tasks chores sync: status (GET) and Sync Now (POST)
  if (req.url === '/beacon-action/chores-sync') {
    handleChoresSyncAction(req, res);
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
    handleCollectionApi(req, res).catch(answerUnexpectedError(req, res));
    return;
  }

  // Persistent data API
  if (req.url.startsWith('/beacon-data/')) {
    handleDataApi(req, res).catch(answerUnexpectedError(req, res));
    return;
  }

  // Proxy API requests to HA — only the reads and services Family uses
  if (req.url.startsWith('/api/')) {
    if (!SUPERVISOR_TOKEN) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'No Supervisor token available' }));
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

  serveStatic(req, res).catch(answerUnexpectedError(req, res));
});

// No WebSocket proxy: Family's pages talk to Home Assistant over REST
// through this server (the browser holds no token in the add-on), so
// nothing opens one. The proxy that was here only added risk: a client
// resetting its connection mid-upgrade crashed the add-on.
server.on('upgrade', (req, socket) => {
  socket.on('error', () => {});
  socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
});

server.listen(PORT, () => {
  console.log(`Family server listening on port ${PORT}`);
  console.log(`Supervisor token: ${SUPERVISOR_TOKEN ? 'available' : 'NOT available'}`);
  console.log(`Data directory: ${DATA_DIR}`);
  choresSync.start();
});
