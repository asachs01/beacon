#!/usr/bin/with-contenv bashio
# Beacon entry point for Home Assistant add-on and standalone Docker modes.

BEACON_MODE="${BEACON_MODE:-addon}"
if [ "${BEACON_MODE}" = "standalone" ]; then
  FAMILY_NAME="${FAMILY_NAME:-My Family}"
  SAVE_CONFIG_IN_BROWSER="${SAVE_CONFIG_IN_BROWSER:-true}"
  THEME="${THEME:-skylight}"
  AUTO_DARK_MODE="${AUTO_DARK_MODE:-true}"
  WEATHER_ENTITY="${WEATHER_ENTITY:-weather.home}"
  PHOTO_DIRECTORY="${PHOTO_DIRECTORY:-/media/beacon/photos}"
  PHOTO_INTERVAL="${PHOTO_INTERVAL:-30}"
  SCREEN_SAVER_TIMEOUT="${SCREEN_SAVER_TIMEOUT:-5}"
  HA_URL="${HA_URL%/}"
  HA_TOKEN="${HA_TOKEN:-${SUPERVISOR_TOKEN:-}}"

  if [ -z "${HA_URL}" ] || [ -z "${HA_TOKEN}" ]; then
    echo "Standalone mode requires HA_URL and HA_TOKEN (a Home Assistant long-lived access token)." >&2
    exit 1
  fi

  DEPLOYMENT_MODE="standalone"
  SERVER_HA_URL="${HA_URL}"
  SERVER_HA_TOKEN="${HA_TOKEN}"
elif [ "${BEACON_MODE}" = "addon" ]; then
  FAMILY_NAME="$(bashio::config 'family_name' 2>/dev/null || echo 'My Family')"
  SAVE_CONFIG_IN_BROWSER="$(bashio::config 'save_config_in_browser' 2>/dev/null || echo 'true')"
  HA_TOKEN="$(bashio::config 'ha_token' 2>/dev/null || echo '')"
  THEME="$(bashio::config 'theme' 2>/dev/null || echo 'skylight')"
  AUTO_DARK_MODE="$(bashio::config 'auto_dark_mode' 2>/dev/null || echo 'true')"
  WEATHER_ENTITY="$(bashio::config 'weather_entity' 2>/dev/null || echo 'weather.home')"
  PHOTO_DIRECTORY="$(bashio::config 'photo_directory' 2>/dev/null || echo '/media/beacon/photos')"
  PHOTO_INTERVAL="$(bashio::config 'photo_interval' 2>/dev/null || echo '30')"
  SCREEN_SAVER_TIMEOUT="$(bashio::config 'screen_saver_timeout' 2>/dev/null || echo '5')"

  DEPLOYMENT_MODE="addon"
  SERVER_HA_URL=""
  SERVER_HA_TOKEN="${SUPERVISOR_TOKEN:-}"
  HA_URL=""
else
  echo "Invalid BEACON_MODE '${BEACON_MODE}'; expected 'addon' or 'standalone'." >&2
  exit 1
fi

if [ -n "${HA_TOKEN}" ]; then
  bashio::log.info "HA token configured."
elif [ -n "${SERVER_HA_TOKEN}" ]; then
  bashio::log.info "Using Home Assistant server-side API proxy."
else
  bashio::log.warning "No HA token available. HA integrations will not work."
fi

# Keep the token server-side; the backend proxy adds it to HA requests.
HA_BROWSER_TOKEN=""

# Generate runtime-config.js using node for proper JSON escaping (prevents injection)
CONFIG_JS="/app/dist/runtime-config.js"
DEPLOYMENT_MODE="${DEPLOYMENT_MODE}" CHORE_BACKEND="${CHORE_BACKEND:-native}" HA_URL="${HA_URL}" HA_BROWSER_TOKEN="${HA_BROWSER_TOKEN}" FAMILY_NAME="${FAMILY_NAME}" \
  SAVE_CONFIG_IN_BROWSER="${SAVE_CONFIG_IN_BROWSER}" THEME="${THEME}" \
  AUTO_DARK_MODE="${AUTO_DARK_MODE}" WEATHER_ENTITY="${WEATHER_ENTITY}" \
  PHOTO_DIRECTORY="${PHOTO_DIRECTORY}" PHOTO_INTERVAL="${PHOTO_INTERVAL}" \
  SCREEN_SAVER_TIMEOUT="${SCREEN_SAVER_TIMEOUT}" node -e "
  const config = {
    deployment_mode: process.env.DEPLOYMENT_MODE || 'addon',
    chore_backend: process.env.CHORE_BACKEND || 'native',
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
"

# Inject the runtime-config script tag into index.html if not already present
INDEX_HTML="/app/dist/index.html"
if ! grep -q 'runtime-config.js' "${INDEX_HTML}"; then
  sed -i 's|</head>|<script src="./runtime-config.js"></script></head>|' "${INDEX_HTML}"
fi

# Install Beacon voice intents into HA config (idempotent)
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
if [ "${BEACON_MODE}" = "standalone" ]; then
  HA_TOKEN="${SERVER_HA_TOKEN}" HA_API_BASE_OVERRIDE="${SERVER_HA_URL}" exec node /app/server.js
else
  exec node /app/server.js
fi
