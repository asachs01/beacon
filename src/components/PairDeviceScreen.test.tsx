import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PairDeviceScreen } from './PairDeviceScreen';
import { getDeviceSessionToken, setDeviceSessionToken } from '../api/device-session';

describe('Pair this device screen', () => {
  it('asks for a family PIN or pairing code and stores a native session token', async () => {
    setDeviceSessionToken(null);
    const onPaired = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, token: 'session-token', device: { id: '1', label: 'Kitchen tablet' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<PairDeviceScreen onPaired={onPaired} />);
    expect(screen.getByRole('heading', { name: 'Pair this device' })).toBeInTheDocument();
    expect(screen.getByText(/family PIN or the 6-digit pairing code/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Family PIN or pairing code'), '1234');
    await userEvent.type(screen.getByLabelText('Name for this device'), 'Kitchen tablet');
    await userEvent.click(screen.getByRole('button', { name: 'Pair this device' }));

    expect(fetchMock).toHaveBeenCalledWith('/beacon-auth/pair', expect.objectContaining({
      method: 'POST',
    }));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toEqual({ secret: '1234', label: 'Kitchen tablet' });
    expect(onPaired).toHaveBeenCalled();
    expect(getDeviceSessionToken()).toBeNull();
    vi.unstubAllGlobals();
  });

  it('shows a lockout message when pairing is rate limited', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'pairing_locked', retryAfter: 900 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<PairDeviceScreen onPaired={() => {}} />);
    await userEvent.type(screen.getByLabelText('Family PIN or pairing code'), '0000');
    await userEvent.click(screen.getByRole('button', { name: 'Pair this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many tries. Try again in 15 min.');
    vi.unstubAllGlobals();
  });
});
