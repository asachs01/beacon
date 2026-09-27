import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { MediaPlayer } from '../types/music';
import { useMusic } from './useMusic';

const player = (entity_id: string, state: string) => ({ entity_id, state, name: entity_id }) as unknown as MediaPlayer;

vi.mock('../api/music', () => ({
  getMediaPlayers: vi.fn(async () => [player('media_player.living_room', 'idle'), player('media_player.kitchen', 'paused')]),
  refreshMediaPlayers: vi.fn(async () => []),
  parseMediaPlayer: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
  setVolume: vi.fn(),
}));

describe('useMusic', () => {
  // Settings' Default Player used to be ignored.
  it('shows the default player from Settings until another is picked', async () => {
    const { result } = renderHook(() => useMusic(() => null, true, true, 'media_player.kitchen'));

    await waitFor(() => expect(result.current.activePlayer?.entity_id).toBe('media_player.kitchen'));
    act(() => result.current.selectPlayer('media_player.living_room'));
    expect(result.current.activePlayer?.entity_id).toBe('media_player.living_room');
  });
});
