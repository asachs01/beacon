import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  window.__BEACON_CONFIG__ = { addon_slug: '' };
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  delete window.__BEACON_CONFIG__;
  window.history.replaceState({}, '', '/');
});

describe('Kid Display links', () => {
  it('never shares the current ingress capability when slug lookup fails', async () => {
    window.history.replaceState({}, '', '/api/hassio_ingress/private-session/?temporary=secret');
    const { buildFocusUrl } = await import('./focus');
    expect(() => buildFocusUrl('kai')).toThrow('add-on slug');
  });

  it('uses the stable Home Assistant redirect when the slug is known', async () => {
    window.__BEACON_CONFIG__ = { addon_slug: 'family_family' };
    window.history.replaceState({}, '', '/api/hassio_ingress/private-session/?temporary=secret');
    const { buildFocusUrl } = await import('./focus');
    const shared = new URL(buildFocusUrl('kai'));
    expect(shared.pathname).toBe('/hassio/ingress/family_family');
    expect(shared.searchParams.get('display')).toBe('kai');
    expect(shared.href).not.toContain('private-session');
    expect(shared.href).not.toContain('temporary');
  });

  it('drops existing query parameters and fragments outside ingress', async () => {
    window.history.replaceState({}, '', '/family/?token=secret#private');
    const { buildFocusUrl } = await import('./focus');
    const shared = new URL(buildFocusUrl('kai'));
    expect(shared.pathname).toBe('/family/');
    expect(shared.search).toBe('?display=kai');
    expect(shared.hash).toBe('');
  });
});
