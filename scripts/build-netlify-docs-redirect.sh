#!/bin/bash
# Write a one-file Netlify publish directory for the docs cutover.
# _redirects forces every path to the same path on https://beaconboard.app.
# This does not delete the Netlify site.

set -euo pipefail

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "usage: scripts/build-netlify-docs-redirect.sh <output-dir>" >&2
  exit 1
fi

out="$1"
mkdir -p "$out"
printf '%s\n' '/*  https://beaconboard.app/:splat  301!' > "$out/_redirects"
echo "Wrote $out/_redirects"
