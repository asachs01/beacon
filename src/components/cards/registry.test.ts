import { describe, it, expect } from 'vitest';
import { cardRegistry, getCardDefinition } from './registry';

const definitions = Object.entries(cardRegistry);

describe('card registry contract', () => {
  it('keys every definition by its own type', () => {
    definitions.forEach(([type, definition]) => {
      expect(definition.type).toBe(type);
    });
  });

  it('gives every card at least one region it can be placed in', () => {
    definitions.forEach(([type, definition]) => {
      expect(definition.allowedRegions.length, type).toBeGreaterThan(0);
    });
  });

  it('never repeats a config field key within a card', () => {
    definitions.forEach(([type, definition]) => {
      const keys = (definition.configFields ?? []).map((field) => field.key);
      expect(new Set(keys).size, type).toBe(keys.length);
    });
  });

  it('backs every config field with a default value', () => {
    definitions.forEach(([type, definition]) => {
      (definition.configFields ?? []).forEach((field) => {
        expect(definition.defaultConfig, `${type}.${field.key}`).toHaveProperty(field.key);
      });
    });
  });

  it('does not expose a legacy key as its own editable field', () => {
    definitions.forEach(([type, definition]) => {
      const fields = definition.configFields ?? [];
      const keys = fields.map((field) => field.key);
      fields.forEach((field) => {
        if (field.type === 'entity-list' && field.legacyKey) {
          expect(keys, type).not.toContain(field.legacyKey);
        }
      });
    });
  });

  it('resolves known types and ignores unknown ones', () => {
    expect(getCardDefinition('family-calendar')?.displayName).toBe('Family Calendar');
    expect(getCardDefinition('nope')).toBeUndefined();
  });
});
