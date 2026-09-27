import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Timer } from './Timer';

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function startTimer(name: string, preset: string) {
  fireEvent.change(screen.getByPlaceholderText('Timer name (optional)'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: preset }));
  fireEvent.click(screen.getByTitle('Start timer'));
}

beforeEach(() => {
  // performance.now() too: the countdowns are measured with it.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Timer on other screens', () => {
  // App keeps the Timer screen mounted but hidden once it's been opened.
  // Leaving the screen used to end every timer, so they never rang.
  it('keeps counting while hidden, then says which timer is up', () => {
    const { rerender } = render(<Timer shown />);
    startTimer('Pasta', '1m');
    rerender(<Timer shown={false} />);

    advance(59_000);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    advance(2_000);
    expect(screen.getByRole('alert')).toHaveTextContent('Pasta is done');
  });

  it('stops the alarm from the notice', () => {
    const { rerender } = render(<Timer shown />);
    startTimer('Pasta', '1m');
    rerender(<Timer shown={false} />);
    advance(61_000);

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens the Timer screen from the notice', () => {
    const onShow = vi.fn();
    const { rerender } = render(<Timer shown onShow={onShow} />);
    startTimer('Pasta', '1m');
    rerender(<Timer shown={false} onShow={onShow} />);
    advance(61_000);

    fireEvent.click(screen.getByRole('button', { name: 'Show' }));

    expect(onShow).toHaveBeenCalled();
  });

  it('shows no notice on the Timer screen itself, where the timer has its own button', () => {
    render(<Timer shown />);
    startTimer('Pasta', '1m');
    advance(61_000);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTitle('Dismiss alarm')).toBeInTheDocument();
  });

  it('keeps the stopwatch running while hidden', () => {
    const { rerender } = render(<Timer shown />);
    fireEvent.click(screen.getByRole('button', { name: 'Stopwatch' }));
    fireEvent.click(screen.getByTitle('Start'));

    rerender(<Timer shown={false} />);
    advance(5_000);
    rerender(<Timer shown />);

    expect(screen.getByText('00:05')).toBeInTheDocument();
  });
});
