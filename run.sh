#!/usr/bin/with-contenv bashio
# Beacon — Home Assistant Add-on entry point

# Read the Supervisor token for HA API auth
export SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN:-$(bashio::config 'access_token' 2>/dev/null || true)}"

# Inject runtime config into the built app
CONFIG_FILE="/app/dist/config.json"
cat > "$CONFIG_FILE" <<EOF
{
  "ha_url": "http://supervisor/core",
  "ha_token": "${SUPERVISOR_TOKEN}",
  "weather_entity": "$(bashio::config 'weather_entity' 2>/dev/null || echo 'weather.home')"
}
EOF

bashio::log.info "Starting Beacon on port 3000..."
exec serve /app/dist -l 3000 -s
