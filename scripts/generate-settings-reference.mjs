import { readFileSync, writeFileSync } from 'node:fs';
import { buildSettingsReference, OUTPUT } from './settings-reference.mjs';

const next = buildSettingsReference();
const check = process.argv.includes('--check');

if (check) {
  const current = readFileSync(OUTPUT, 'utf8');
  if (current !== next) {
    console.error('Settings reference is stale. Run: node scripts/generate-settings-reference.mjs');
    process.exit(1);
  }
  console.log('Settings reference is up to date.');
} else {
  writeFileSync(OUTPUT, next);
  console.log(`Wrote ${OUTPUT}`);
}
