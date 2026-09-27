/**
 * Access rules for the add-on server (server.js).
 *
 * server.js talks to Home Assistant with the Supervisor token, which has
 * admin rights. Anyone who can open Family through HA ingress — including
 * family members whose own HA accounts are restricted — reaches HA through
 * that token, so the server only passes on what Family itself needs:
 *
 * - isServiceAllowed: the HA services the app calls. Anything else (e.g.
 *   homeassistant.restart, lock.unlock, script.*) is refused.
 * - isProxyRequestAllowed: the /api/* paths the app reads (entity states,
 *   calendars), plus allowed service calls.
 * - isCrossOriginWrite: refuses writes sent by another website (CSRF).
 *
 * Kept out of server.js so they can be unit-tested
 * (src/server-guards.test.ts). The .cjs extension keeps this CommonJS
 * despite package.json's "type": "module"; the Dockerfile copies it next
 * to server.js.
 */

/**
 * Domains the HA Toggle card can switch. Keep in sync with TOGGLE_DOMAINS
 * in src/components/cards/toggle-domains.ts.
 */
const TOGGLE_DOMAINS = ['light', 'switch', 'input_boolean', 'fan'];

/**
 * Every Home Assistant service Family calls, by domain. When the app starts
 * calling a new service (callHaService in src/), add it here or the server
 * answers 403.
 */
const ALLOWED_SERVICES = new Map(Object.entries({
  // To-do lists: Tasks, Shopping, chores sync (src/api/ha-services.ts,
  // src/api/anylist.ts, src/hooks/useChoresSync.ts, useDashboardTasks.ts)
  todo: ['get_items', 'add_item', 'update_item', 'remove_item'],
  // Chores sync asks HA to refresh a list before reading it
  homeassistant: ['update_entity'],
  weather: ['get_forecasts'],
  // Music controls, including play/pause fallbacks (src/api/music.ts)
  media_player: [
    'media_play', 'media_pause', 'media_play_pause', 'toggle',
    'media_next_track', 'media_previous_track', 'volume_set',
    'media_seek', 'shuffle_set', 'repeat_set',
  ],
  // HA Toggle card (src/components/cards/HaToggleCard.tsx)
  ...Object.fromEntries(TOGGLE_DOMAINS.map((domain) => [domain, ['toggle']])),
}).map(([domain, services]) => [domain, new Set(services)]));

function isServiceAllowed(domain, service) {
  return ALLOWED_SERVICES.get(domain)?.has(service) === true;
}

// HA entity ids are lowercase letters, digits and underscores around one
// dot. Matching the raw path this strictly also rules out "..", "%2e" and
// other tricks that could steer the proxied URL to a different HA endpoint.
const ENTITY_ID = '[a-z0-9_]+\\.[a-z0-9_]+';
const PROXY_READ_PATHS = [
  /^\/api\/states$/,
  new RegExp(`^/api/states/${ENTITY_ID}$`),
  /^\/api\/calendars$/,
  new RegExp(`^/api/calendars/${ENTITY_ID}$`),
];
const PROXY_SERVICE_PATH = /^\/api\/services\/([a-z0-9_]+)\/([a-z0-9_]+)$/;

/**
 * Whether the /api/* proxy may forward this request. The app only reads
 * states and calendars there (src/api/ha-rest.ts, useCalendarEvents.ts);
 * service calls normally go through /beacon-action/service, but an allowed
 * one sent to /api/services/<domain>/<service> is let through too.
 */
function isProxyRequestAllowed(method, url) {
  const pathname = url.split('?')[0];
  if (method === 'GET') return PROXY_READ_PATHS.some((pattern) => pattern.test(pathname));
  if (method === 'POST') {
    const match = PROXY_SERVICE_PATH.exec(pathname);
    return match !== null && isServiceAllowed(match[1], match[2]);
  }
  return false;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** "host:443" and "host" are the same address; so are "host:80" and "host". */
function normalizeHost(host) {
  return host.trim().toLowerCase().replace(/:(80|443)$/, '');
}

/**
 * True when a state-changing request was sent by a page on another origin
 * (cross-site request forgery). Same approach as Go's
 * http.CrossOriginProtection:
 *
 * 1. Modern browsers send Sec-Fetch-Site, which a page can't fake. Only
 *    "same-origin" (and "none": typed or bookmarked by the user) passes.
 *    This needs no host comparison, so it works behind any reverse proxy.
 * 2. Older browsers (e.g. an old wall tablet) send only Origin. It must
 *    match the address the browser used, which HA ingress passes on as
 *    X-Forwarded-Host (Host is accepted as well).
 * 3. With neither header the request isn't from a web page (curl, HA's
 *    rest_command, another add-on) and passes: browsers from recent years
 *    send at least one of the two on every cross-origin write.
 *
 * Family's own fetch() and sendBeacon() calls carry Sec-Fetch-Site:
 * same-origin (or a matching Origin), so saving still works. HA's
 * SameSite=Strict ingress cookie already stops most cross-site requests;
 * this also covers pages on the same host (another add-on's web UI on a
 * different port) and sibling subdomains, which count as "same site".
 */
function isCrossOriginWrite(method, headers) {
  if (SAFE_METHODS.has(method)) return false;

  const fetchSite = headers['sec-fetch-site'];
  if (fetchSite) return fetchSite !== 'same-origin' && fetchSite !== 'none';

  const origin = headers.origin;
  if (!origin) return false;

  let originHost;
  try {
    originHost = normalizeHost(new URL(origin).host);
  } catch {
    return true; // "null" (sandboxed or privacy-stripped) or garbage
  }
  if (!originHost) return true;

  const requestHosts = [headers['x-forwarded-host'], headers.host]
    .flatMap((value) => (value ? String(value).split(',') : []))
    .map(normalizeHost)
    .filter(Boolean);
  return !requestHosts.includes(originHost);
}

/** Who sent a request, for log lines. HA's Supervisor adds the user headers. */
function describeRequester(headers) {
  const user = headers['x-remote-user-display-name'] || headers['x-remote-user-name'] || 'unknown user';
  const device = headers['user-agent'] || 'unknown device';
  return `user=${JSON.stringify(String(user).slice(0, 100))} device=${JSON.stringify(String(device).slice(0, 200))}`;
}

module.exports = {
  TOGGLE_DOMAINS,
  isServiceAllowed,
  isProxyRequestAllowed,
  isCrossOriginWrite,
  describeRequester,
};
