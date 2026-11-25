import { describe, expect, it } from 'vitest';
import { importPinDecision } from './pin-gate';

describe('magic import PIN gate', () => {
  it('allows the action when no family PIN is configured', () => {
    expect(importPinDecision([{ pin: '' }, { name: 'Ada' } as { pin?: string }], '')).toBe('not-required');
    expect(importPinDecision([], '1234')).toBe('not-required');
  });

  it('accepts any configured family PIN and ignores extra characters', () => {
    const members = [{ pin: '1234' }, { pin: '5555' }, { pin: null }];
    expect(importPinDecision(members, '12-34')).toBe('accepted');
    expect(importPinDecision(members, '5555')).toBe('accepted');
  });

  it('rejects a missing or wrong PIN when one is configured', () => {
    const members = [{ pin: '1234' }];
    expect(importPinDecision(members, '')).toBe('rejected');
    expect(importPinDecision(members, '0000')).toBe('rejected');
    expect(importPinDecision(members, '12345')).toBe('rejected');
  });

  it('does not accept a guest PIN that is not one of the family PINs', () => {
    const members = [{ pin: '1234' }, { pin: '5555' }];
    expect(importPinDecision(members, '987654')).toBe('rejected');
  });
});
