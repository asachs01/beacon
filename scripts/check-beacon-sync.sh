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

# server.js and lib/ are copied into the add-on image from beacon/.
if ! diff -q server.js beacon/server.js > /dev/null 2>&1; then
  echo "❌ ERROR: beacon/server.js is out of sync with root server.js"
  echo "Run: cp server.js beacon/server.js"
  exit 1
fi

if ! diff -rq lib beacon/lib > /dev/null 2>&1; then
  echo "❌ ERROR: beacon/lib/ is out of sync with root lib/"
  echo "Run: rsync -av --delete lib/ beacon/lib/"
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

echo "Checking beacon/package.json dependency parity with root package.json..."

# The Supervisor builds the add-on from beacon/ (`npm ci` + `npm run build`).
# Every root runtime dependency that image needs must be declared there at the
# same version specifier. Native Capacitor shells are intentionally root-only:
# nothing in the add-on bundle imports them, and installing them only slows
# the image build. Test and release devDependencies stay root-only for the
# same reason. Build tools the Dockerfile actually runs must still match.
node --input-type=module << 'EOF'
import { readFileSync } from 'node:fs';

const root = JSON.parse(readFileSync('package.json', 'utf8'));
const beacon = JSON.parse(readFileSync('beacon/package.json', 'utf8'));

// Not part of the Home Assistant add-on build. A new root dependency is
// still a failure until it is added to beacon/ or listed here on purpose.
const rootOnlyDependencies = new Set([
  '@capacitor/android',
  '@capacitor/ios',
]);

const buildDevDependencies = [
  '@types/react',
  '@types/react-dom',
  '@vitejs/plugin-react',
  'typescript',
  'vite',
];

const errors = [];
const rootDeps = root.dependencies ?? {};
const beaconDeps = beacon.dependencies ?? {};

for (const [name, spec] of Object.entries(rootDeps)) {
  if (rootOnlyDependencies.has(name)) continue;
  if (!(name in beaconDeps)) {
    errors.push(`missing dependency ${name}@${spec}`);
  } else if (beaconDeps[name] !== spec) {
    errors.push(`dependency ${name} is ${beaconDeps[name]} in beacon/ but ${spec} at the repo root`);
  }
}

const rootDev = root.devDependencies ?? {};
const beaconDev = beacon.devDependencies ?? {};
for (const name of buildDevDependencies) {
  const spec = rootDev[name];
  if (!spec) {
    errors.push(`root package.json is missing build devDependency ${name}`);
    continue;
  }
  if (!(name in beaconDev)) {
    errors.push(`missing build devDependency ${name}@${spec}`);
  } else if (beaconDev[name] !== spec) {
    errors.push(`build devDependency ${name} is ${beaconDev[name]} in beacon/ but ${spec} at the repo root`);
  }
}

if (errors.length > 0) {
  console.error('❌ ERROR: beacon/package.json does not cover the add-on dependencies from root package.json');
  for (const error of errors) console.error(`  - ${error}`);
  console.error('');
  console.error('The Home Assistant image runs `npm ci` from beacon/package.json.');
  console.error('Add the missing packages there with the same version specifiers as root, then run `npm install` inside beacon/.');
  process.exit(1);
}

console.log('✅ beacon/package.json dependencies cover the add-on build');
EOF

echo "✅ beacon/ directory is in sync with root"

node scripts/check-addon-manifests.mjs
node scripts/check-release-image-order.mjs
