/**
 * Download link-shared Google Photos albums into /data/photo-cache/google.
 * A failed fetch or parse leaves the previous files in place.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const https = require('node:https');
const path = require('node:path');
const album = require('./google-photos-album.cjs');

const REFRESH_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 3;
const HTML_LIMIT = 4 * 1024 * 1024;
const IMAGE_LIMIT = 15 * 1024 * 1024;
const INDEX_NAME = 'index.json';
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const HASH_RE = /^[a-f0-9]{16}$/;
const FILE_RE = /^[A-Za-z0-9_-]{8,128}\.(?:jpe?g|png|webp)$/;

function emptyIndex() {
  return { urls: [], albums: {} };
}

function createGooglePhotoCache(options = {}) {
  const dataDir = options.dataDir;
  const fetchImpl = options.fetchImpl || defaultFetch;
  const maxPhotos = options.maxPhotos || album.MAX_PHOTOS;
  const concurrency = options.concurrency || CONCURRENCY;
  let refreshing = false;
  let chain = Promise.resolve();

  function enqueue(task) {
    const run = chain.then(task, task);
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  async function loadIndex() {
    try {
      const raw = await fsp.readFile(path.join(dataDir, INDEX_NAME), 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.urls) || typeof parsed.albums !== 'object' || parsed.albums == null) {
        return emptyIndex();
      }
      return parsed;
    } catch (err) {
      if (err.code === 'ENOENT') return emptyIndex();
      return emptyIndex();
    }
  }

  async function saveIndex(index) {
    await fsp.mkdir(dataDir, { recursive: true });
    const file = path.join(dataDir, INDEX_NAME);
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(index), 'utf8');
    await fsp.rename(tmp, file);
  }

  function publicAlbum(hash, record) {
    return {
      url: record.url,
      hash,
      title: record.title || null,
      count: Array.isArray(record.files) ? record.files.length : 0,
      lastSuccess: record.lastSuccess || null,
      lastError: record.lastError || null,
      warning: Boolean(record.lastError),
    };
  }

  async function status() {
    const index = await loadIndex();
    return {
      refreshHours: REFRESH_MS / (60 * 60 * 1000),
      refreshing,
      albums: index.urls.map((url) => {
        const hash = album.albumHash(url);
        const record = index.albums[hash];
        if (!record) {
          return {
            url,
            hash,
            title: null,
            count: 0,
            lastSuccess: null,
            lastError: null,
            warning: false,
          };
        }
        return publicAlbum(hash, record);
      }),
    };
  }

  async function listPhotos() {
    const index = await loadIndex();
    const photos = [];
    for (const url of index.urls) {
      const hash = album.albumHash(url);
      const record = index.albums[hash];
      if (!record || !Array.isArray(record.files)) continue;
      const version = encodeURIComponent(record.lastSuccess || '0');
      for (const file of record.files) {
        if (!FILE_RE.test(file)) continue;
        photos.push({
          url: `/beacon-api/google-photos/file/${hash}/${file}?v=${version}`,
          caption: record.title || '',
          source: 'google_photos',
        });
      }
    }
    return photos;
  }

  async function setUrls(urls) {
    if (!Array.isArray(urls)) {
      const error = new Error('urls must be a list');
      error.code = 'invalid_url';
      throw error;
    }
    const clean = [];
    for (const value of urls) {
      if (typeof value !== 'string' || !album.isAllowedShareUrl(value)) {
        const error = new Error('Invalid album URL');
        error.code = 'invalid_url';
        throw error;
      }
      clean.push(album.normalizeShareUrl(value));
    }
    const unique = [...new Set(clean)];
    if (unique.length > album.MAX_ALBUMS) {
      const error = new Error('Too many albums');
      error.code = 'too_many';
      throw error;
    }
    await enqueue(async () => {
      const index = await loadIndex();
      index.urls = unique;
      const keep = new Set(unique.map((url) => album.albumHash(url)));
      for (const hash of Object.keys(index.albums)) {
        if (keep.has(hash)) continue;
        await fsp.rm(path.join(dataDir, hash), { recursive: true, force: true });
        delete index.albums[hash];
      }
      await saveIndex(index);
    });
  }

  async function refresh() {
    return enqueue(async () => {
      refreshing = true;
      try {
        const index = await loadIndex();
        for (const url of index.urls) {
          await refreshOne(index, url);
          await saveIndex(index);
        }
      } finally {
        refreshing = false;
      }
    });
  }

  async function refreshOne(index, url) {
    const hash = album.albumHash(url);
    const previous = index.albums[hash] || { url, title: null, files: [], lastSuccess: null, lastError: null };
    previous.url = url;
    try {
      const listed = await resolveAlbum(url);
      const dir = path.join(dataDir, hash);
      await fsp.mkdir(dir, { recursive: true });
      const existing = new Set(await fsp.readdir(dir).catch(() => []));
      let failed = 0;
      const written = [];
      await mapPool(listed.photos, concurrency, async (photo) => {
        try {
          const name = await downloadPhoto(dir, photo);
          if (name) written.push(name);
          else failed += 1;
        } catch {
          failed += 1;
        }
      });
      // Every download failed: leave the previous files and success time alone.
      if (written.length === 0 && listed.photos.length > 0) {
        previous.lastError = 'fetch_failed';
        index.albums[hash] = previous;
        return;
      }
      const kept = new Set(written);
      for (const name of existing) {
        if (!FILE_RE.test(name)) continue;
        const id = name.replace(/\.(?:jpe?g|png|webp)$/i, '');
        const replaced = written.some((item) => item.replace(/\.(?:jpe?g|png|webp)$/i, '') === id);
        if (replaced) continue;
        const stillListed = listed.photos.some((photo) => photo.id === id);
        // An incomplete page must not delete photos we simply did not see.
        if (stillListed || !listed.complete) kept.add(name);
      }
      if (listed.complete) {
        for (const name of existing) {
          if (!kept.has(name)) await fsp.rm(path.join(dir, name), { force: true });
        }
      }
      previous.files = [...kept].filter((name) => FILE_RE.test(name)).sort();
      previous.title = listed.title || previous.title;
      previous.lastSuccess = new Date().toISOString();
      previous.lastError = failed > 0 ? 'partial' : null;
      index.albums[hash] = previous;
    } catch (err) {
      previous.lastError = err.code === 'parse_failed' ? 'parse_failed' : 'fetch_failed';
      index.albums[hash] = previous;
    }
  }

  async function resolveAlbum(url) {
    if (!album.isAllowedShareUrl(url)) {
      const error = new Error('Invalid album URL');
      error.code = 'fetch_failed';
      throw error;
    }
    const page = await fetchImpl(album.normalizeShareUrl(url), {
      method: 'GET',
      headers: htmlHeaders(),
      maxBytes: HTML_LIMIT,
      allowHost: album.isPageHost,
    });
    if (page.status < 200 || page.status >= 300) {
      const error = new Error('Album fetch failed');
      error.code = 'fetch_failed';
      throw error;
    }
    const parsed = album.parseSharedAlbumHtml(bufferText(page.body));
    if (!parsed.ok) {
      const error = new Error('Album page format was not recognized');
      error.code = 'parse_failed';
      throw error;
    }
    const photos = [];
    const seen = new Set();
    for (const photo of parsed.photos) {
      if (seen.has(photo.id)) continue;
      seen.add(photo.id);
      photos.push(photo);
      if (photos.length >= maxPhotos) break;
    }
    let complete = !parsed.keys && photos.length < album.EMBEDDED_PAGE_SIZE;
    if (parsed.keys && photos.length < maxPhotos) {
      let pageId = null;
      let guard = 0;
      complete = false;
      while (guard < 40 && photos.length < maxPhotos) {
        guard += 1;
        const request = album.buildBatchexecuteRequest(parsed.keys, pageId);
        let response;
        try {
          response = await fetchImpl(request.url, {
            method: 'POST',
            headers: {
              ...htmlHeaders(),
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
              Origin: 'https://photos.google.com',
              Referer: `https://photos.google.com/share/${parsed.keys.albumKey}`,
            },
            body: request.body,
            maxBytes: HTML_LIMIT,
            allowHost: (host) => host === 'photos.google.com',
          });
        } catch {
          complete = false;
          break;
        }
        if (response.status < 200 || response.status >= 300) {
          complete = false;
          break;
        }
        const batch = album.parseBatchexecutePage(bufferText(response.body));
        if (!batch.ok) {
          complete = false;
          break;
        }
        for (const photo of batch.photos) {
          if (seen.has(photo.id)) continue;
          seen.add(photo.id);
          photos.push(photo);
          if (photos.length >= maxPhotos) break;
        }
        if (!batch.nextPage || batch.nextPage === pageId || batch.photos.length === 0) {
          complete = photos.length < maxPhotos;
          break;
        }
        pageId = batch.nextPage;
      }
      if (photos.length >= maxPhotos) complete = false;
    }
    return { title: parsed.title, photos, complete };
  }

  async function downloadPhoto(dir, photo) {
    const target = album.sizedImageUrl(photo.url, album.IMAGE_WIDTH);
    const response = await fetchImpl(target, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
      maxBytes: IMAGE_LIMIT,
      allowHost: album.isGoogleImageHost,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error('image download failed');
    }
    const type = headerValue(response.headers, 'content-type');
    const ext = album.extensionForType(type);
    const name = ext && album.safeFileName(photo.id, ext);
    if (!name) throw new Error('unsupported image');
    const bytes = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);
    if (bytes.length < 32) throw new Error('empty image');
    const tmp = path.join(dir, `.${name}.partial`);
    const finalPath = path.join(dir, name);
    await fsp.writeFile(tmp, bytes);
    await fsp.rename(tmp, finalPath);
    return name;
  }

  function resolveFile(hash, name) {
    if (!HASH_RE.test(hash) || !FILE_RE.test(name)) return null;
    return loadIndex().then((index) => {
      const record = index.albums[hash];
      if (!record || !Array.isArray(record.files) || !record.files.includes(name)) return null;
      const root = path.resolve(dataDir, hash);
      const full = path.resolve(root, name);
      if (full !== path.join(root, name)) return null;
      return full;
    });
  }

  async function handle(req, res) {
    const pathname = (req.url || '').split('?')[0];
    try {
      if (pathname === '/beacon-api/google-photos' && req.method === 'GET') {
        return sendJson(res, 200, await status());
      }
      if (pathname === '/beacon-api/google-photos/photos' && req.method === 'GET') {
        return sendJson(res, 200, { photos: await listPhotos() });
      }
      if (pathname === '/beacon-api/google-photos' && req.method === 'PUT') {
        const body = await readJson(req);
        await setUrls(body.urls);
        refresh().catch(() => undefined);
        const snapshot = await status();
        snapshot.refreshing = true;
        return sendJson(res, 200, snapshot);
      }
      if (pathname === '/beacon-api/google-photos/refresh' && req.method === 'POST') {
        refresh().catch(() => undefined);
        const snapshot = await status();
        snapshot.refreshing = true;
        return sendJson(res, 202, snapshot);
      }
      const fileMatch = pathname.match(/^\/beacon-api\/google-photos\/file\/([^/]+)\/([^/]+)$/);
      if (fileMatch && req.method === 'GET') {
        const full = await resolveFile(fileMatch[1], fileMatch[2]);
        if (!full) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        const ext = path.extname(full).toLowerCase();
        const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        res.writeHead(200, {
          'Content-Type': type,
          'Cache-Control': 'public, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        });
        const stream = fs.createReadStream(full);
        stream.on('error', () => {
          if (!res.headersSent) res.writeHead(404);
          res.end();
        });
        stream.pipe(res);
        return;
      }
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
    } catch (err) {
      const statusCode = err.code === 'invalid_url' || err.code === 'too_many' ? 400 : 500;
      if (!res.headersSent) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: statusCode === 400 ? err.message : 'Google Photos cache failed' }));
      }
    }
  }

  return {
    handle,
    refresh,
    setUrls,
    status,
    listPhotos,
    resolveFile,
  };
}

function htmlHeaders() {
  return {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

function headerValue(headers, name) {
  if (!headers) return '';
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function bufferText(body) {
  return Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '');
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 64 * 1024) {
        reject(Object.assign(new Error('Request body too large'), { code: 'invalid_url' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { code: 'invalid_url' }));
      }
    });
    req.on('error', () => reject(Object.assign(new Error('Invalid JSON'), { code: 'invalid_url' })));
  });
}

async function mapPool(items, limit, fn) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}

function defaultFetch(url, options) {
  return fetchChecked(url, options);
}

async function fetchChecked(url, options) {
  let current = url;
  let method = options.method || 'GET';
  let body = options.body;
  for (let hop = 0; hop < 5; hop += 1) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw Object.assign(new Error('Blocked URL'), { code: 'fetch_failed' });
    }
    if (options.allowHost && !options.allowHost(parsed.hostname)) {
      throw Object.assign(new Error('Blocked host'), { code: 'fetch_failed' });
    }
    const response = await requestOnce(parsed, { ...options, method, body });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = headerValue(response.headers, 'location');
      if (!location) throw Object.assign(new Error('Redirect without location'), { code: 'fetch_failed' });
      current = new URL(location, current).toString();
      method = 'GET';
      body = undefined;
      continue;
    }
    return response;
  }
  throw Object.assign(new Error('Too many redirects'), { code: 'fetch_failed' });
}

function requestOnce(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: options.method || 'GET',
      headers: options.headers,
      timeout: 20000,
    }, (res) => {
      const chunks = [];
      let size = 0;
      const maxBytes = options.maxBytes || HTML_LIMIT;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy();
          reject(Object.assign(new Error('Response too large'), { code: 'fetch_failed' }));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('error', () => reject(Object.assign(new Error('Request failed'), { code: 'fetch_failed' })));
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('Request timed out'), { code: 'fetch_failed' }));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

module.exports = {
  REFRESH_MS,
  CONCURRENCY,
  createGooglePhotoCache,
};
