/**
 * Fail when the tree Supervisor would scan has more than one add-on
 * manifest with slug beacon. The scan matches store/data.py: config.yaml,
 * config.yml, and config.json outside dot-directories and rootfs.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execSync('git ls-files -z', { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((file) => /(?:^|\/)config\.(yaml|yml|json)$/.test(file))
  .filter((file) => !file.split('/').some((part) => part.startsWith('.') || part === 'rootfs'));

function slugOf(file, text) {
  if (file.endsWith('.json')) {
    const data = JSON.parse(text);
    return typeof data.slug === 'string' ? data.slug : '';
  }
  const match = text.match(/^slug:\s*["']?([^"'\n#]+)["']?\s*$/m);
  return match ? match[1].trim() : '';
}

function archList(text) {
  const block = text.split(/^arch:\s*$/m)[1] ?? '';
  const body = block.split(/^\S/m)[0] ?? '';
  return [...body.matchAll(/^\s+-\s+(\S+)/gm)].map((match) => match[1]);
}

const beaconManifests = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (slugOf(file, text) === 'beacon') beaconManifests.push({ file, text });
}

if (beaconManifests.length !== 1) {
  const listed = beaconManifests.map((item) => item.file).join(', ') || '(none)';
  console.error(`Expected exactly one add-on manifest with slug beacon, found ${beaconManifests.length}: ${listed}`);
  process.exit(1);
}

const manifest = beaconManifests[0];
if (manifest.file !== 'beacon/config.yaml') {
  console.error(`Slug beacon is declared by ${manifest.file}. The only manifest must be beacon/config.yaml.`);
  process.exit(1);
}

const errors = [];
if (!/^image:\s*ghcr\.io\/asachs01\/beacon\s*$/m.test(manifest.text)) {
  errors.push('beacon/config.yaml must set image: ghcr.io/asachs01/beacon');
}
if (!/^init:\s*false\s*$/m.test(manifest.text)) {
  errors.push('beacon/config.yaml must set init: false');
}
if (archList(manifest.text).includes('armv7')) {
  errors.push('beacon/config.yaml must not list deprecated arch armv7');
}
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log('Add-on manifest check passed: only beacon/config.yaml declares slug beacon');
