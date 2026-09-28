#!/usr/bin/with-contenv bashio
# Beacon -- Home Assistant Add-on entry point

if [ -n "${SUPERVISOR_TOKEN:-}" ]; then
  # Supervisor options take precedence in the add-on.
  THEME="$(bashio::config 'theme' 2>/dev/null || echo 'skylight')"
  AUTO_DARK_MODE="$(bashio::config 'auto_dark_mode' 2>/dev/null || echo 'true')"
  WEATHER_ENTITY="$(bashio::config 'weather_entity' 2>/dev/null || echo 'weather.home')"
  PHOTO_DIRECTORY="$(bashio::config 'photo_directory' 2>/dev/null || echo '/media/beacon/photos')"
  PHOTO_INTERVAL="$(bashio::config 'photo_interval' 2>/dev/null || echo '30')"
  SCREEN_SAVER_TIMEOUT="$(bashio::config 'screen_saver_timeout' 2>/dev/null || echo '5')"
  export BEACON_PARENT_PIN="$(bashio::config 'parent_pin' 2>/dev/null || true)"
  export BEACON_ALLOWED_ENTITIES="$(bashio::config 'allowed_entities' 2>/dev/null || true)"
  export BEACON_HOST="0.0.0.0"
else
  THEME="${THEME:-skylight}"
  AUTO_DARK_MODE="${AUTO_DARK_MODE:-true}"
  WEATHER_ENTITY="${WEATHER_ENTITY:-weather.home}"
  PHOTO_DIRECTORY="${PHOTO_DIRECTORY:-/media/beacon/photos}"
  PHOTO_INTERVAL="${PHOTO_INTERVAL:-30}"
  SCREEN_SAVER_TIMEOUT="${SCREEN_SAVER_TIMEOUT:-5}"
fi

# Fetch this add-on's own slug from the Supervisor API. /addons/self/* is
# callable with just the base SUPERVISOR_TOKEN, no extra permissions
# needed. Used to build stable /hassio/ingress/<slug> links (e.g. for Kid
# Display) instead of embedding the current session's ephemeral ingress
# token from window.location.href, which breaks (401) once that token
# rotates or is opened from a different session/device.
ADDON_SLUG=""
if [ -n "${SUPERVISOR_TOKEN:-}" ]; then
  ADDON_SELF_RESPONSE="$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
    http://supervisor/addons/self/info 2>&1)"
  ADDON_SELF_STATUS="$(echo "${ADDON_SELF_RESPONSE}" | tail -n1)"
  ADDON_SELF_BODY="$(echo "${ADDON_SELF_RESPONSE}" | sed '$d')"
  if [ "${ADDON_SELF_STATUS}" = "200" ]; then
    ADDON_SLUG="$(echo "${ADDON_SELF_BODY}" | jq -r '.data.slug // empty' 2>/dev/null || echo '')"
  fi
  if [ -z "${ADDON_SLUG}" ] && [ -n "${SUPERVISOR_TOKEN:-}" ]; then
    bashio::log.warning "Supervisor /addons/self/info returned status ${ADDON_SELF_STATUS}: ${ADDON_SELF_BODY}"
  fi
fi
if [ -z "${ADDON_SLUG}" ]; then
  bashio::log.warning "Could not determine add-on slug from Supervisor — Kid Display links cannot be shared."
else
  bashio::log.info "Add-on slug resolved: ${ADDON_SLUG}"
fi

# The server reaches Home Assistant with the Supervisor token (the browser
# never holds one; see server.js).
if [ -n "${SUPERVISOR_TOKEN:-}" ]; then
  bashio::log.info "Using the API proxy with the Supervisor token."
elif [ -n "${HA_TOKEN:-}" ] && [ -n "${HA_URL:-}" ]; then
  bashio::log.info "Using the API proxy with standalone Home Assistant credentials."
else
  bashio::log.warning "No Home Assistant credentials. Running in local-only mode."
fi

# The proxy server handles /api/* requests — the browser always uses same-origin.
# ha_url stays empty in the browser even when standalone HA_URL is set.
# The server alone reads HA_URL and HA_TOKEN; neither is sent to the page.

# Generate runtime-config.js using node for proper JSON escaping (prevents injection)
CONFIG_JS="/app/dist/runtime-config.js"
# The options go before `node` so they're in its environment. (They used to
# follow the script, where node only sees them as arguments: every add-on
# option was ignored and runtime-config.js always had the defaults.)
THEME="${THEME}" AUTO_DARK_MODE="${AUTO_DARK_MODE}" WEATHER_ENTITY="${WEATHER_ENTITY}" \
  PHOTO_DIRECTORY="${PHOTO_DIRECTORY}" PHOTO_INTERVAL="${PHOTO_INTERVAL}" \
  SCREEN_SAVER_TIMEOUT="${SCREEN_SAVER_TIMEOUT}" ADDON_SLUG="${ADDON_SLUG}" \
  node -e "
  const config = {
    ha_url: '',
    ha_token: '',
    ha_available: Boolean(process.env.SUPERVISOR_TOKEN || (process.env.HA_URL && process.env.HA_TOKEN)),
    theme: process.env.THEME || 'skylight',
    auto_dark_mode: process.env.AUTO_DARK_MODE !== 'false',
    weather_entity: process.env.WEATHER_ENTITY || 'weather.home',
    photo_directory: process.env.PHOTO_DIRECTORY || '/media/beacon/photos',
    photo_interval: parseInt(process.env.PHOTO_INTERVAL) || 30,
    screen_saver_timeout: parseInt(process.env.SCREEN_SAVER_TIMEOUT) || 5,
    addon_slug: process.env.ADDON_SLUG || '',
  };
  require('fs').writeFileSync(
    '${CONFIG_JS}',
    'window.__BEACON_CONFIG__ = ' + JSON.stringify(config) + ';'
  );
"

# Inject the runtime-config script tag into index.html if not already present
INDEX_HTML="/app/dist/index.html"
if ! grep -q 'runtime-config.js' "${INDEX_HTML}"; then
  sed -i 's|</head>|<script src="./runtime-config.js"></script></head>|' "${INDEX_HTML}"
fi

bashio::log.info "Starting Family server on port 3000..."
exec node /app/server.js
