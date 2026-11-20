import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FocusView } from './FocusView';
import type { BeaconSettings } from '../../hooks/useSettings';
import type { FamilyMember } from '../../types/family';

const settings = {
  timeFormat: '12h',
  screenSaverEnabled: false,
  dimTimeout: 5,
  screenSaverTimeout: 10,
  currencySymbol: '$',
  sidebarPosition: 'left',
} as BeaconSettings;

function member(pin?: string): FamilyMember {
  return {
    id: 'kid-1',
    name: 'Sam',
    avatar: '👦',
    color: '#3b82f6',
    role: 'child',
    pin,
  };
}

function seed(pin?: string) {
  localStorage.setItem('beacon_family_members', JSON.stringify([member(pin)]));
}

describe('FocusView exit', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('asks to confirm before leaving Kid Display when no PIN is set', () => {
    seed();
    const onExit = vi.fn();
    render(<FocusView memberId="kid-1" settings={settings} onExit={onExit} />);
    const clock = screen.getByRole('button', { name: 'Clock' });
    for (let i = 0; i < 5; i += 1) fireEvent.click(clock);
    expect(screen.getByRole('dialog')).toHaveTextContent('Sam');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    for (let i = 0; i < 5; i += 1) fireEvent.click(clock);
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('requires a family PIN before the corner gesture can leave Kid Display', () => {
    vi.useFakeTimers();
    try {
      seed('2468');
      const onExit = vi.fn();
      render(<FocusView memberId="kid-1" settings={settings} onExit={onExit} />);
      const zone = screen.getByRole('button', { name: 'Hidden controls' });
      fireEvent.pointerDown(zone, { button: 0, clientX: 6, clientY: 6, pointerId: 1 });
      act(() => { vi.advanceTimersByTime(2000); });
      expect(onExit).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toHaveTextContent('family PIN');
      fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '0000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
      expect(onExit).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '2468' } });
      fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
      expect(onExit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
