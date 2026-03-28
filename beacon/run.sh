#!/bin/sh
# Beacon -- Home Assistant Add-on entry point

# The supervisor token only works inside the container network.
# For ingress (browser-side), we need a long-lived access token.
# Check for a user-provided token first, fall back to supervisor token.
SUPERVISOR_TOKEN="${BEACON_HA_TOKEN:-${SUPERVISOR_TOKEN:-}}"

# Read options from /data/options.json if it exists (populated by HA Supervisor)
if [ -f /data/options.json ]; then
  FAMILY_NAME="$(cat /data/options.json | sed -n 's/.*"family_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  USER_HA_TOKEN="$(cat /data/options.json | sed -n 's/.*"ha_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  # Prefer user-provided token over supervisor token
  if [ -n "$USER_HA_TOKEN" ]; then
    SUPERVISOR_TOKEN="$USER_HA_TOKEN"
  fi
  THEME="$(cat /data/options.json | sed -n 's/.*"theme"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  AUTO_DARK_MODE="$(cat /data/options.json | sed -n 's/.*"auto_dark_mode"[[:space:]]*:[[:space:]]*\([a-z]*\).*/\1/p')"
  WEATHER_ENTITY="$(cat /data/options.json | sed -n 's/.*"weather_entity"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  PHOTO_DIRECTORY="$(cat /data/options.json | sed -n 's/.*"photo_directory"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  PHOTO_INTERVAL="$(cat /data/options.json | sed -n 's/.*"photo_interval"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p')"
  SCREEN_SAVER_TIMEOUT="$(cat /data/options.json | sed -n 's/.*"screen_saver_timeout"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p')"
fi

FAMILY_NAME="${FAMILY_NAME:-My Family}"
THEME="${THEME:-skylight}"
AUTO_DARK_MODE="${AUTO_DARK_MODE:-true}"
WEATHER_ENTITY="${WEATHER_ENTITY:-weather.home}"
PHOTO_DIRECTORY="${PHOTO_DIRECTORY:-/media/beacon/photos}"
PHOTO_INTERVAL="${PHOTO_INTERVAL:-30}"
SCREEN_SAVER_TIMEOUT="${SCREEN_SAVER_TIMEOUT:-5}"
# For ingress, the browser connects to HA via the same origin (relative path)
# The WebSocket needs the actual HA URL, which the browser knows as window.location.origin
HA_URL="${HA_URL:-}"

# Generate runtime-config.js
CONFIG_JS="/app/dist/runtime-config.js"
cat > "${CONFIG_JS}" <<EOF
window.__BEACON_CONFIG__ = {
  ha_url: "${HA_URL}",
  ha_token: "${SUPERVISOR_TOKEN}",
  family_name: "${FAMILY_NAME}",
  theme: "${THEME}",
  auto_dark_mode: ${AUTO_DARK_MODE},
  weather_entity: "${WEATHER_ENTITY}",
  photo_directory: "${PHOTO_DIRECTORY}",
  photo_interval: ${PHOTO_INTERVAL},
  screen_saver_timeout: ${SCREEN_SAVER_TIMEOUT}
};
EOF

# Inject runtime-config script tag into index.html
INDEX_HTML="/app/dist/index.html"
if ! grep -q 'runtime-config.js' "${INDEX_HTML}"; then
  sed -i 's|</head>|<script src="./runtime-config.js"></script></head>|' "${INDEX_HTML}"
fi

echo "Starting Beacon on port 3000..."
exec serve /app/dist -l 3000 -s
