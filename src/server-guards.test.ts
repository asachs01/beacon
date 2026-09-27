// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import { TOGGLE_DOMAINS as CARD_TOGGLE_DOMAINS } from './components/cards/toggle-domains';

// server-guards.cjs is plain CommonJS run by the add-on's Node server.
const require = createRequire(import.meta.url);
const {
  TOGGLE_DOMAINS,
  isServiceAllowed,
  isProxyRequestAllowed,
  isCrossOriginWrite,
  describeRequester,
} = require('../server-guards.cjs') as {
  TOGGLE_DOMAINS: string[];
  isServiceAllowed: (domain: unknown, service: unknown) => boolean;
  isProxyRequestAllowed: (method: string, url: string) => boolean;
  isCrossOriginWrite: (method: string, headers: Record<string, string | undefined>) => boolean;
  describeRequester: (headers: Record<string, string | undefined>) => string;
};

describe('isServiceAllowed', () => {
  it.each([
    ['todo', 'get_items'],
    ['todo', 'add_item'],
    ['todo', 'update_item'],
    ['todo', 'remove_item'],
    ['homeassistant', 'update_entity'],
    ['weather', 'get_forecasts'],
    ['media_player', 'media_play'],
    ['media_player', 'media_pause'],
    ['media_player', 'media_play_pause'],
    ['media_player', 'toggle'],
    ['media_player', 'media_next_track'],
    ['media_player', 'media_seek'],
    ['media_player', 'shuffle_set'],
    ['media_player', 'repeat_set'],
    ['media_player', 'media_previous_track'],
    ['media_player', 'volume_set'],
    ['light', 'toggle'],
    ['switch', 'toggle'],
    ['input_boolean', 'toggle'],
    ['fan', 'toggle'],
  ])('allows %s.%s, which Family calls', (domain, service) => {
    expect(isServiceAllowed(domain, service)).toBe(true);
  });

  it.each([
    ['homeassistant', 'restart'],
    ['homeassistant', 'stop'],
    ['homeassistant', 'toggle'],
    ['hassio', 'addon_stdin'],
    ['hassio', 'host_reboot'],
    ['lock', 'unlock'],
    ['alarm_control_panel', 'alarm_disarm'],
    ['cover', 'toggle'],
    ['script', 'turn_on'],
    ['automation', 'toggle'],
    ['shell_command', 'anything'],
    ['notify', 'notify'],
    ['light', 'turn_on'],
    ['todo', 'remove_completed_items'],
  ])('refuses %s.%s', (domain, service) => {
    expect(isServiceAllowed(domain, service)).toBe(false);
  });

  it('refuses odd input instead of throwing', () => {
    expect(isServiceAllowed('__proto__', 'toString')).toBe(false);
    expect(isServiceAllowed('constructor', 'name')).toBe(false);
    expect(isServiceAllowed(undefined, undefined)).toBe(false);
    expect(isServiceAllowed({}, [])).toBe(false);
    expect(isServiceAllowed('TODO', 'GET_ITEMS')).toBe(false);
  });

  it('uses the same toggle domains as the HA Toggle card', () => {
    expect(TOGGLE_DOMAINS).toEqual(CARD_TOGGLE_DOMAINS);
  });
});

describe('isProxyRequestAllowed', () => {
  it.each([
    ['GET', '/api/states'],
    ['GET', '/api/states/weather.home'],
    ['GET', '/api/states/media_player.living_room_2'],
    ['GET', '/api/calendars'],
    ['GET', '/api/calendars/calendar.family?start=2026-09-01T00%3A00%3A00.000Z&end=2026-09-08T00%3A00%3A00.000Z'],
    ['POST', '/api/services/todo/get_items?return_response'],
    ['POST', '/api/services/light/toggle'],
  ])('allows %s %s, which Family uses', (method, url) => {
    expect(isProxyRequestAllowed(method, url)).toBe(true);
  });

  it.each([
    // Other HA endpoints the admin token could reach
    ['GET', '/api/'],
    ['GET', '/api/config'],
    ['GET', '/api/error_log'],
    ['GET', '/api/history/period'],
    ['GET', '/api/hassio/backups'],
    ['GET', '/api/websocket'],
    ['POST', '/api/template'],
    ['POST', '/api/events/some_event'],
    ['POST', '/api/config/automation/config/1'],
    ['POST', '/api/hassio/host/reboot'],
    // Writing a state instead of reading it
    ['POST', '/api/states/light.kitchen'],
    ['DELETE', '/api/states/light.kitchen'],
    ['PUT', '/api/states'],
    // Service calls Family doesn't make
    ['POST', '/api/services/homeassistant/restart'],
    ['POST', '/api/services/lock/unlock'],
    ['GET', '/api/services/todo/get_items'],
    // Paths that would be rewritten to another endpoint once parsed
    ['GET', '/api/states/../config'],
    ['GET', '/api/states/%2e%2e/config'],
    ['GET', '/api/states/light.kitchen/../../config'],
    ['GET', '/api/states/..%2fconfig'],
    ['GET', '/api/calendars/calendar.family/../../error_log'],
    ['GET', '/api/states/light.kitchen#/../../config'],
    ['GET', '/api/states\\..\\config'],
    ['GET', '/api/states/Light.Kitchen'],
    ['GET', '/api/states/light'],
    ['GET', '/api/states/'],
  ])('refuses %s %s', (method, url) => {
    expect(isProxyRequestAllowed(method, url)).toBe(false);
  });
});

describe('isCrossOriginWrite', () => {
  const HA = 'homeassistant.local:8123';

  it('never blocks reads', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isCrossOriginWrite(method, { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })).toBe(false);
    }
  });

  describe('browsers that send Sec-Fetch-Site', () => {
    it('allows same-origin writes (fetch and sendBeacon from Family itself)', () => {
      expect(isCrossOriginWrite('POST', {
        'sec-fetch-site': 'same-origin',
        origin: `http://${HA}`,
        'content-type': 'application/json',
        'x-forwarded-host': HA,
      })).toBe(false);
      expect(isCrossOriginWrite('PUT', { 'sec-fetch-site': 'same-origin' })).toBe(false);
      expect(isCrossOriginWrite('DELETE', { 'sec-fetch-site': 'same-origin' })).toBe(false);
    });

    it('allows "none" (a request the user started directly)', () => {
      expect(isCrossOriginWrite('POST', { 'sec-fetch-site': 'none' })).toBe(false);
    });

    it('blocks writes from other websites', () => {
      expect(isCrossOriginWrite('POST', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example', 'x-forwarded-host': HA })).toBe(true);
    });

    it('blocks same-site pages, like another add-on on a different port', () => {
      expect(isCrossOriginWrite('POST', {
        'sec-fetch-site': 'same-site',
        origin: 'http://homeassistant.local:8080',
        'x-forwarded-host': HA,
      })).toBe(true);
    });

    it('trusts Sec-Fetch-Site over a matching Origin', () => {
      expect(isCrossOriginWrite('POST', { 'sec-fetch-site': 'cross-site', origin: `http://${HA}`, 'x-forwarded-host': HA })).toBe(true);
    });

    it('does not depend on Host, so reverse proxies that rewrite it still work', () => {
      expect(isCrossOriginWrite('POST', {
        'sec-fetch-site': 'same-origin',
        origin: 'https://ha.example.com',
        host: '127.0.0.1:8123',
      })).toBe(false);
    });
  });

  describe('older browsers that send only Origin', () => {
    it('allows an Origin matching the forwarded host', () => {
      expect(isCrossOriginWrite('POST', { origin: `http://${HA}`, 'x-forwarded-host': HA, host: 'addon:3000' })).toBe(false);
    });

    it('allows an Origin matching Host', () => {
      expect(isCrossOriginWrite('POST', { origin: `http://${HA}`, host: HA })).toBe(false);
    });

    it('ignores case and default ports', () => {
      expect(isCrossOriginWrite('POST', { origin: 'https://HA.Example.com', 'x-forwarded-host': 'ha.example.com:443' })).toBe(false);
      expect(isCrossOriginWrite('POST', { origin: 'http://ha.example.com', host: 'ha.example.com:80' })).toBe(false);
    });

    it('checks every host in a comma-separated X-Forwarded-Host', () => {
      expect(isCrossOriginWrite('POST', { origin: 'https://ha.example.com', 'x-forwarded-host': 'ha.example.com, 10.0.0.2:8123' })).toBe(false);
    });

    it('blocks an Origin for another host', () => {
      expect(isCrossOriginWrite('POST', { origin: 'https://evil.example', 'x-forwarded-host': HA, host: HA })).toBe(true);
    });

    it('blocks an Origin on the same host but another port', () => {
      expect(isCrossOriginWrite('POST', { origin: 'http://homeassistant.local:8080', 'x-forwarded-host': HA })).toBe(true);
    });

    it('blocks a lookalike host', () => {
      expect(isCrossOriginWrite('POST', { origin: 'http://homeassistant.local:8123.evil.example', 'x-forwarded-host': HA })).toBe(true);
    });

    it('blocks "null" and malformed origins', () => {
      expect(isCrossOriginWrite('POST', { origin: 'null', 'x-forwarded-host': HA })).toBe(true);
      expect(isCrossOriginWrite('POST', { origin: 'not a url', 'x-forwarded-host': HA })).toBe(true);
    });

    it('blocks when there is no host to compare with', () => {
      expect(isCrossOriginWrite('POST', { origin: `http://${HA}` })).toBe(true);
    });
  });

  it('allows requests with neither header (curl, HA rest_command, other add-ons)', () => {
    expect(isCrossOriginWrite('POST', { 'content-type': 'application/json', host: 'addon:3000' })).toBe(false);
  });
});

describe('describeRequester', () => {
  it('names the HA user and device', () => {
    expect(describeRequester({
      'x-remote-user-display-name': 'Sam',
      'x-remote-user-name': 'sam',
      'user-agent': 'Tablet',
    })).toBe('user="Sam" device="Tablet"');
  });

  it('keeps log lines to one line', () => {
    expect(describeRequester({ 'user-agent': 'a\nb' })).toBe('user="unknown user" device="a\\nb"');
  });
});

// Seeking, shuffle and repeat were added to the Music screen without being
// allowed here, so on the add-on they were refused with 403.
describe('the Music screen’s services', () => {
  it('are all allowed', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./api/music.ts', import.meta.url), 'utf8');
    const services = [...source.matchAll(/callMedia\(client, '([a-z_]+)'/g)].map((m) => m[1]);
    expect(services.length).toBeGreaterThan(8);
    for (const service of services) expect([service, isServiceAllowed('media_player', service)]).toEqual([service, true]);
  });
});
