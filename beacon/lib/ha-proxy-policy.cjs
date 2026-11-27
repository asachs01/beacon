'use strict';

/**
 * Allowlist for Beacon's public Home Assistant HTTP proxy.
 *
 * Pure: no I/O and no token. server.js loads the persisted settings, then
 * calls evaluateHaProxyPolicy before it forwards. A denial is returned to
 * the client and the request is not sent to Home Assistant.
 *
 * Server-internal haRequest calls do not use this module.
 */

const ENTITY_ID = /^[A-Za-z0-9_]+\.[A-Za-z0-9_-]+$/;

/** Domains that run arbitrary commands or scripts. Never forwarded. */
const BLOCKED_DOMAINS = new Set(['script', 'shell_command']);

/**
 * Service calls the UI makes that are not aimed at a single configured
 * entity. todo.remove_item is not used. media_player services are separate
 * and entity-scoped.
 */
const UNSCOPED_SERVICES = new Set([
  'todo.get_items',
  'todo.add_item',
  'todo.update_item',
  'weather.get_forecasts',
  'conversation.process',
  'ai_task.generate_data',
  'notify.notify',
  'grocy.update_generic',
  'grocy.add_generic',
]);

/**
 * Playback services the music UI actually calls (src/api/music.ts).
 * volume_mute, play_media, turn_on, turn_off, shuffle_set, and repeat_set
 * are not used. Mute is volume_set to 0. toggle is the last playback fallback.
 */
const MUSIC_SERVICES = new Set([
  'media_play',
  'media_pause',
  'media_play_pause',
  'media_next_track',
  'media_previous_track',
  'volume_set',
  'toggle',
]);

/** HaToggleCard calls toggle. Chore privileges call turn_on and turn_off. */
const CONTROL_SERVICES = new Set(['toggle', 'turn_on', 'turn_off']);

/** Service-data keys that would affect more than the named entities. */
const WIDENING_KEYS = ['area_id', 'device_id', 'label_id', 'floor_id'];

const MEDIA_UPLOAD_PATH = '/api/media_source/local_source/upload';
const BROWSE_PREFIX = '/api/media_source/browse_media';
const RESOLVE_PREFIX = '/api/media_source/resolve_media/';

function detailFor(method, rawUrl) {
  const verb = String(method || '').trim().toUpperCase();
  return `${verb} ${String(rawUrl || '')} is not allowed by Beacon`;
}

function deny(method, rawUrl) {
  return { allowed: false, detail: detailFor(method, rawUrl) };
}

function allow() {
  return { allowed: true };
}

function splitTarget(rawUrl) {
  const value = String(rawUrl || '');
  const queryAt = value.indexOf('?');
  const rawPath = queryAt === -1 ? value : value.slice(0, queryAt);
  const query = queryAt === -1 ? '' : value.slice(queryAt + 1);
  return { rawPath, query };
}

/**
 * Decode percent-escapes a few times so a double-encoded `..` cannot sneak
 * past the segment check. Invalid escapes are rejected.
 */
function decodePathname(rawPath) {
  if (!rawPath.startsWith('/') || rawPath.includes('\\') || rawPath.includes('\0')) return null;
  let current = rawPath;
  for (let i = 0; i < 3; i += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(current)) break;
    let next;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) break;
    if (next.includes('\\') || next.includes('\0')) return null;
    current = next;
  }
  const segments = current.split('/');
  if (segments.some((segment) => segment === '..')) return null;
  return current;
}

function returnResponseQueryOk(query) {
  if (!query) return true;
  const params = new URLSearchParams(query);
  const keys = [...params.keys()];
  if (keys.length !== 1 || keys[0] !== 'return_response') return false;
  const values = params.getAll('return_response');
  return values.length === 1 && (values[0] === '' || values[0] === 'true');
}

function addEntity(target, value) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!ENTITY_ID.test(trimmed)) return;
  target.push(trimmed);
}

function unique(values) {
  return [...new Set(values)];
}

function cardsFromLayout(layout) {
  if (!layout || typeof layout !== 'object') return [];
  const regionGroups = [];
  if (Array.isArray(layout.views)) {
    for (const view of layout.views) {
      if (view && view.regions && typeof view.regions === 'object') regionGroups.push(view.regions);
    }
  }
  if (layout.regions && typeof layout.regions === 'object') regionGroups.push(layout.regions);
  const cards = [];
  for (const regions of regionGroups) {
    for (const name of ['topbar', 'main', 'sidebar']) {
      const list = regions[name];
      if (!Array.isArray(list)) continue;
      for (const card of list) cards.push(card);
    }
  }
  return cards;
}

/**
 * Normalized entity scope from the JSON files the add-on already stores.
 *
 * musicPlayers: settings.musicDefaultPlayer, plus settings.musicPlayers when
 * that array is present.
 * toggleEntities: entity ids on ha-toggle dashboard cards (entity_ids, or
 * the legacy entity_id when the list is empty).
 * privilegeEntities: family member privilegeEntityId values (chore bridge).
 */
function proxySettingsFromStore(store = {}) {
  const musicPlayers = [];
  const toggleEntities = [];
  const privilegeEntities = [];
  const beaconSettings = store.beaconSettings && typeof store.beaconSettings === 'object'
    ? store.beaconSettings
    : {};

  addEntity(musicPlayers, beaconSettings.musicDefaultPlayer);
  if (Array.isArray(beaconSettings.musicPlayers)) {
    for (const player of beaconSettings.musicPlayers) addEntity(musicPlayers, player);
  }

  for (const card of cardsFromLayout(store.dashboardLayout)) {
    if (!card || card.type !== 'ha-toggle' || !card.config || typeof card.config !== 'object') continue;
    const listed = Array.isArray(card.config.entity_ids)
      ? card.config.entity_ids.filter((item) => typeof item === 'string' && item.trim())
      : [];
    if (listed.length > 0) {
      for (const entityId of listed) addEntity(toggleEntities, entityId);
    } else {
      addEntity(toggleEntities, card.config.entity_id);
    }
  }

  const members = Array.isArray(store.familyMembers) ? store.familyMembers : [];
  for (const member of members) {
    if (!member || typeof member !== 'object') continue;
    addEntity(privilegeEntities, member.privilegeEntityId);
  }

  return {
    musicPlayers: unique(musicPlayers),
    toggleEntities: unique(toggleEntities),
    privilegeEntities: unique(privilegeEntities),
  };
}

function asEntityList(value) {
  if (!Array.isArray(value)) return [];
  const ids = [];
  for (const item of value) addEntity(ids, item);
  return ids;
}

function normalizeSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return { musicPlayers: [], toggleEntities: [], privilegeEntities: [] };
  }
  if (
    Object.prototype.hasOwnProperty.call(settings, 'beaconSettings')
    || Object.prototype.hasOwnProperty.call(settings, 'dashboardLayout')
    || Object.prototype.hasOwnProperty.call(settings, 'familyMembers')
  ) {
    return proxySettingsFromStore(settings);
  }
  const musicPlayers = asEntityList(settings.musicPlayers);
  addEntity(musicPlayers, settings.musicDefaultPlayer);
  return {
    musicPlayers: unique(musicPlayers),
    toggleEntities: asEntityList(settings.toggleEntities),
    privilegeEntities: asEntityList(settings.privilegeEntities),
  };
}

function isAllowedGet(pathname) {
  if (pathname === '/api/states' || pathname === '/api/config' || pathname === '/api/calendars') return true;
  if (pathname.startsWith('/api/states/')) return ENTITY_ID.test(pathname.slice('/api/states/'.length));
  if (pathname.startsWith('/api/calendars/')) return ENTITY_ID.test(pathname.slice('/api/calendars/'.length));
  if (pathname === BROWSE_PREFIX || pathname.startsWith(`${BROWSE_PREFIX}/`)) return true;
  if (pathname.startsWith(RESOLVE_PREFIX) && pathname.length > RESOLVE_PREFIX.length) return true;
  return false;
}

function hasWideningKey(record) {
  if (!record || typeof record !== 'object') return false;
  return WIDENING_KEYS.some((key) => Object.prototype.hasOwnProperty.call(record, key));
}

/**
 * entity_id may be a string or an array. Every id must be a single entity.
 * Area, device, label, and floor targets are rejected for scoped calls.
 */
function entityIdsFromBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (hasWideningKey(body)) return null;
  const chunks = [];
  if (Object.prototype.hasOwnProperty.call(body, 'entity_id')) chunks.push(body.entity_id);
  if (body.target != null) {
    if (typeof body.target !== 'object' || Array.isArray(body.target)) return null;
    if (hasWideningKey(body.target)) return null;
    const extra = Object.keys(body.target).filter((key) => key !== 'entity_id');
    if (extra.length > 0) return null;
    if (Object.prototype.hasOwnProperty.call(body.target, 'entity_id')) chunks.push(body.target.entity_id);
  }
  if (chunks.length === 0) return null;
  const ids = [];
  for (const chunk of chunks) {
    const list = Array.isArray(chunk) ? chunk : [chunk];
    if (list.length === 0) return null;
    for (const item of list) {
      if (typeof item !== 'string') return null;
      const trimmed = item.trim();
      if (!ENTITY_ID.test(trimmed)) return null;
      ids.push(trimmed);
    }
  }
  return ids;
}

function entitiesAllowed(domain, service, ids, settings) {
  const musicService = domain === 'media_player' && MUSIC_SERVICES.has(service);
  const controlService = CONTROL_SERVICES.has(service) && !BLOCKED_DOMAINS.has(domain);
  if (!musicService && !controlService) return false;
  const music = new Set(settings.musicPlayers);
  const control = new Set([...settings.toggleEntities, ...settings.privilegeEntities]);
  return ids.every((id) => {
    if (musicService && music.has(id)) return true;
    if (controlService && control.has(id)) return true;
    return false;
  });
}

function evaluateService(method, rawUrl, pathname, query, parsedBody, settings) {
  if (!returnResponseQueryOk(query)) return deny(method, rawUrl);
  const match = pathname.match(/^\/api\/services\/([a-z0-9_]+)\/([a-z0-9_]+)$/);
  if (!match) return deny(method, rawUrl);
  const domain = match[1];
  const service = match[2];
  if (BLOCKED_DOMAINS.has(domain)) return deny(method, rawUrl);
  const name = `${domain}.${service}`;
  if (UNSCOPED_SERVICES.has(name)) return allow();
  const ids = entityIdsFromBody(parsedBody);
  if (!ids || !entitiesAllowed(domain, service, ids, settings)) return deny(method, rawUrl);
  return allow();
}

/**
 * @param {string} method
 * @param {string} path request path, including the query string when present
 * @param {unknown} parsedBody JSON body, or null when there is no JSON body
 * @param {object} settings normalized entity lists, or the raw stored documents
 * @returns {{ allowed: true } | { allowed: false, detail: string }}
 */
function evaluateHaProxyPolicy(method, path, parsedBody, settings) {
  const verb = String(method || '').trim().toUpperCase();
  const { rawPath, query } = splitTarget(path);
  const pathname = decodePathname(rawPath);
  if (!pathname) return deny(method, path);
  const scope = normalizeSettings(settings);

  if (verb === 'GET' && isAllowedGet(pathname)) return allow();
  if (verb === 'POST' && pathname === MEDIA_UPLOAD_PATH && query === '') return allow();
  if (verb === 'POST' && pathname.startsWith('/api/services/')) {
    return evaluateService(verb, path, pathname, query, parsedBody, scope);
  }
  return deny(method, path);
}

/** True when the public proxy is the local-media upload and may carry a large body. */
function isHaMediaUpload(method, path) {
  const verb = String(method || '').trim().toUpperCase();
  const { rawPath, query } = splitTarget(path);
  const pathname = decodePathname(rawPath);
  return verb === 'POST' && pathname === MEDIA_UPLOAD_PATH && query === '';
}

module.exports = {
  BLOCKED_DOMAINS,
  CONTROL_SERVICES,
  MUSIC_SERVICES,
  UNSCOPED_SERVICES,
  evaluateHaProxyPolicy,
  isHaMediaUpload,
  proxySettingsFromStore,
};
