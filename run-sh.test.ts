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
  function generate(vars: string) {
    const script = readFileSync(join(import.meta.dirname, 'run.sh'), 'utf8');
    const start = script.indexOf('# Generate runtime-config.js');
    const end = script.indexOf('# Inject the runtime-config script tag');
    const dir = mkdtempSync(join(tmpdir(), 'family-run-sh-'));
    try {
      const out = join(dir, 'runtime-config.js');
      const block = script.slice(start, end).replace('CONFIG_JS="/app/dist/runtime-config.js"', `CONFIG_JS="${out}"`);
      execFileSync('bash', ['-c', vars + block]);

      const written = readFileSync(out, 'utf8');
      const config = JSON.parse(written.replace(/^window\.__BEACON_CONFIG__ = /, '').replace(/;$/, ''));
      return { config, written };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // The options followed `node -e "…"` as arguments rather than preceding it
  // as environment, so every add-on option was ignored.
  it("passes the add-on's options to the page without its Supervisor token", () => {
    const { config, written } = generate(
      'export SUPERVISOR_TOKEN="server-only-addon-token"; THEME="midnight"; AUTO_DARK_MODE="false"; '
      + 'WEATHER_ENTITY="weather.forecast_home"; PHOTO_DIRECTORY="/media/pics"; PHOTO_INTERVAL="45"; '
      + 'SCREEN_SAVER_TIMEOUT="12"; ADDON_SLUG="abc123_family"\n',
    );
    expect(config).toEqual({
      ha_url: '', ha_token: '', ha_available: true, theme: 'midnight', auto_dark_mode: false,
      weather_entity: 'weather.forecast_home', photo_directory: '/media/pics', photo_interval: 45,
      screen_saver_timeout: 12, addon_slug: 'abc123_family',
    });
    expect(written).not.toContain('server-only-addon-token');
  });

  it('never sends the standalone HA URL or token to the browser', () => {
    const { config, written } = generate(
      'export HA_URL="https://ha.local:8123"; export HA_TOKEN="server-only-standalone-token"; '
      + 'THEME="forest"; AUTO_DARK_MODE="true"; WEATHER_ENTITY="weather.home"; '
      + 'PHOTO_DIRECTORY="/media/photos"; PHOTO_INTERVAL="60"; SCREEN_SAVER_TIMEOUT="10"; ADDON_SLUG=""\n',
    );
    expect(config).toMatchObject({
      ha_url: '', ha_token: '', ha_available: true, theme: 'forest', photo_interval: 60,
    });
    expect(written).not.toContain('https://ha.local:8123');
    expect(written).not.toContain('server-only-standalone-token');
  });

  it('marks standalone local-only mode as not connected to Home Assistant', () => {
    const { config } = generate(
      'THEME="skylight"; AUTO_DARK_MODE="true"; WEATHER_ENTITY="weather.home"; '
      + 'PHOTO_DIRECTORY="/media/photos"; PHOTO_INTERVAL="30"; SCREEN_SAVER_TIMEOUT="5"; ADDON_SLUG=""\n',
    );
    expect(config).toMatchObject({ ha_url: '', ha_token: '', ha_available: false });
  });
});
