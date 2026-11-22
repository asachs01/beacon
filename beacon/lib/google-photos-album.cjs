/**
 * Parse a public Google Photos shared-album page.
 *
 * Google no longer lets third-party apps list a library or a shared album
 * through the Photos Library API. A link-shared album still embeds its first
 * page in the public HTML, and further pages come back from the same public
 * batchexecute call the album page uses. That page format is unofficial and
 * can change. Callers keep the last good cache when parsing fails.
 *
 * This module does not fetch anything.
 */

'use strict';

const crypto = require('node:crypto');

const IMAGE_WIDTH = 2560;
const MAX_ALBUMS = 8;
const MAX_PHOTOS = 2000;
const EMBEDDED_PAGE_SIZE = 300;
const VIDEO_DURATION_KEY = '76647426';

const SHARE_HOSTS = new Set(['photos.app.goo.gl', 'photos.google.com']);
const PAGE_HOSTS = new Set([
  'photos.app.goo.gl',
  'photos.google.com',
  'www.google.com',
  'google.com',
]);

function isAllowedShareUrl(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.hostname === 'photos.app.goo.gl') {
    return /^\/[A-Za-z0-9_-]{4,}\/?$/.test(url.pathname);
  }
  if (url.hostname === 'photos.google.com') {
    return /^\/share\/[A-Za-z0-9_-]{4,}\/?$/.test(url.pathname);
  }
  return false;
}

function normalizeShareUrl(value) {
  const url = new URL(String(value).trim());
  url.hash = '';
  if (url.hostname === 'photos.app.goo.gl') url.search = '';
  let text = url.toString();
  if (text.endsWith('/')) text = text.slice(0, -1);
  return text;
}

function albumHash(value) {
  return crypto.createHash('sha256').update(normalizeShareUrl(value)).digest('hex').slice(0, 16);
}

function isGoogleImageHost(hostname) {
  return hostname === 'googleusercontent.com' || hostname.endsWith('.googleusercontent.com');
}

function isPageHost(hostname) {
  return PAGE_HOSTS.has(hostname);
}

function sizedImageUrl(raw, width = IMAGE_WIDTH) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !isGoogleImageHost(url.hostname)) {
    throw new Error('Unexpected image host');
  }
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/=(?:[swh]\d+|[^/]*)$/i, '');
  return `${url.origin}${url.pathname}=w${width}`;
}

function balancedEnd(text, openIdx, openChar, closeChar) {
  if (text[openIdx] !== openChar) return null;
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return null;
}

function extractDataArrays(html) {
  const blobs = [];
  const marker = 'AF_initDataCallback';
  let from = 0;
  while (from < html.length) {
    const start = html.indexOf(marker, from);
    if (start < 0) break;
    const brace = html.indexOf('{', start);
    if (brace < 0) break;
    const blockEnd = balancedEnd(html, brace, '{', '}');
    if (blockEnd == null) break;
    const block = html.slice(brace, blockEnd + 1);
    const dataAt = block.search(/[{,]\s*data\s*:/);
    if (dataAt >= 0) {
      const arr = block.indexOf('[', dataAt);
      if (arr >= 0) {
        const arrEnd = balancedEnd(block, arr, '[', ']');
        if (arrEnd != null) blobs.push(block.slice(arr, arrEnd + 1));
      }
    }
    from = blockEnd + 1;
  }
  return blobs;
}

function isVideo(node, depth = 0) {
  if (node == null || depth > 6) return false;
  if (Array.isArray(node)) return node.some((child) => isVideo(child, depth + 1));
  if (typeof node === 'object') {
    if (Object.prototype.hasOwnProperty.call(node, VIDEO_DURATION_KEY)) return true;
    return Object.values(node).some((child) => isVideo(child, depth + 1));
  }
  return false;
}

function parseItem(raw) {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const id = raw[0];
  const visual = raw[1];
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(id)) return null;
  if (!Array.isArray(visual) || visual.length < 3) return null;
  const url = visual[0];
  const width = visual[1];
  const height = visual[2];
  if (typeof url !== 'string' || typeof width !== 'number' || typeof height !== 'number') return null;
  let hostname;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    hostname = parsed.hostname;
  } catch {
    return null;
  }
  if (!isGoogleImageHost(hostname)) return null;
  return { id, url, width, height };
}

function listLooksLikeItems(list) {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_PHOTOS + 50) return false;
  let photos = 0;
  const sample = list.slice(0, 20);
  for (const item of sample) {
    if (isVideo(item)) continue;
    if (!parseItem(item)) return false;
    photos += 1;
  }
  return photos > 0;
}

function collectItemLists(node, out = []) {
  if (Array.isArray(node)) {
    if (listLooksLikeItems(node)) out.push(node);
    for (const child of node) collectItemLists(child, out);
  }
  return out;
}

function photosFromTree(tree) {
  const photos = [];
  const seen = new Set();
  for (const list of collectItemLists(tree)) {
    for (const raw of list) {
      if (isVideo(raw)) continue;
      const item = parseItem(raw);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      photos.push(item);
    }
  }
  return photos;
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) return null;
  const title = match[1].replace(/\s+/g, ' ').trim().replace(/ - Google Photos$/i, '').trim();
  return title || null;
}

function extractKeys(html) {
  const match = html.match(
    /snAcKc[\s\S]{0,500}?request\s*:\s*\[\s*"([A-Za-z0-9_-]{4,256})"\s*,\s*null\s*,\s*null\s*,\s*"([A-Za-z0-9_-]{4,256})"/,
  );
  if (!match) return null;
  return { albumKey: match[1], authKey: match[2] };
}

function parseSharedAlbumHtml(html) {
  const title = extractTitle(String(html));
  const keys = extractKeys(String(html));
  const photos = [];
  const seen = new Set();
  for (const blob of extractDataArrays(String(html))) {
    let tree;
    try {
      tree = JSON.parse(blob);
    } catch {
      continue;
    }
    for (const photo of photosFromTree(tree)) {
      if (seen.has(photo.id)) continue;
      seen.add(photo.id);
      photos.push(photo);
    }
  }
  const ok = photos.length > 0 || keys != null;
  return {
    ok,
    title,
    photos,
    keys,
    error: ok ? null : 'parse_failed',
  };
}

function parseBatchexecutePage(body) {
  let text = String(body).replace(/^\uFEFF/, '').trimStart();
  if (text.startsWith(")]}'")) text = text.slice(4).trimStart();
  const photos = [];
  const seen = new Set();
  let nextPage = null;
  let found = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('[')) continue;
    let outer;
    try {
      outer = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!Array.isArray(outer)) continue;
    for (const entry of outer) {
      if (!Array.isArray(entry) || entry[0] !== 'wrb.fr' || entry[1] !== 'snAcKc') continue;
      if (typeof entry[2] !== 'string') continue;
      let inner;
      try {
        inner = JSON.parse(entry[2]);
      } catch {
        continue;
      }
      found = true;
      const rawItems = Array.isArray(inner?.[1]) ? inner[1] : [];
      for (const raw of rawItems) {
        if (isVideo(raw)) continue;
        const item = parseItem(raw);
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        photos.push(item);
      }
      const token = inner?.[2];
      nextPage = typeof token === 'string' && token.length > 0 ? token : null;
    }
  }
  return { ok: found, photos, nextPage };
}

function buildBatchexecuteRequest(keys, pageId) {
  const inner = JSON.stringify([keys.albumKey, pageId || null, null, keys.authKey]);
  const envelope = JSON.stringify([[['snAcKc', inner, null, 'generic']]]);
  return {
    url: `https://photos.google.com/u/0/_/PhotosUi/data/batchexecute?rpcids=snAcKc&source-path=${encodeURIComponent(`/share/${keys.albumKey}`)}`,
    body: `f.req=${encodeURIComponent(envelope)}`,
  };
}

function extensionForType(contentType) {
  const type = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/jpeg') return 'jpg';
  return null;
}

function safeFileName(id, ext) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) return null;
  if (ext !== 'jpg' && ext !== 'png' && ext !== 'webp') return null;
  return `${id}.${ext}`;
}

module.exports = {
  IMAGE_WIDTH,
  MAX_ALBUMS,
  MAX_PHOTOS,
  EMBEDDED_PAGE_SIZE,
  SHARE_HOSTS,
  isAllowedShareUrl,
  normalizeShareUrl,
  albumHash,
  isGoogleImageHost,
  isPageHost,
  sizedImageUrl,
  parseSharedAlbumHtml,
  parseBatchexecutePage,
  buildBatchexecuteRequest,
  extensionForType,
  safeFileName,
  isVideo,
  parseItem,
};
