#!/usr/bin/env node
/**
 * Beacon add-on server.
 *
 * Serves the static SPA from /app/dist and proxies /api/* requests
 * to the HA Supervisor API using SUPERVISOR_TOKEN. This means the
 * browser never needs its own HA auth token — the add-on handles it.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DIST = process.env.BEACON_DIST || '/app/dist';
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || '';
const HA_API_BASE = 'http://supervisor/core';

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

function serveStatic(req, res) {
  let filePath = path.join(DIST, req.url === '/' ? '/index.html' : req.url.split('?')[0]);

  // SPA fallback: if file doesn't exist, serve index.html
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

  // Read request body if present
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

const server = http.createServer((req, res) => {
  // Proxy API and WebSocket upgrade requests to HA
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
});
