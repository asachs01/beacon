#!/usr/bin/env bash
# Push the multi-arch add-on image for one version.
# armv7 stays in this publish even though beacon/config.yaml no longer lists
# it: Home Assistant deprecated that arch, and this release still ships the
# image so an existing armv7 install can pull the update.
set -euo pipefail

version="${1:?version required}"
image="${IMAGE_NAME:-ghcr.io/asachs01/beacon}"
build_from="${BUILD_FROM:-ghcr.io/hassio-addons/base:16.3.2}"

docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  --build-arg "BUILD_FROM=${build_from}" \
  --tag "${image}:${version}" \
  --tag "${image}:latest" \
  --push \
  beacon/
