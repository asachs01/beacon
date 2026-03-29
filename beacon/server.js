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
const path = require('path');

const PORT = 3000;
const DIST = process.env.BEACON_DIST || '/app/dist';
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || '';
const HA_API_BASE = 'http://supervisor/core';
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

function serveStatic(req, res) {
  let filePath = path.join(DIST, req.url === '/' ? '/index.html' : req.url.split('?')[0]);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

/** Collect request body into a Buffer. */
function collectBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
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
  });
}

/**
 * Persistent data API — stores JSON in /data/ (survives add-on rebuilds).
 *
 * GET  /beacon-data/:key  → read stored JSON
 * PUT  /beacon-data/:key  → write JSON body to storage
 */
function handleDataApi(req, res) {
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
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('null');
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'PUT') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        // Validate JSON
        JSON.parse(body);
        fs.writeFileSync(filePath, body, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
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

/** Helper: make a request to the HA Supervisor API and return parsed JSON. */
function haRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const options = {
      hostname: 'supervisor',
      port: 80,
      path: `/core${apiPath}`,
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
          // Match by friendly name (case-insensitive, partial)
          const hint = intent.entityHint.toLowerCase();
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

  // Service call API (avoids ingress POST issues)
  if (req.url === '/beacon-action/service') {
    handleServiceCall(req, res);
    return;
  }

  // Persistent data API
  if (req.url.startsWith('/beacon-data/')) {
    handleDataApi(req, res);
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
