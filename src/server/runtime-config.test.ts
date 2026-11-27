import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  HA_BROWSER_TOKEN_WARNING,
  buildRuntimeConfig,
  renderRuntimeConfig,
  warnIfBrowserTokenSet,
} from '../../lib/runtime-config.cjs';

const BROWSER_TOKEN = 'browser-token-do-not-publish';
const SERVER_TOKEN = 'supervisor-or-long-lived-token';

describe('runtime-config.js', () => {
  it('never contains a Home Assistant token', () => {
    const js = renderRuntimeConfig({
      HA_URL: 'http://192.168.1.20:8123',
      HA_TOKEN: SERVER_TOKEN,
      HA_BROWSER_TOKEN: BROWSER_TOKEN,
      FAMILY_NAME: 'Adams',
      THEME: 'skylight',
    });

    expect(js).not.toContain(BROWSER_TOKEN);
    expect(js).not.toContain(SERVER_TOKEN);
    expect(js).not.toContain('ha_token');
    expect(js).not.toContain('HA_BROWSER_TOKEN');
    expect(js).not.toContain('HA_TOKEN');
    expect(js.toLowerCase()).not.toContain('token');
    expect(js).toContain('"family_name":"Adams"');
    expect(js).toContain('"ha_url":"http://192.168.1.20:8123"');
  });

  it('does not publish token-like env vars or config keys', () => {
    const sentinel = 'sentinel-secret-xyz';
    const env = {
      HA_URL: 'http://192.168.1.20:8123',
      FAMILY_NAME: 'Adams',
      HA_TOKEN: sentinel,
      HA_BROWSER_TOKEN: sentinel,
      SUPERVISOR_TOKEN: sentinel,
      BEACON_TOKEN: sentinel,
    };
    const config = buildRuntimeConfig(env);
    const rendered = renderRuntimeConfig(env);

    expect(rendered).not.toContain(sentinel);
    for (const key of Object.keys(config)) {
      expect(key, key).not.toMatch(/token|secret|password|key|bearer|auth/i);
    }
    expect(rendered).toContain('"ha_url":"http://192.168.1.20:8123"');
    expect(rendered).toContain('"family_name":"Adams"');
  });

  it('logs the deprecation warning when HA_BROWSER_TOKEN is set and stays quiet otherwise', () => {
    const log = vi.fn();
    warnIfBrowserTokenSet({ HA_BROWSER_TOKEN: BROWSER_TOKEN }, log);
    expect(log).toHaveBeenCalledWith(HA_BROWSER_TOKEN_WARNING);
    log.mockClear();
    warnIfBrowserTokenSet({}, log);
    expect(log).not.toHaveBeenCalled();
  });

  it('is not written by run.sh in either tree', () => {
    for (const file of ['run.sh', 'beacon/run.sh']) {
      const script = readFileSync(file, 'utf8');
      expect(script).not.toContain('HA_BROWSER_TOKEN');
      expect(script).toContain('runtime-config.cjs');
      expect(script).not.toContain('ha_token:');
    }
  });
});
