import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NowPlayingBar } from './NowPlayingBar';
import type { MediaPlayer } from '../types/music';

const livingRoom: MediaPlayer = {
  entity_id: 'media_player.living_room',
  friendly_name: 'Living Room',
  state: 'playing',
  media_title: 'Golden Hour',
  media_duration: 200,
  media_position: 40,
  media_position_updated_at: '2026-09-27T10:00:00Z',
  volume_level: 0.4,
};

const handlers = () => ({
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
  onSetVolume: vi.fn(),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-27T10:01:00Z')); // a minute after the position was measured
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NowPlayingBar', () => {
  // It counted on from when the bar appeared, so a track that had played
  // for minutes showed as just started (the Music screen was fixed already).
  it('shows how far the track has got since Home Assistant measured it', () => {
    const { container } = render(<NowPlayingBar player={livingRoom} {...handlers()} />);
    const progress = () => (container.querySelector('.now-playing-progress-fill') as HTMLElement).style.width;

    expect(progress()).toBe('50%'); // 1:40 of 3:20
    act(() => { vi.advanceTimersByTime(50_000); });
    expect(progress()).toBe('75%');
  });

  // Every move of its slider was a Home Assistant service call, and it
  // jumped back to whatever volume was reported next, as the Music screen's did.
  it('sets the volume at most every quarter second, keeping it until the player reports it', () => {
    const on = handlers();
    const { rerender } = render(<NowPlayingBar player={livingRoom} {...on} />);
    const slider = () => screen.getByRole('slider', { name: 'Volume' });

    fireEvent.change(slider(), { target: { value: '0.5' } });
    fireEvent.change(slider(), { target: { value: '0.6' } });
    fireEvent.change(slider(), { target: { value: '0.7' } });
    expect(on.onSetVolume).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(250); });
    expect(on.onSetVolume).toHaveBeenCalledTimes(2);
    expect(on.onSetVolume).toHaveBeenLastCalledWith(0.7);

    // A report from before the player changed
    rerender(<NowPlayingBar player={{ ...livingRoom, volume_level: 0.42 }} {...on} />);
    expect(slider()).toHaveValue('0.7');
  });
});
