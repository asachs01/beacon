import { describe, expect, it } from 'vitest';
import { importPinRequired } from './pin-gate';

describe('magic import PIN gate', () => {
  it('allows the action when no family PIN is configured', () => {
    expect(importPinRequired([{ pin: '' }, { name: 'Ada' } as { pin?: string }])).toBe(false);
    expect(importPinRequired([])).toBe(false);
    expect(importPinRequired([{ hasPin: false }])).toBe(false);
  });

  it('requires a PIN when the server says one is set', () => {
    expect(importPinRequired([{ hasPin: true }, { pin: null }])).toBe(true);
  });

  it('still asks when a pre-hash cache has a plaintext PIN', () => {
    expect(importPinRequired([{ pin: '1234' }])).toBe(true);
  });
});
