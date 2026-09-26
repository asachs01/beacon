import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingView from './OnboardingView';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OnboardingView', () => {
  it('sets up with a long-lived token, without offering the unfinished OAuth sign-in', async () => {
    // HA answers 401 without a token: reachable.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingView onComplete={onComplete} />);

    await user.click(screen.getByRole('button', { name: /get started/i }));
    await user.type(screen.getByPlaceholderText(/homeassistant.local/), 'http://ha.local:8123/');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    expect(await screen.findByPlaceholderText(/paste your token/i)).toBeInTheDocument();
    expect(screen.queryByText(/sign in with home assistant/i)).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/paste your token/i), 'long-lived-token');
    await user.click(screen.getByRole('button', { name: /complete setup/i }));
    expect(onComplete).toHaveBeenCalledWith('http://ha.local:8123', 'long-lived-token');
  });
});
