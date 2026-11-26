import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PairedDevicesSettings } from './PairedDevicesSettings';

const now = new Date('2026-11-26T12:00:00Z').toISOString();

describe('Paired devices settings', () => {
  it('creates an access token, shows it once, and lists it as a token', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ pairingCode: '123456', devices: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          token: 'raw-token-once',
          device: {
            id: 'token-1',
            label: 'Home Assistant automations',
            kind: 'token',
            createdAt: now,
            lastSeenAt: now,
            current: false,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          pairingCode: '123456',
          devices: [{
            id: 'token-1',
            label: 'Home Assistant automations',
            kind: 'token',
            createdAt: now,
            lastSeenAt: now,
            current: false,
          }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<PairedDevicesSettings />);
    expect(await screen.findByText('123456')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Token name'), 'Home Assistant automations');
    await userEvent.click(screen.getByRole('button', { name: 'Create access token' }));

    const createCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/beacon-auth/access-tokens'));
    expect(createCall?.[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(createCall?.[1].body))).toEqual({ label: 'Home Assistant automations' });

    expect(await screen.findByDisplayValue('raw-token-once')).toBeInTheDocument();
    expect(screen.getByText('Copy this token now. Beacon will not show it again.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('raw-token-once');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(await screen.findByText(/Home Assistant automations · Access token/)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
