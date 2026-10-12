#!/bin/bash
# Check that beacon/src/ is in sync with root src/
# This ensures the HA add-on build includes all changes

set -e

echo "Checking beacon/src/ sync with root src/..."

# Compare directories
if ! diff -r src/ beacon/src/ --brief; then
  echo ""
  echo "❌ ERROR: beacon/src/ is out of sync with root src/"
  echo ""
  echo "After ANY source change, you must sync with:"
  echo "  rsync -av --delete src/ beacon/src/"
  echo "  cp Dockerfile run.sh CHANGELOG.md beacon/"
  echo ""
  echo "See CLAUDE.md for details on the dual-directory structure."
  exit 1
fi

# Check that required files are synced
for file in Dockerfile run.sh CHANGELOG.md; do
  if ! diff "$file" "beacon/$file" > /dev/null 2>&1; then
    echo "❌ ERROR: beacon/$file is out of sync with root"
    echo "Run: cp $file beacon/"
    exit 1
  fi
done

echo "✅ beacon/ directory is in sync with root"
