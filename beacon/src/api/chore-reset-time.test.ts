import { describe, expect, it } from 'vitest';
import { isValidChoreResetTime } from './chore-reset-time';

describe('isValidChoreResetTime', () => {
  it('accepts HH:mm from 00:00 through 23:59', () => {
    for (const value of ['00:00', '03:00', '09:30', '23:59']) {
      expect(isValidChoreResetTime(value), value).toBe(true);
    }
  });

  it('rejects empty, out-of-range, and non-clock values', () => {
    for (const value of ['', '   ', '24:00', '23:60', '3:00', '03:00:00', 'morning', null, undefined]) {
      expect(isValidChoreResetTime(value), String(value)).toBe(false);
    }
  });
});
