#!/usr/bin/with-contenv bashio
# Beacon -- Home Assistant Add-on entry point
#
# Add-on mode: SUPERVISOR_TOKEN is set, or bashio::supervisor.ping succeeds.
# Options come from the Supervisor. The browser talks to this server, which
# adds the Supervisor token. ha_url and the browser token stay empty.
#
# Standalone mode (Docker, k3s): no Supervisor. HA_URL, HA_TOKEN, and
# FAMILY_NAME come from the environment. HA_URL is not cleared. The browser
# token stays empty, the same way the add-on's ha_token option does: it is
# read into HA_TOKEN and is not copied into runtime-config.js. server.js
# sends HA_TOKEN on Home Assistant requests, and the page keeps calling
# this server so a browser that cannot reach HA_URL still works.

ADDON_MODE=0
if [ -n "${SUPERVISOR_TOKEN:-}" ]; then
  ADDON_MODE=1
elif bashio::supervisor.ping >/dev/null 2>&1; then
  ADDON_MODE=1
fi

if [ "${ADDON_MODE}" -eq 1 ]; then
  # Read options from /data/options.json (populated by HA Supervisor)
  FAMILY_NAME="$(bashio::config 'family_name' 2>/dev/null || echo 'My Family')"
  SAVE_CONFIG_IN_BROWSER="$(bashio::config 'save_config_in_browser' 2>/dev/null || echo 'true')"
  HA_TOKEN="$(bashio::config 'ha_token' 2>/dev/null || echo '')"
  THEME="$(bashio::config 'theme' 2>/dev/null || echo 'skylight')"
  AUTO_DARK_MODE="$(bashio::config 'auto_dark_mode' 2>/dev/null || echo 'true')"
  WEATHER_ENTITY="$(bashio::config 'weather_entity' 2>/dev/null || echo 'weather.home')"
  PHOTO_DIRECTORY="$(bashio::config 'photo_directory' 2>/dev/null || echo '/media/beacon/photos')"
  PHOTO_INTERVAL="$(bashio::config 'photo_interval' 2>/dev/null || echo '30')"
  SCREEN_SAVER_TIMEOUT="$(bashio::config 'screen_saver_timeout' 2>/dev/null || echo '5')"

  # Log token status
  if [ -n "${HA_TOKEN}" ]; then
    bashio::log.info "HA token configured (user-provided)."
  elif [ -n "${SUPERVISOR_TOKEN:-}" ]; then
    bashio::log.info "No user token — using API proxy with Supervisor token."
  else
    bashio::log.warning "No HA token and no Supervisor token. Calendar/list integrations will not work."
  fi

  # The proxy server handles /api/* requests — the browser always uses same-origin.
  # ha_url stays empty so the frontend uses window.location.origin (the proxy).
  # ha_token is cleared in the runtime config — the proxy injects auth server-side.
  # This means zero config needed from the user for HA connectivity.
  HA_URL=""
  HA_BROWSER_TOKEN=""
else
  FAMILY_NAME="${FAMILY_NAME:-My Family}"
  SAVE_CONFIG_IN_BROWSER="${SAVE_CONFIG_IN_BROWSER:-true}"
  HA_TOKEN="${HA_TOKEN:-}"
  THEME="${THEME:-skylight}"
  AUTO_DARK_MODE="${AUTO_DARK_MODE:-true}"
  WEATHER_ENTITY="${WEATHER_ENTITY:-weather.home}"
  PHOTO_DIRECTORY="${PHOTO_DIRECTORY:-/media/beacon/photos}"
  PHOTO_INTERVAL="${PHOTO_INTERVAL:-30}"
  SCREEN_SAVER_TIMEOUT="${SCREEN_SAVER_TIMEOUT:-5}"
  # Keep a provided HA_URL. Bind an empty value when it was never set: the
  # Supervisor shell runs with nounset, and an unbound HA_URL aborts startup
  # before the UI can be served.
  HA_URL="${HA_URL:-}"
  # HA_BROWSER_TOKEN is the runtime-config ha_token. Leave it empty, matching
  # the add-on ha_token option: the proxy adds HA_TOKEN server-side.
  HA_BROWSER_TOKEN=""
fi

# Generate runtime-config.js using node for proper JSON escaping (prevents injection)
CONFIG_JS="/app/dist/runtime-config.js"
node -e "
  const config = {
    ha_url: process.env.HA_URL || '',
    ha_token: process.env.HA_BROWSER_TOKEN || '',
    family_name: process.env.FAMILY_NAME || 'My Family',
    save_config_in_browser: process.env.SAVE_CONFIG_IN_BROWSER !== 'false',
    theme: process.env.THEME || 'skylight',
    auto_dark_mode: process.env.AUTO_DARK_MODE !== 'false',
    weather_entity: process.env.WEATHER_ENTITY || 'weather.home',
    photo_directory: process.env.PHOTO_DIRECTORY || '/media/beacon/photos',
    photo_interval: parseInt(process.env.PHOTO_INTERVAL) || 30,
    screen_saver_timeout: parseInt(process.env.SCREEN_SAVER_TIMEOUT) || 5,
  };
  require('fs').writeFileSync(
    '${CONFIG_JS}',
    'window.__BEACON_CONFIG__ = ' + JSON.stringify(config) + ';'
  );
" HA_URL="${HA_URL}" HA_BROWSER_TOKEN="${HA_BROWSER_TOKEN}" FAMILY_NAME="${FAMILY_NAME}" \
  SAVE_CONFIG_IN_BROWSER="${SAVE_CONFIG_IN_BROWSER}" \
  THEME="${THEME}" AUTO_DARK_MODE="${AUTO_DARK_MODE}" WEATHER_ENTITY="${WEATHER_ENTITY}" \
  PHOTO_DIRECTORY="${PHOTO_DIRECTORY}" PHOTO_INTERVAL="${PHOTO_INTERVAL}" \
  SCREEN_SAVER_TIMEOUT="${SCREEN_SAVER_TIMEOUT}"

# Inject the runtime-config script tag into index.html if not already present
INDEX_HTML="/app/dist/index.html"
if ! grep -q 'runtime-config.js' "${INDEX_HTML}"; then
  sed -i 's|</head>|<script src="./runtime-config.js"></script></head>|' "${INDEX_HTML}"
fi

# Install Beacon voice intents into HA config (idempotent). /config is the
# Supervisor share; skip it when this container is not an add-on.
if [ "${ADDON_MODE}" -eq 1 ]; then
  VOICE_SENTENCES_SRC="/app/custom_sentences/en/beacon.yaml"
  VOICE_INTENTS_SRC="/app/custom_intents/beacon.yaml"
  if [ -f "${VOICE_SENTENCES_SRC}" ]; then
    mkdir -p /config/custom_sentences/en
    cp "${VOICE_SENTENCES_SRC}" /config/custom_sentences/en/beacon.yaml
    bashio::log.info "Installed Beacon voice sentences to /config/custom_sentences/en/"
  fi
  if [ -f "${VOICE_INTENTS_SRC}" ]; then
    mkdir -p /config/custom_intents
    cp "${VOICE_INTENTS_SRC}" /config/custom_intents/beacon.yaml
    bashio::log.info "Installed Beacon voice intents to /config/custom_intents/"
  fi

  bashio::log.info "Starting Beacon server on port 3000 (API proxy enabled)..."
else
  echo "Starting Beacon server on port 3000 (standalone)..."
fi
exec node /app/server.js
