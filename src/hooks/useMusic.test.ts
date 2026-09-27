import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { MediaPlayer } from '../types/music';
import { useMusic } from './useMusic';
import { getMediaPlayers, refreshMediaPlayers, pause, seek, setRepeat } from '../api/music';

/** Stable, as App's is: a new function each render reloads the players. */
const noClient = () => null;
const player = (entity_id: string, state: string, extra: Partial<MediaPlayer> = {}) =>
  ({ entity_id, state, name: entity_id, ...extra }) as unknown as MediaPlayer;

vi.mock('../api/music', async (importActual) => ({
  positionAt: (await importActual<typeof import('../api/music')>()).positionAt,
  getMediaPlayers: vi.fn(async () => [player('media_player.living_room', 'idle'), player('media_player.kitchen', 'paused')]),
  refreshMediaPlayers: vi.fn(async () => []),
  parseMediaPlayer: vi.fn(),
  play: vi.fn(async () => {}),
  pause: vi.fn(async () => {}),
  next: vi.fn(async () => {}),
  previous: vi.fn(async () => {}),
  setVolume: vi.fn(async () => {}),
  seek: vi.fn(async () => {}),
  setShuffle: vi.fn(async () => {}),
  setRepeat: vi.fn(async () => {}),
}));

afterEach(() => {
  vi.useRealTimers();
});

describe('useMusic', () => {
  // Settings' Default Player used to be ignored.
  it('shows the default player from Settings until another is picked', async () => {
    const { result } = renderHook(() => useMusic(noClient, true, true, 'media_player.kitchen'));

    await waitFor(() => expect(result.current.activePlayer?.entity_id).toBe('media_player.kitchen'));
    act(() => result.current.selectPlayer('media_player.living_room'));
    expect(result.current.activePlayer?.entity_id).toBe('media_player.living_room');
  });

  // The add-on reads the players only every 10 s, so a tap on pause took up
  // to 10 s to show.
  it('shows a pause at once, where the track had got to, and reads the players again a second later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-27T10:00:30Z'));
    vi.mocked(getMediaPlayers).mockResolvedValueOnce([
      player('media_player.living_room', 'playing', {
        media_position: 62, media_position_updated_at: '2026-09-27T10:00:00Z', media_duration: 245,
      }),
    ]);
    const { result } = renderHook(() => useMusic(noClient, true, true));
    await waitFor(() => expect(result.current.players[0]?.state).toBe('playing'));
    vi.mocked(refreshMediaPlayers).mockClear();

    await act(async () => { await result.current.pause('media_player.living_room'); });

    expect(pause).toHaveBeenCalledWith(null, 'media_player.living_room');
    expect(result.current.players[0]).toMatchObject({ state: 'paused', media_position: expect.closeTo(92, 0) });
    expect(refreshMediaPlayers).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(refreshMediaPlayers).toHaveBeenCalledTimes(1);
  });

  it('shows a seek and a repeat change at once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-27T10:00:30Z'));
    vi.mocked(getMediaPlayers).mockResolvedValueOnce([
      player('media_player.living_room', 'playing', {
        media_position: 62, media_position_updated_at: '2026-09-27T10:00:00Z', media_duration: 245, repeat: 'off',
      }),
    ]);
    const { result } = renderHook(() => useMusic(noClient, true, true));
    await waitFor(() => expect(result.current.players[0]?.state).toBe('playing'));

    await act(async () => { await result.current.seek(180, 'media_player.living_room'); });
    expect(seek).toHaveBeenCalledWith(null, 'media_player.living_room', 180);
    expect(result.current.players[0]?.media_position).toBe(180);
    // Measured now, so it counts on from 180 s rather than from 62 s
    expect(Date.parse(result.current.players[0]!.media_position_updated_at!)).toBeGreaterThanOrEqual(
      Date.parse('2026-09-27T10:00:30Z'),
    );

    await act(async () => { await result.current.setRepeat('all', 'media_player.living_room'); });
    expect(setRepeat).toHaveBeenCalledWith(null, 'media_player.living_room', 'all');
    expect(result.current.players[0]?.repeat).toBe('all');
  });
});
