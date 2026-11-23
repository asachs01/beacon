import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '../..');

function scriptPath(): string {
  const candidates = [
    join(packageRoot, 'beacon/scripts/install-voice-intents.sh'),
    join(packageRoot, 'scripts/install-voice-intents.sh'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`install-voice-intents.sh not found from ${packageRoot}`);
  return found;
}

function restMergeLines(): string {
  const candidates = [
    join(packageRoot, 'beacon/custom_intents/beacon_rest_command.yaml'),
    join(packageRoot, 'custom_intents/beacon_rest_command.yaml'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('beacon_rest_command.yaml not found');
  const yaml = readFileSync(found, 'utf8');
  const marker = 'rest_command:\n';
  const index = yaml.indexOf(marker);
  if (index === -1) throw new Error('rest_command key missing from beacon_rest_command.yaml');
  return yaml.slice(index + marker.length);
}

const dirs: string[] = [];

function tempConfig(): string {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-voice-intents-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function run(configDir: string, extra: string[] = []): string {
  return execFileSync('bash', [scriptPath(), ...extra, configDir], {
    encoding: 'utf8',
  });
}

function backups(configDir: string): string[] {
  return readdirSync(configDir).filter((name) => name.startsWith('configuration.yaml.bak.'));
}

describe('install-voice-intents.sh configuration.yaml wiring', () => {
  const mergeLines = restMergeLines();

  it('appends the include when there is no top-level rest_command key', () => {
    const dir = tempConfig();
    const original = [
      'default_config:',
      '',
      '# rest_command: this comment is not a key',
      'logger:',
      '  logs: {}',
      'input_text:',
      '  example:',
      '    rest_command: "not a top-level key"',
      '',
    ].join('\n');
    const configPath = join(dir, 'configuration.yaml');
    writeFileSync(configPath, original);

    const output = run(dir);

    const updated = readFileSync(configPath, 'utf8');
    expect(updated.startsWith(original.trimEnd())).toBe(true);
    expect(updated).toContain('\nrest_command: !include beacon_rest_command.yaml\n');
    expect(updated.match(/rest_command: !include beacon_rest_command\.yaml/g)).toHaveLength(1);
    expect(output).toContain('Appended to configuration.yaml: rest_command: !include beacon_rest_command.yaml');
    expect(output).not.toContain('Exact lines to merge by hand:');
    expect(output).toMatch(/ha core check:/);
    expect(output).toContain('Restart Home Assistant');
    expect(existsSync(join(dir, 'custom_sentences/en/beacon.yaml'))).toBe(true);
    expect(existsSync(join(dir, 'custom_intents/beacon.yaml'))).toBe(true);
    expect(existsSync(join(dir, 'beacon_rest_command.yaml'))).toBe(true);

    const bak = backups(dir);
    expect(bak).toHaveLength(1);
    expect(bak[0]).toMatch(/^configuration\.yaml\.bak\.\d{8}-\d{6}(?:-\d+)?$/);
    expect(readFileSync(join(dir, bak[0]), 'utf8')).toBe(original);

    const second = run(dir);
    expect(readFileSync(configPath, 'utf8')).toBe(updated);
    expect(backups(dir)).toEqual(bak);
    expect(second).toContain('Exact lines to merge by hand:');
    expect(second).toContain('already included');
  });

  it('leaves an existing include unchanged and prints the merge lines', () => {
    const dir = tempConfig();
    const original = 'default_config:\n\nrest_command: !include beacon_rest_command.yaml\n';
    writeFileSync(join(dir, 'configuration.yaml'), original);

    const output = run(dir);

    expect(readFileSync(join(dir, 'configuration.yaml'), 'utf8')).toBe(original);
    expect(backups(dir)).toEqual([]);
    expect(output).toContain('Left configuration.yaml unchanged (beacon_rest_command.yaml is already included).');
    expect(output).toContain('Exact lines to merge by hand:');
    expect(output).toContain(mergeLines.trim());
    expect(output).toContain('beacon_complete_chore:');
    expect(output).toContain('beacon_chores_left:');
    expect(output).not.toContain('Appended to configuration.yaml:');
  });

  it('treats a quoted include as already wired', () => {
    const dir = tempConfig();
    const original = 'rest_command: !include "beacon_rest_command.yaml"\n';
    writeFileSync(join(dir, 'configuration.yaml'), original);

    const output = run(dir);

    expect(readFileSync(join(dir, 'configuration.yaml'), 'utf8')).toBe(original);
    expect(backups(dir)).toEqual([]);
    expect(output).toContain('already included');
    expect(output).toContain('Exact lines to merge by hand:');
    expect(output).not.toContain('Appended to configuration.yaml:');
  });

  it('leaves an existing other rest_command unchanged and prints the merge lines', () => {
    const dir = tempConfig();
    const original = [
      'default_config:',
      '',
      'rest_command:',
      '  notify_phone:',
      '    url: "http://example.invalid/hook"',
      '    method: POST',
      '',
    ].join('\n');
    writeFileSync(join(dir, 'configuration.yaml'), original);

    const output = run(dir);

    expect(readFileSync(join(dir, 'configuration.yaml'), 'utf8')).toBe(original);
    expect(backups(dir)).toEqual([]);
    expect(output).toContain('Left configuration.yaml unchanged (a top-level rest_command: key already exists).');
    expect(output).toContain('Exact lines to merge by hand:');
    expect(output).toContain(mergeLines.trim());
    expect(output).not.toContain('Appended to configuration.yaml:');
  });

  it('does not write files in a dry run', () => {
    const dir = tempConfig();
    const original = 'default_config:\n';
    const configPath = join(dir, 'configuration.yaml');
    writeFileSync(configPath, original);

    const output = run(dir, ['--dry-run']);

    expect(readFileSync(configPath, 'utf8')).toBe(original);
    expect(backups(dir)).toEqual([]);
    expect(existsSync(join(dir, 'beacon_rest_command.yaml'))).toBe(false);
    expect(existsSync(join(dir, 'custom_sentences/en/beacon.yaml'))).toBe(false);
    expect(output).toContain('Dry run. No files will be written.');
    expect(output).toContain(`Dry run: would append this line to ${configPath}:`);
    expect(output).toContain('rest_command: !include beacon_rest_command.yaml');
    expect(output).toContain('ha core check: not run (--dry-run)');
    expect(output).toContain('Restart Home Assistant');
    expect(output).not.toContain('Appended to configuration.yaml:');
  });
});
