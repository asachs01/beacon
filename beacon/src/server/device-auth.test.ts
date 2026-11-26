import { describe, expect, it } from 'vitest';
import {
  INGRESS_IP,
  classifyPath,
  createSocketRegistry,
  headersForUpstream,
  isTrustedIngress,
  readPresentedToken,
  stripSessionQuery,
} from '../../lib/device-auth.cjs';

describe('ingress trust', () => {
  it('trusts only the Supervisor ingress address in add-on mode', () => {
    expect(isTrustedIngress({ mode: 'addon', remoteAddress: INGRESS_IP })).toBe(true);
    expect(isTrustedIngress({ mode: 'addon', remoteAddress: `::ffff:${INGRESS_IP}` })).toBe(true);
    expect(isTrustedIngress({ mode: 'addon', remoteAddress: '10.0.0.4' })).toBe(false);
    expect(isTrustedIngress({ mode: 'addon', remoteAddress: '127.0.0.1' })).toBe(false);
  });

  it('never trusts ingress in standalone mode, even from the ingress address', () => {
    expect(isTrustedIngress({ mode: 'standalone', remoteAddress: INGRESS_IP })).toBe(false);
    expect(isTrustedIngress({ mode: 'standalone', remoteAddress: `::ffff:${INGRESS_IP}` })).toBe(false);
  });

  it('does not take a header into account', () => {
    const forged = {
      mode: 'addon' as const,
      remoteAddress: '203.0.113.8',
      headers: {
        'x-ingress-path': '/api/hassio_ingress/token',
        'x-forwarded-for': INGRESS_IP,
        'x-hass-source': 'core',
      },
    };
    expect(isTrustedIngress(forged)).toBe(false);
  });
});

describe('route classification', () => {
  const protectedPaths = [
    '/api/states',
    '/api/services/conversation/process',
    '/api/conversation/process',
    '/api/websocket',
    '/api/media_source/browse_media',
    '/beacon-ws/ha',
    '/beacon-data/beacon_settings',
    '/beacon-data/beacon_family_members',
    '/beacon-data/beacon_chores',
    '/beacon-data/beacon_meal_plans',
    '/beacon-data/beacon_streaks',
    '/beacon-action/voice',
    '/beacon-action/service',
    '/beacon-action/media-upload',
    '/beacon-action/media-browse',
    '/beacon-action/media-remove',
    '/beacon-action/complete-chore',
    '/beacon-action/chores-left',
    '/beacon-action/chore-events',
    '/beacon-action/calendar-event',
    '/beacon-api/google-photos',
    '/beacon-api/google-photos/photos',
    '/beacon-api/google-photos/refresh',
    '/beacon-api/google-photos/file/abc/one.jpg',
    '/beacon-api/home-sensors/entities',
    '/beacon-auth/devices',
    '/beacon-auth/devices/revoke',
    '/beacon-auth/pairing-code',
  ];

  it('protects Home Assistant, Beacon data, media, and settings routes', () => {
    for (const path of protectedPaths) {
      expect(classifyPath(path), path).toBe('protected');
    }
  });

  it('leaves health, pairing, and static files public', () => {
    expect(classifyPath('/health')).toBe('public');
    expect(classifyPath('/beacon-auth/pair')).toBe('public');
    expect(classifyPath('/beacon-auth/session')).toBe('public');
    expect(classifyPath('/')).toBe('public');
    expect(classifyPath('/index.html')).toBe('public');
    expect(classifyPath('/runtime-config.js')).toBe('public');
    expect(classifyPath('/assets/index.js')).toBe('public');
  });
});

describe('presented session token', () => {
  it('reads the cookie, bearer header, and websocket query', () => {
    expect(readPresentedToken({
      url: '/api/states',
      headers: { cookie: 'beacon_session=from-cookie' },
    })).toBe('from-cookie');
    expect(readPresentedToken({
      url: '/api/states',
      headers: { authorization: 'Bearer from-header' },
    })).toBe('from-header');
    expect(readPresentedToken({
      url: '/beacon-ws/ha?session=from-query',
      headers: {},
    })).toBe('from-query');
  });

  it('strips the Beacon session before a URL is forwarded to Home Assistant', () => {
    expect(stripSessionQuery('/api/states?session=secret-token')).toBe('/api/states');
    expect(stripSessionQuery('/api/media_source/local/a.jpg?v=1&session=secret-token'))
      .toBe('/api/media_source/local/a.jpg?v=1');
    expect(stripSessionQuery('/api/websocket?session=secret-token')).toBe('/api/websocket');
    expect(stripSessionQuery('/api/states')).toBe('/api/states');
  });

  it('does not forward the Beacon session cookie or bearer token upstream', () => {
    const headers = headersForUpstream({
      url: '/api/websocket?session=secret-token',
      headers: {
        authorization: 'Bearer secret-token',
        cookie: 'theme=dark; beacon_session=secret-token',
        upgrade: 'websocket',
      },
    });
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBe('theme=dark');
    expect(headers.upgrade).toBe('websocket');
  });
});

describe('socket registry', () => {
  it('destroys tracked sockets when a session is revoked', () => {
    const registry = createSocketRegistry();
    let destroyed = 0;
    const socket = {
      destroy() { destroyed += 1; },
      on() { return this; },
    };
    registry.track('device-1', socket);
    registry.closeSession('device-1');
    expect(destroyed).toBe(1);
    registry.closeSession('device-1');
    expect(destroyed).toBe(1);
  });
});
