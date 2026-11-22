#!/usr/bin/env bash
# semantic-release prepare step. Runs from @semantic-release/exec, which is
# listed before @semantic-release/git in .releaserc.json.
#
# semantic-release runs prepare plugins in order and stops at the first
# rejection (pipeline settleAll defaults to false). This script exits
# non-zero when the image push fails, so the git plugin never commits or
# pushes the version bump, and the core never creates the release tag.
set -euo pipefail

version="${1:?version required}"

sed -i "s/^version:.*/version: \"${version}\"/" beacon/config.yaml
cp CHANGELOG.md beacon/CHANGELOG.md

# Returning from this script is what allows the version bump onto main.
bash scripts/publish-addon-image.sh "$version"
