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

# Resolve auth: prefer user-provided long-lived token, fall back to Supervisor token
if [ -z "${HA_TOKEN}" ] && [ -n "${SUPERVISOR_TOKEN:-}" ]; then
  HA_TOKEN="${SUPERVISOR_TOKEN}"
  bashio::log.info "Using Supervisor token for HA API access."
elif [ -z "${HA_TOKEN}" ]; then
  bashio::log.warning "No HA token configured. Go to add-on Configuration and paste a long-lived access token."
  bashio::log.info "Create one at: HA Profile → Long-lived Access Tokens → Create Token"
else
  bashio::log.info "HA token configured (user-provided)."
fi

# Resolve HA URL for browser-side API calls
# In ingress mode, the browser can reach HA at the ingress origin
# For container-side calls, http://supervisor/core works but not from the browser
HA_URL=""
if [ -n "${SUPERVISOR_TOKEN:-}" ]; then
  # Get the HA external URL from the Supervisor API
  HA_URL="$(curl -s -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" http://supervisor/core/api/config 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('external_url') or d.get('internal_url') or '')" 2>/dev/null || echo '')"
  if [ -n "${HA_URL}" ]; then
    bashio::log.info "Resolved HA URL: ${HA_URL}"
  fi
fi

# Generate runtime-config.js that injects config into the static build
CONFIG_JS="/app/dist/runtime-config.js"
cat > "${CONFIG_JS}" <<EOF
window.__BEACON_CONFIG__ = {
  ha_url: "${HA_URL}",
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
