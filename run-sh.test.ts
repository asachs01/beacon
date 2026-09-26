// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Runs run.sh's runtime-config.js step (the add-on's options for the page)
 * in bash, writing to a temporary file instead of /app/dist.
 */
describe('run.sh runtime config', () => {
  // The options followed `node -e "…"` as arguments rather than preceding it
  // as environment, so every add-on option was ignored.
  it("passes the add-on's options to the page", () => {
    const script = readFileSync(join(import.meta.dirname, 'run.sh'), 'utf8');
    const start = script.indexOf('# Generate runtime-config.js');
    const end = script.indexOf('# Inject the runtime-config script tag');
    const dir = mkdtempSync(join(tmpdir(), 'family-run-sh-'));
    try {
      const out = join(dir, 'runtime-config.js');
      const block = script.slice(start, end).replace('CONFIG_JS="/app/dist/runtime-config.js"', `CONFIG_JS="${out}"`);
      const vars = 'HA_URL=""; HA_BROWSER_TOKEN=""; FAMILY_NAME="The Smiths"; THEME="midnight"; AUTO_DARK_MODE="false"; '
        + 'WEATHER_ENTITY="weather.forecast_home"; PHOTO_DIRECTORY="/media/pics"; PHOTO_INTERVAL="45"; '
        + 'SCREEN_SAVER_TIMEOUT="12"; ADDON_SLUG="abc123_family"\n';
      execFileSync('bash', ['-c', vars + block]);

      const written = readFileSync(out, 'utf8');
      const config = JSON.parse(written.replace(/^window\.__BEACON_CONFIG__ = /, '').replace(/;$/, ''));
      expect(config).toEqual({
        ha_url: '', ha_token: '', family_name: 'The Smiths', theme: 'midnight', auto_dark_mode: false,
        weather_entity: 'weather.forecast_home', photo_directory: '/media/pics', photo_interval: 45,
        screen_saver_timeout: 12, addon_slug: 'abc123_family',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
