'use strict';

/**
 * Where Beacon's server sends Home Assistant calls.
 *
 * Add-on mode is SUPERVISOR_TOKEN being set. The API and WebSocket URLs stay
 * on the Supervisor unless HA_API_BASE_OVERRIDE or HA_WS_URL_OVERRIDE is set.
 *
 * Standalone mode (no Supervisor token) uses HA_URL, with a trailing slash
 * removed, and HA_TOKEN. http becomes ws and https becomes wss, then
 * /api/websocket is appended. The same overrides still win when they are set.
 */

const ADDON_API_BASE = 'http://supervisor/core';
const ADDON_WS_URL = 'ws://supervisor/core/api/websocket';

const STANDALONE_CONFIG_ERROR = 'Standalone mode needs HA_URL and HA_TOKEN. Set HA_URL to your Home Assistant base URL and HA_TOKEN to a long-lived access token from Profile → Long-Lived Access Tokens. Beacon will keep serving the UI.';

function stripTrailingSlashes(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

/** http(s) base URL → ws(s)://…/api/websocket. Empty when there is no base. */
function toWebSocketUrl(httpUrl) {
  const base = stripTrailingSlashes(httpUrl);
  if (!base) return '';
  const wsBase = base.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  return `${wsBase}/api/websocket`;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function resolveHaConnection(env = {}) {
  const supervisorToken = env.SUPERVISOR_TOKEN || '';
  const haToken = env.HA_TOKEN || '';
  const addon = supervisorToken.length > 0;
  const token = supervisorToken || haToken;
  const apiOverride = env.HA_API_BASE_OVERRIDE || '';
  const wsOverride = env.HA_WS_URL_OVERRIDE || '';
  const haUrl = stripTrailingSlashes(env.HA_URL || '');

  // Overrides are used as given, including a trailing slash, so add-on
  // behavior matches the previous `OVERRIDE || supervisor` assignment.
  const apiBase = apiOverride
    ? apiOverride
    : (addon ? ADDON_API_BASE : haUrl);

  let wsUrl;
  if (wsOverride) {
    wsUrl = wsOverride;
  } else if (addon) {
    wsUrl = ADDON_WS_URL;
  } else {
    wsUrl = toWebSocketUrl(haUrl || apiOverride);
  }

  return {
    mode: addon ? 'addon' : 'standalone',
    apiBase,
    wsUrl,
    token,
    hasToken: token.length > 0,
    haUrl,
  };
}

/** One startup error when standalone is missing HA_URL or a token. Null otherwise. */
function standaloneConfigError(connection) {
  if (!connection || connection.mode !== 'standalone') return null;
  if (connection.haUrl && connection.hasToken) return null;
  return STANDALONE_CONFIG_ERROR;
}

/**
 * Host, port, and path for an absolute Home Assistant URL.
 * http defaults to port 80 and https to 443. An explicit port is kept.
 */
function describeHaHttpTarget(absoluteUrl) {
  const url = new URL(absoluteUrl);
  const secure = url.protocol === 'https:';
  return {
    secure,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : (secure ? 443 : 80),
    path: `${url.pathname}${url.search}`,
  };
}

module.exports = {
  ADDON_API_BASE,
  ADDON_WS_URL,
  STANDALONE_CONFIG_ERROR,
  resolveHaConnection,
  standaloneConfigError,
  toWebSocketUrl,
  describeHaHttpTarget,
};
