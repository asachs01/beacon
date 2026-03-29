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

if [ -z "${HA_TOKEN}" ]; then
  bashio::log.warning "No HA token configured. Go to add-on Configuration and paste a long-lived access token."
  bashio::log.info "Create one at: HA Profile → Long-lived Access Tokens → Create Token"
else
  bashio::log.info "HA token configured."
fi

# Generate runtime-config.js that injects config into the static build
CONFIG_JS="/app/dist/runtime-config.js"
cat > "${CONFIG_JS}" <<EOF
window.__BEACON_CONFIG__ = {
  ha_url: "",
  ha_token: "${HA_TOKEN}",
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
  sed -i 's|</head>|<script src="/runtime-config.js"></script></head>|' "${INDEX_HTML}"
fi

bashio::log.info "Starting Beacon on port 3000..."
exec serve /app/dist -l 3000 -s
