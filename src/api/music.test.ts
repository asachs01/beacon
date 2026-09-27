import { describe, it, expect } from 'vitest';
import { positionAt, canDo, MediaFeature } from './music';
import type { MediaPlayer } from '../types/music';

const player = (overrides: Partial<MediaPlayer>): MediaPlayer => ({
  entity_id: 'media_player.living_room',
  friendly_name: 'Living Room',
  state: 'playing',
  media_duration: 245,
  media_position: 62,
  media_position_updated_at: '2026-09-27T10:00:00Z',
  ...overrides,
});
const at = (iso: string) => Date.parse(iso);

describe('positionAt', () => {
  // HA reports where the track was when last measured, not where it is now:
  // the screen used to count on from when it opened.
  it('counts on from when Home Assistant measured the position', () => {
    expect(positionAt(player({}), at('2026-09-27T10:00:30Z'))).toBe(92);
  });

  it('holds still while paused', () => {
    expect(positionAt(player({ state: 'paused' }), at('2026-09-27T10:05:00Z'))).toBe(62);
  });

  it('stops at the end of the track', () => {
    expect(positionAt(player({}), at('2026-09-27T11:00:00Z'))).toBe(245);
  });

  it('knows nothing without a position', () => {
    expect(positionAt(player({ media_position: undefined }), at('2026-09-27T10:00:30Z'))).toBeNull();
  });
});

describe('canDo', () => {
  it('goes by supported_features when the player reports them', () => {
    const p = player({ supported_features: MediaFeature.SEEK | MediaFeature.REPEAT_SET, shuffle: false });
    expect(canDo(p, MediaFeature.SEEK)).toBe(true);
    expect(canDo(p, MediaFeature.REPEAT_SET)).toBe(true);
    expect(canDo(p, MediaFeature.SHUFFLE_SET)).toBe(false);
  });

  it('otherwise allows seeking, and shuffle or repeat only when the player shows them', () => {
    expect(canDo(player({}), MediaFeature.SEEK)).toBe(true);
    expect(canDo(player({}), MediaFeature.SHUFFLE_SET)).toBe(false);
    expect(canDo(player({ repeat: 'off' }), MediaFeature.REPEAT_SET)).toBe(true);
  });
});
