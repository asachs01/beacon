import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  getBeaconSession: vi.fn(),
  getParentPinMembers: vi.fn(),
  clearSensitiveCache: vi.fn(),
  unlockParent: vi.fn(),
  unlockDisplay: vi.fn(),
  enterDisplay: vi.fn(),
}));

vi.mock('./api/beacon-auth', () => auth);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  window.__BEACON_CONFIG__ = { ha_url: '', ha_token: '', ha_available: true };
  window.history.replaceState({}, '', '/');
  auth.getParentPinMembers.mockResolvedValue([]);
});

afterEach(() => {
  delete window.__BEACON_CONFIG__;
  window.history.replaceState({}, '', '/');
});

describe('server-backed app authorization', () => {
  it('keeps the dashboard unmounted until a parent session exists', async () => {
    auth.getBeaconSession.mockResolvedValue({ role: 'none' });
    const { App } = await import('./App');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Parent access' })).toBeInTheDocument();
    expect(auth.getBeaconSession).toHaveBeenCalledWith(null);
    expect(screen.queryByText('Family Members')).not.toBeInTheDocument();
  });

  it('asks for the configured member PIN before mounting a protected display', async () => {
    window.history.replaceState({}, '', '/?display=kai');
    auth.getBeaconSession.mockResolvedValue({ role: 'none', requiresPin: true });
    const { App } = await import('./App');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Kid Display' })).toBeInTheDocument();
    expect(auth.getBeaconSession).toHaveBeenCalledWith('kai');
    expect(screen.queryByText('Family Members')).not.toBeInTheDocument();
  });
});
