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

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    try {
      const { domain, service, data, return_response } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!domain || !service) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing domain or service' }));
        return;
      }

      const qs = return_response ? '?return_response' : '';
      const bodyStr = JSON.stringify(data || {});
      const bodyBuf = Buffer.from(bodyStr, 'utf8');

      const options = {
        hostname: 'supervisor',
        port: 80,
        path: `/core/api/services/${domain}/${service}${qs}`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPERVISOR_TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.length,
        },
      };

      const proxyReq = http.request(options, (proxyRes) => {
        const respChunks = [];
        proxyRes.on('data', (c) => respChunks.push(c));
        proxyRes.on('end', () => {
          const respBody = Buffer.concat(respChunks).toString('utf8');
          res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(respBody);
        });
      });

      proxyReq.on('error', (err) => {
        console.error('Service call error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });

      proxyReq.write(bodyBuf);
      proxyReq.end();
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
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

const server = http.createServer((req, res) => {
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
