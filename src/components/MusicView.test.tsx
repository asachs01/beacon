import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MusicView } from './MusicView';
import type { MediaPlayer } from '../types/music';

const livingRoom: MediaPlayer = {
  entity_id: 'media_player.living_room',
  friendly_name: 'Living Room',
  state: 'playing',
  media_title: 'Golden Hour',
  media_artist: 'The Sunset Parade',
  media_album_name: 'Afterglow',
  media_duration: 245,
  media_position: 62,
  media_position_updated_at: '2026-09-27T10:00:00Z',
  volume_level: 0.4,
};
const kitchen: MediaPlayer = {
  entity_id: 'media_player.kitchen',
  friendly_name: 'Kitchen',
  state: 'paused',
  media_title: 'Midnight Signals',
  media_artist: 'Harbor Lights',
  media_duration: 198,
  media_position: 95,
  media_position_updated_at: '2026-09-27T09:58:00Z',
  volume_level: 0.3,
};

const handlers = () => ({
  onSelectPlayer: vi.fn(),
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
  onSetVolume: vi.fn(),
  onSeek: vi.fn(),
  onStepVolume: vi.fn(),
  onSetShuffle: vi.fn(),
  onSetRepeat: vi.fn(),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-27T10:00:30Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MusicView', () => {
  it('shows the track and how far it has got', () => {
    render(<MusicView players={[livingRoom]} selectedPlayerId={null} {...handlers()} />);

    expect(screen.getByRole('heading', { name: 'Golden Hour' })).toBeInTheDocument();
    expect(screen.getByText('The Sunset Parade — Afterglow')).toBeInTheDocument();
    // 62 s when measured, 30 s ago
    expect(screen.getByText('1:32')).toBeInTheDocument();
    expect(screen.getByText('-2:33')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  // The playing speaker always won, so another couldn't be seen or controlled.
  it('shows the speaker picked, even while another one plays', () => {
    const on = handlers();
    render(<MusicView players={[kitchen, livingRoom]} selectedPlayerId={null} {...on} />);

    fireEvent.click(screen.getByRole('button', { name: 'Speaker: Living Room, change speaker' }));
    fireEvent.click(screen.getByRole('button', { name: /^Kitchen/ }));

    expect(on.onSelectPlayer).toHaveBeenCalledWith('media_player.kitchen');
    expect(screen.getByRole('heading', { name: 'Midnight Signals' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Speakers' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(on.onPlay).toHaveBeenCalledWith('media_player.kitchen');
  });

  // Every move of the slider used to be a Home Assistant service call.
  it('sets the volume at most every quarter second while dragging, ending where it was left', () => {
    const on = handlers();
    render(<MusicView players={[livingRoom]} selectedPlayerId={null} {...on} />);
    const slider = screen.getByRole('slider', { name: 'Volume' });

    fireEvent.change(slider, { target: { value: '0.5' } });
    fireEvent.change(slider, { target: { value: '0.6' } });
    fireEvent.change(slider, { target: { value: '0.7' } });
    expect(on.onSetVolume).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(250); });
    expect(on.onSetVolume).toHaveBeenCalledTimes(2);
    expect(on.onSetVolume).toHaveBeenLastCalledWith(0.7, 'media_player.living_room');
  });

  // Pausing used to switch the screen to whichever other speaker was playing.
  it('stays on the speaker showing when it is paused', () => {
    const on = handlers();
    const { rerender } = render(<MusicView players={[livingRoom, kitchen]} selectedPlayerId={null} {...on} />);
    expect(screen.getByRole('heading', { name: 'Golden Hour' })).toBeInTheDocument();

    const pausedLivingRoom = { ...livingRoom, state: 'paused' as const };
    const playingKitchen = { ...kitchen, state: 'playing' as const };
    rerender(<MusicView players={[playingKitchen, pausedLivingRoom]} selectedPlayerId={null} {...on} />);

    expect(screen.getByRole('heading', { name: 'Golden Hour' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('seeks to where the bar is dragged, when it is let go', () => {
    const on = handlers();
    render(<MusicView players={[livingRoom]} selectedPlayerId={null} {...on} />);
    const bar = screen.getByRole('slider', { name: 'Track position' });
    bar.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 20, right: 200, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });

    fireEvent.pointerDown(bar, { clientX: 20, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 100, pointerId: 1 });
    // Half way through 4:05 shows while held, before anything is sent
    expect(screen.getByText('2:02')).toBeInTheDocument();
    expect(on.onSeek).not.toHaveBeenCalled();

    fireEvent.pointerUp(bar, { clientX: 100, pointerId: 1 });
    expect(on.onSeek).toHaveBeenCalledTimes(1);
    expect(on.onSeek).toHaveBeenCalledWith(122.5, 'media_player.living_room');
  });

  it('seeks 5 s with the arrow keys', () => {
    const on = handlers();
    render(<MusicView players={[livingRoom]} selectedPlayerId={null} {...on} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Track position' }), { key: 'ArrowRight' });
    expect(on.onSeek).toHaveBeenCalledWith(97, 'media_player.living_room');
  });

  it('shows the position without seeking when the player cannot seek', () => {
    render(<MusicView players={[{ ...livingRoom, supported_features: 0 }]} selectedPlayerId={null} {...handlers()} />);
    expect(screen.getByRole('progressbar', { name: 'Track position' })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Track position' })).not.toBeInTheDocument();
  });

  it('turns shuffle on and steps repeat off → all → one', () => {
    const on = handlers();
    const { rerender } = render(
      <MusicView players={[{ ...livingRoom, shuffle: false, repeat: 'off' }]} selectedPlayerId={null} {...on} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(on.onSetShuffle).toHaveBeenCalledWith(true, 'media_player.living_room');
    fireEvent.click(screen.getByRole('button', { name: 'Repeat off' }));
    expect(on.onSetRepeat).toHaveBeenCalledWith('all', 'media_player.living_room');

    rerender(<MusicView players={[{ ...livingRoom, shuffle: true, repeat: 'all' }]} selectedPlayerId={null} {...on} />);
    expect(screen.getByRole('button', { name: 'Shuffle' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Repeat all' }));
    expect(on.onSetRepeat).toHaveBeenLastCalledWith('one', 'media_player.living_room');
  });

  it('leaves out shuffle and repeat for players without them', () => {
    render(<MusicView players={[livingRoom]} selectedPlayerId={null} {...handlers()} />);
    expect(screen.queryByRole('button', { name: 'Shuffle' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Repeat/ })).not.toBeInTheDocument();
  });

  it('drops the blurred background when the artwork can’t be fetched', () => {
    const { container } = render(
      <MusicView players={[{ ...livingRoom, entity_picture: 'https://example.test/art.jpg' }]} selectedPlayerId={null} {...handlers()} />,
    );
    expect(container.querySelector('.music-backdrop')).toHaveStyle({ backgroundImage: 'url("https://example.test/art.jpg")' });

    fireEvent.error(screen.getByRole('img', { name: 'Afterglow' }));

    expect(container.querySelector('.music-backdrop')).toHaveClass('music-backdrop--plain');
    expect(screen.getByRole('img', { name: 'Afterglow' })).toHaveClass('music-art--placeholder');
  });

  // It went back to the player's volume at any report, even one read before
  // the player had changed, so the slider jumped back to the old volume.
  it('keeps the volume set until the player reports it, not jumping back to a stale one', () => {
    const on = handlers();
    const { rerender } = render(<MusicView players={[livingRoom]} selectedPlayerId={null} {...on} />);
    const slider = () => screen.getByRole('slider', { name: 'Volume' });

    fireEvent.change(slider(), { target: { value: '0.7' } });
    expect(on.onSetVolume).toHaveBeenLastCalledWith(0.7, 'media_player.living_room');

    // A report from before the player changed
    rerender(<MusicView players={[{ ...livingRoom, volume_level: 0.41 }]} selectedPlayerId={null} {...on} />);
    expect(slider()).toHaveValue('0.7');

    rerender(<MusicView players={[{ ...livingRoom, volume_level: 0.7 }]} selectedPlayerId={null} {...on} />);
    expect(slider()).toHaveValue('0.7');
  });

  it('shows the player’s own volume again if it never reports the one set', () => {
    const on = handlers();
    const { rerender } = render(<MusicView players={[livingRoom]} selectedPlayerId={null} {...on} />);
    const slider = () => screen.getByRole('slider', { name: 'Volume' });

    fireEvent.change(slider(), { target: { value: '0.9' } });
    rerender(<MusicView players={[{ ...livingRoom, volume_level: 0.4 }]} selectedPlayerId={null} {...on} />);
    act(() => { vi.advanceTimersByTime(3000); });

    expect(slider()).toHaveValue('0.4');
  });

  it('greys the volume out for a player whose volume can’t be set', () => {
    render(<MusicView players={[{ ...livingRoom, supported_features: 1 }]} selectedPlayerId={null} {...handlers()} />);
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeDisabled();
  });

  // An Apple TV only steps its volume, as its remote's buttons do: the
  // slider sent levels it ignored.
  it('offers volume down and up for a player that can only step its volume', () => {
    const on = handlers();
    const appleTv = { ...livingRoom, entity_id: 'media_player.apple_tv', supported_features: 1 | 1024 };
    render(<MusicView players={[appleTv]} selectedPlayerId={null} {...on} />);

    expect(screen.queryByRole('slider', { name: 'Volume' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volume up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volume down' }));
    expect(on.onStepVolume).toHaveBeenNthCalledWith(1, 1, 'media_player.apple_tv');
    expect(on.onStepVolume).toHaveBeenNthCalledWith(2, -1, 'media_player.apple_tv');
  });

  it('shows one track position after switching speakers', () => {
    render(<MusicView players={[livingRoom, kitchen]} selectedPlayerId={null} {...handlers()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Speaker: Living Room, change speaker' }));
    fireEvent.click(screen.getByRole('button', { name: /^Kitchen/ }));

    expect(screen.getAllByRole('slider', { name: 'Track position' })).toHaveLength(1);
    expect(screen.getAllByRole('slider', { name: 'Volume' })).toHaveLength(1);
  });

  it('says when there are no speakers', () => {
    render(<MusicView players={[]} selectedPlayerId={null} {...handlers()} />);
    expect(screen.getByRole('heading', { name: 'No speakers' })).toBeInTheDocument();
  });
});
