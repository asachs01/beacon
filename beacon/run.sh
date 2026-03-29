#!/usr/bin/with-contenv bashio
# Beacon -- Home Assistant Add-on entry point

# Read the Supervisor token from environment
SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN:-}"

# For browser-side API calls, we need the HA URL that's accessible from the browser.
# Inside the container, we can reach HA at http://supervisor/core, but the browser
# needs the external URL. We'll use the ingress path for API calls instead.

# Read options from /data/options.json (populated by HA Supervisor)
FAMILY_NAME="$(bashio::config 'family_name' 2>/dev/null || echo 'My Family')"
THEME="$(bashio::config 'theme' 2>/dev/null || echo 'skylight')"
AUTO_DARK_MODE="$(bashio::config 'auto_dark_mode' 2>/dev/null || echo 'true')"
WEATHER_ENTITY="$(bashio::config 'weather_entity' 2>/dev/null || echo 'weather.home')"
PHOTO_DIRECTORY="$(bashio::config 'photo_directory' 2>/dev/null || echo '/media/beacon/photos')"
PHOTO_INTERVAL="$(bashio::config 'photo_interval' 2>/dev/null || echo '30')"
SCREEN_SAVER_TIMEOUT="$(bashio::config 'screen_saver_timeout' 2>/dev/null || echo '5')"

# Create a long-lived access token via the Supervisor API for browser-side use.
# The SUPERVISOR_TOKEN only works from within the container network.
HA_TOKEN=""
if [ -n "${SUPERVISOR_TOKEN}" ]; then
  # Try to create a long-lived token via the HA REST API through supervisor proxy
  HA_TOKEN=$(curl -s -X POST \
    -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"client_name":"Beacon Add-on","lifespan":365}' \
    "http://supervisor/core/api/auth/long_lived_access_token" 2>/dev/null | tr -d '"' || echo "")

  if [ -z "${HA_TOKEN}" ] || [ "${HA_TOKEN}" = "null" ]; then
    bashio::log.warning "Could not create long-lived token. Using supervisor token as fallback."
    HA_TOKEN="${SUPERVISOR_TOKEN}"
  else
    bashio::log.info "Created long-lived access token for browser-side API calls."
  fi
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
