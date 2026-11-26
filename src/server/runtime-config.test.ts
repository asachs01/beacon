import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  HA_BROWSER_TOKEN_WARNING,
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
