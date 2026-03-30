#!/usr/bin/env node
/**
 * Beacon standalone server.
 *
 * - Serves the static SPA from /app/dist
 * - Provides /beacon-data/* for persistent storage (writes to /data/ volume)
 * - Healthcheck endpoint at /health
 * - NO Home Assistant proxy — runs independently
 */

const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DIST = process.env.BEACON_DIST || '/app/dist';
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
fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {});

async function serveStatic(req, res) {
  let filePath = path.join(DIST, req.url === '/' ? '/index.html' : req.url.split('?')[0]);

  // Path traversal protection
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(DIST) + path.sep) && resolved !== path.resolve(DIST)) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  try {
    await fs.stat(filePath);
  } catch {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

/**
 * Persistent data API — stores JSON in /data/ volume.
 *
 * GET  /beacon-data/:key  → read stored JSON
 * PUT  /beacon-data/:key  → write JSON body to storage
 */
async function handleDataApi(req, res) {
  const key = req.url.replace('/beacon-data/', '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!key) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing key' }));
    return;
  }

  const filePath = path.join(DATA_DIR, `${key}.json`);

  if (req.method === 'GET') {
    try {
      const data = await fs.readFile(filePath, 'utf8');
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
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        JSON.parse(body); // validate JSON
        await fs.writeFile(filePath, body, 'utf8');
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
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Persistent data API
  if (req.url.startsWith('/beacon-data/')) {
    handleDataApi(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Serve static files
  serveStatic(req, res).catch((err) => {
    res.writeHead(500);
    res.end('Internal server error');
  });
});

server.listen(PORT, () => {
  console.log(`Beacon standalone server listening on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
