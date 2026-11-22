/**
 * The image for version X is pushed before the commit that sets
 * beacon/config.yaml to X can land on main.
 *
 * semantic-release calls prepare plugins in order and aborts the pipeline
 * when one rejects (lib/plugins/pipeline.js, settleAll defaults to false).
 * @semantic-release/exec prepareCmd runs scripts/prepare-addon-release.sh,
 * which pushes the image and exits non-zero on failure. @semantic-release/git
 * is the next prepare plugin and is what commits and pushes the bump.
 * index.js creates the git tag only after plugins.prepare resolves.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const rc = JSON.parse(readFileSync('.releaserc.json', 'utf8'));
const pluginName = (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin);
const execIndex = rc.plugins.findIndex(
  (plugin) =>
    Array.isArray(plugin) &&
    plugin[0] === '@semantic-release/exec' &&
    String(plugin[1]?.prepareCmd ?? '').includes('scripts/prepare-addon-release.sh'),
);
const gitIndex = rc.plugins.findIndex((plugin) => pluginName(plugin) === '@semantic-release/git');
if (execIndex < 0 || gitIndex < 0 || execIndex > gitIndex) {
  console.error(
    `Image publish prepareCmd (index ${execIndex}) must come before @semantic-release/git (index ${gitIndex})`,
  );
  process.exit(1);
}

const gitAssets = rc.plugins[gitIndex][1]?.assets ?? [];
if (gitAssets.includes('config.yaml') || !gitAssets.includes('beacon/config.yaml')) {
  console.error('@semantic-release/git must commit beacon/config.yaml and not a root config.yaml');
  process.exit(1);
}

const prepare = readFileSync('scripts/prepare-addon-release.sh', 'utf8');
const publish = readFileSync('scripts/publish-addon-image.sh', 'utf8');
const releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8');
const buildWorkflow = readFileSync('.github/workflows/build-addon.yml', 'utf8');
const smoke = readFileSync('scripts/smoke-addon-image.sh', 'utf8');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

function requireIncludes(label, text, needles) {
  for (const needle of needles) {
    if (!text.includes(needle)) {
      console.error(`${label} is missing ${JSON.stringify(needle)}`);
      process.exit(1);
    }
  }
}

requireIncludes('scripts/prepare-addon-release.sh', prepare, [
  'set -euo pipefail',
  'scripts/publish-addon-image.sh',
]);
requireIncludes('scripts/publish-addon-image.sh', publish, [
  'set -euo pipefail',
  '--platform linux/amd64,linux/arm64,linux/arm/v7',
  '--build-arg "BUILD_FROM=${build_from}"',
  '--push',
  'ghcr.io/hassio-addons/base:16.3.2',
]);
requireIncludes('.github/workflows/release.yml', releaseWorkflow, [
  'docker/login-action@v3',
  'npx semantic-release',
]);
if (/uses:\s*\.\/\.github\/workflows\/build-addon\.yml/.test(releaseWorkflow)) {
  console.error('release.yml must not call build-addon.yml after semantic-release; prepareCmd publishes the image first');
  process.exit(1);
}
if (releaseWorkflow.indexOf('docker/login-action@v3') > releaseWorkflow.indexOf('npx semantic-release')) {
  console.error('GHCR login must happen before semantic-release so prepareCmd can push');
  process.exit(1);
}

const pushAt = buildWorkflow.indexOf('name: Build and push');
const commitAt = buildWorkflow.indexOf('name: Commit synced beacon/config.yaml');
if (pushAt < 0 || commitAt < 0 || pushAt > commitAt) {
  console.error('build-addon.yml must push the image before it commits a version sync');
  process.exit(1);
}

requireIncludes('scripts/smoke-addon-image.sh', smoke, ['docker run -d']);
if (smoke.includes('--init')) {
  console.error('smoke script must not pass Docker --init');
  process.exit(1);
}
requireIncludes('.github/workflows/ci.yml', ci, ['linux/amd64', 'linux/arm64', 'scripts/smoke-addon-image.sh']);

// Same shell rule the prepare script uses: a failed command does not continue.
const simulated = spawnSync(
  'bash',
  ['-c', 'set -euo pipefail; echo IMAGE_PUSH; exit 1; echo BUMP_COMMIT'],
  { encoding: 'utf8' },
);
if (simulated.status === 0 || simulated.stdout.includes('BUMP_COMMIT')) {
  console.error('A failed image push must skip the version bump');
  process.exit(1);
}

console.log('Release image order check passed: failed push does not bump beacon/config.yaml');
