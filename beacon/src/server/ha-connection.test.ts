import { describe, expect, it } from 'vitest';
import {
  ADDON_API_BASE,
  ADDON_WS_URL,
  describeHaHttpTarget,
  resolveHaConnection,
  standaloneConfigError,
} from '../../lib/ha-connection.cjs';

const USER_TOKEN = 'long-lived-token-do-not-log';

describe('resolveHaConnection', () => {
  it('keeps add-on mode on the Supervisor even when HA_URL and HA_TOKEN are set', () => {
    const connection = resolveHaConnection({
      SUPERVISOR_TOKEN: 'supervisor-token',
      HA_TOKEN: USER_TOKEN,
      HA_URL: 'https://ha.example.com/',
    });

    expect(connection.mode).toBe('addon');
    expect(connection.apiBase).toBe(ADDON_API_BASE);
    expect(connection.apiBase).toBe('http://supervisor/core');
    expect(connection.wsUrl).toBe(ADDON_WS_URL);
    expect(connection.wsUrl).toBe('ws://supervisor/core/api/websocket');
    expect(connection.token).toBe('supervisor-token');
    expect(standaloneConfigError(connection)).toBeNull();
  });

  it('lets the advanced overrides win in add-on mode', () => {
    const connection = resolveHaConnection({
      SUPERVISOR_TOKEN: 'supervisor-token',
      HA_API_BASE_OVERRIDE: 'http://override.local:8123/',
      HA_WS_URL_OVERRIDE: 'ws://override.local:8123/api/websocket',
      HA_URL: 'http://ignored.local:8123',
    });

    expect(connection.mode).toBe('addon');
    expect(connection.apiBase).toBe('http://override.local:8123/');
    expect(connection.wsUrl).toBe('ws://override.local:8123/api/websocket');
    expect(connection.token).toBe('supervisor-token');
  });

  it('resolves an http HA_URL and uses HA_TOKEN outside the Supervisor', () => {
    const connection = resolveHaConnection({
      HA_URL: 'http://192.168.1.100:8123',
      HA_TOKEN: USER_TOKEN,
    });

    expect(connection.mode).toBe('standalone');
    expect(connection.apiBase).toBe('http://192.168.1.100:8123');
    expect(connection.wsUrl).toBe('ws://192.168.1.100:8123/api/websocket');
    expect(connection.token).toBe(USER_TOKEN);
    expect(standaloneConfigError(connection)).toBeNull();
  });

  it('resolves https and strips a trailing slash', () => {
    const connection = resolveHaConnection({
      HA_URL: 'https://ha.example.com/',
      HA_TOKEN: USER_TOKEN,
    });

    expect(connection.apiBase).toBe('https://ha.example.com');
    expect(connection.wsUrl).toBe('wss://ha.example.com/api/websocket');
  });

  it('strips repeated trailing slashes and keeps an explicit port', () => {
    const connection = resolveHaConnection({
      HA_URL: 'https://ha.example.com:8123///',
      HA_TOKEN: USER_TOKEN,
    });

    expect(connection.apiBase).toBe('https://ha.example.com:8123');
    expect(connection.wsUrl).toBe('wss://ha.example.com:8123/api/websocket');
  });

  it('lets overrides win over HA_URL in standalone mode', () => {
    const connection = resolveHaConnection({
      HA_URL: 'http://192.168.1.100:8123/',
      HA_TOKEN: USER_TOKEN,
      HA_API_BASE_OVERRIDE: 'http://10.0.0.8:8123',
      HA_WS_URL_OVERRIDE: 'ws://10.0.0.8:8123/api/websocket',
    });

    expect(connection.mode).toBe('standalone');
    expect(connection.apiBase).toBe('http://10.0.0.8:8123');
    expect(connection.wsUrl).toBe('ws://10.0.0.8:8123/api/websocket');
    expect(connection.token).toBe(USER_TOKEN);
  });

  it('names HA_URL and HA_TOKEN when standalone is missing either one, and never includes the token', () => {
    const missingUrl = resolveHaConnection({ HA_TOKEN: USER_TOKEN });
    const missingToken = resolveHaConnection({ HA_URL: 'http://192.168.1.100:8123/' });
    const missingBoth = resolveHaConnection({});

    for (const connection of [missingUrl, missingToken, missingBoth]) {
      expect(connection.mode).toBe('standalone');
      const message = standaloneConfigError(connection);
      expect(message).toContain('HA_URL');
      expect(message).toContain('HA_TOKEN');
      expect(message).not.toContain(USER_TOKEN);
    }

    expect(missingUrl.token).toBe(USER_TOKEN);
    expect(missingUrl.apiBase).toBe('');
    expect(missingToken.token).toBe('');
    expect(missingToken.wsUrl).toBe('ws://192.168.1.100:8123/api/websocket');
  });
});

describe('describeHaHttpTarget', () => {
  it('keeps the Supervisor target on http port 80', () => {
    expect(describeHaHttpTarget('http://supervisor/core/api/states')).toEqual({
      secure: false,
      hostname: 'supervisor',
      port: 80,
      path: '/core/api/states',
    });
  });

  it('uses port 443 for https and the explicit port for http', () => {
    expect(describeHaHttpTarget('https://ha.example.com/api/states?x=1')).toMatchObject({
      secure: true,
      hostname: 'ha.example.com',
      port: 443,
      path: '/api/states?x=1',
    });
    expect(describeHaHttpTarget('http://192.168.1.100:8123/api/websocket')).toMatchObject({
      secure: false,
      port: 8123,
      path: '/api/websocket',
    });
  });
});
