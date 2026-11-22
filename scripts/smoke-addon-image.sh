#!/usr/bin/env bash
# Run the add-on image the way Supervisor does when init is false:
# Docker's init process is not used, so the image entrypoint (s6) stays PID 1.
set -euo pipefail

platform="${1:-linux/amd64}"
port="${2:-3000}"
tag="beacon-addon:smoke"
name="beacon-smoke-${port}"
build_from="${BUILD_FROM:-ghcr.io/hassio-addons/base:16.3.2}"

docker build \
  --platform "$platform" \
  --build-arg "BUILD_FROM=${build_from}" \
  --tag "$tag" \
  beacon/

datadir="$(mktemp -d)"
cat > "${datadir}/options.json" << 'EOF'
{
  "family_name": "Test Family",
  "ha_token": "",
  "save_config_in_browser": true,
  "theme": "skylight",
  "auto_dark_mode": true,
  "weather_entity": "weather.home",
  "photo_directory": "/media/beacon/photos",
  "photo_interval": 30,
  "screen_saver_timeout": 5
}
EOF

docker rm -f "$name" >/dev/null 2>&1 || true
# Leave the image entrypoint in place. Do not add a Docker init process.
docker run -d --name "$name" --platform "$platform" \
  -p "${port}:3000" \
  -v "${datadir}:/data" \
  "$tag"

cleanup() {
  docker logs "$name" > "${datadir}/logs.txt" 2>&1 || true
  docker rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 30); do
  if curl -sf -m 3 -o /dev/null "http://127.0.0.1:${port}/"; then
    ready=1
    break
  fi
  sleep 2
done

code="$(curl -s -m 5 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${port}/" || true)"
logs="$(docker logs "$name" 2>&1 || true)"
printf '%s\n' "$logs"

if printf '%s\n' "$logs" | grep -F "s6-overlay-suexec: fatal"; then
  echo "s6-overlay was not PID 1 (${platform})"
  exit 1
fi
if [ "$ready" != "1" ] || [ "$code" != "200" ]; then
  echo "GET / on :${port} returned ${code} (${platform})"
  exit 1
fi
echo "smoke ok ${platform} GET / ${code}"
