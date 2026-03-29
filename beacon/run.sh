#!/usr/bin/with-contenv bashio
# Beacon -- Home Assistant Add-on entry point

# Read options from /data/options.json (populated by HA Supervisor)
FAMILY_NAME="$(bashio::config 'family_name' 2>/dev/null || echo 'My Family')"
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

# Generate runtime-config.js that injects config into the static build
CONFIG_JS="/app/dist/runtime-config.js"
cat > "${CONFIG_JS}" <<EOF
window.__BEACON_CONFIG__ = {
  ha_url: "${HA_URL}",
  ha_token: "${HA_BROWSER_TOKEN}",
  family_name: "${FAMILY_NAME}",
  theme: "${THEME}",
  auto_dark_mode: ${AUTO_DARK_MODE},
  weather_entity: "${WEATHER_ENTITY}",
  photo_directory: "${PHOTO_DIRECTORY}",
  photo_interval: ${PHOTO_INTERVAL},
  screen_saver_timeout: ${SCREEN_SAVER_TIMEOUT}
};
EOF

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
exec node /app/server.js
