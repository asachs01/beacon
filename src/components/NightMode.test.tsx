import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseNightWake, requestNightWake, resetNightWakeForTests } from '../display/night-wake';
import { NightMode } from './NightMode';

const props = {
  active: true,
  brightness: 30,
  clockOnly: true,
  timeFormat: '12h' as const,
  hotCorner: 'left' as const,
};

describe('NightMode tap to wake', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 22, 15, 0));
    resetNightWakeForTests();
  });

  afterEach(() => {
    resetNightWakeForTests();
    document.documentElement.classList.remove('night-clock-active');
    vi.useRealTimers();
  });

  it('hides the clock for 60 seconds after a tap, then returns to night mode', () => {
    render(<NightMode {...props} />);
    expect(screen.getByTestId('night-clock')).toHaveTextContent('10:15 PM');
    expect(screen.getByTestId('night-clock')).toHaveTextContent('Monday, November 23');
    expect(screen.getByTestId('night-dim')).toHaveStyle({ pointerEvents: 'none' });

    fireEvent.pointerDown(window, { button: 0, pointerType: 'touch' });
    expect(screen.queryByTestId('night-clock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('night-dim')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(59_000); });
    expect(screen.queryByTestId('night-clock')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByTestId('night-clock')).toBeInTheDocument();
  });

  it('wakes a dimmed dashboard without the overlay capturing the tap', () => {
    render(<NightMode {...props} clockOnly={false} />);
    const dim = screen.getByTestId('night-dim');
    expect(dim).toHaveStyle({ pointerEvents: 'none', opacity: '0.7' });
    expect(screen.queryByTestId('night-clock')).not.toBeInTheDocument();

    fireEvent.pointerDown(window, { button: 0, pointerType: 'mouse' });
    expect(screen.queryByTestId('night-dim')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByTestId('night-dim')).toBeInTheDocument();
  });

  it('clears the clock for an urgent wake until it is dismissed, and for at least 60 seconds', () => {
    render(<NightMode {...props} />);
    expect(screen.getByTestId('night-clock')).toBeInTheDocument();

    act(() => { requestNightWake('timer:oven'); });
    expect(screen.queryByTestId('night-clock')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(10_000); });
    act(() => { releaseNightWake('timer:oven'); });
    expect(screen.queryByTestId('night-clock')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(50_000); });
    expect(screen.getByTestId('night-clock')).toBeInTheDocument();
  });

  it('keeps the clock down past 60 seconds while the urgent item is still up', () => {
    render(<NightMode {...props} />);
    act(() => { requestNightWake('family-bell'); });
    act(() => { vi.advanceTimersByTime(90_000); });
    expect(screen.queryByTestId('night-clock')).not.toBeInTheDocument();
    act(() => { releaseNightWake('family-bell'); });
    expect(screen.getByTestId('night-clock')).toBeInTheDocument();
  });

  it('renders nothing while night mode is inactive', () => {
    render(<NightMode {...props} active={false} />);
    expect(screen.queryByTestId('night-clock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('night-dim')).not.toBeInTheDocument();
  });
});
