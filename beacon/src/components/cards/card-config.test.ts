import { describe, it, expect } from 'vitest';
import { readBoolean, readEntityIds, readString, readStringArray } from './card-config';

describe('readString', () => {
  it('trims the stored value', () => {
    expect(readString({ title: '  Lights  ' }, 'title')).toBe('Lights');
  });

  it('falls back for missing, blank, and non-string values', () => {
    expect(readString({}, 'title', 'Entities')).toBe('Entities');
    expect(readString({ title: '   ' }, 'title', 'Entities')).toBe('Entities');
    expect(readString({ title: 42 }, 'title', 'Entities')).toBe('Entities');
  });
});

describe('readBoolean', () => {
  it('returns the stored boolean', () => {
    expect(readBoolean({ show_other: false }, 'show_other', true)).toBe(false);
  });

  it('falls back when the key was never saved', () => {
    expect(readBoolean({}, 'show_other', true)).toBe(true);
  });

  it('ignores truthy non-booleans', () => {
    expect(readBoolean({ show_other: 'yes' }, 'show_other', true)).toBe(true);
  });
});

describe('readStringArray', () => {
  it('keeps only non-empty strings', () => {
    expect(readStringArray({ entity_ids: ['light.a', 7, '', null, 'light.b'] }, 'entity_ids'))
      .toEqual(['light.a', 'light.b']);
  });

  it('returns an empty array when the value is not a list', () => {
    expect(readStringArray({ entity_ids: 'light.a' }, 'entity_ids')).toEqual([]);
  });
});

describe('readEntityIds', () => {
  it('prefers the entity list', () => {
    const config = { entity_ids: ['light.a'], entity_id: 'light.legacy' };
    expect(readEntityIds(config, 'entity_ids', 'entity_id')).toEqual(['light.a']);
  });

  it('falls back to the single-entity key saved by older cards', () => {
    expect(readEntityIds({ entity_id: 'light.legacy' }, 'entity_ids', 'entity_id')).toEqual(['light.legacy']);
  });

  it('returns nothing when neither key is configured', () => {
    expect(readEntityIds({ entity_ids: [] }, 'entity_ids', 'entity_id')).toEqual([]);
  });
});
