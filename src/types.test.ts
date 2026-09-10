import { describe, it, expect } from 'vitest';
import {
  CALENDAR_COLORS,
  CALENDAR_COLOR_PRESETS,
  getCalendarColor,
  getPastelColor,
  getFullColor,
  resolveCalendarColor,
} from './types';

describe('CALENDAR_COLORS', () => {
  it('has exactly 4 category colors (Sage/Lavender/Coral/Teal per design-tokens.md)', () => {
    expect(Object.keys(CALENDAR_COLORS)).toHaveLength(4);
  });

  it('does not contain the cut colors (Rose #ec4899, Ocean/duplicate #3b82f6)', () => {
    const values = Object.values(CALENDAR_COLORS);
    expect(values).not.toContain('#ec4899');
    expect(values).not.toContain('#3b82f6');
  });

  it('contains exactly the agreed 4 hex values', () => {
    expect(Object.values(CALENDAR_COLORS).sort()).toEqual(
      ['#10b981', '#14b8a6', '#8b5cf6', '#f97316'].sort(),
    );
  });
});

describe('getCalendarColor', () => {
  it('keeps the original category colors for the first four calendars', () => {
    expect([0, 1, 2, 3].map(getCalendarColor)).toEqual(Object.values(CALENDAR_COLORS));
  });

  it('walks the full preset palette before wrapping (no early collisions)', () => {
    const colors = CALENDAR_COLOR_PRESETS.map((c, i) => getCalendarColor(i));
    expect(colors).toEqual(CALENDAR_COLOR_PRESETS);
  });

  it('wraps only past the preset count', () => {
    const count = CALENDAR_COLOR_PRESETS.length;
    expect(getCalendarColor(count)).toBe(getCalendarColor(0));
    expect(getCalendarColor(count + 1)).toBe(getCalendarColor(1));
  });
});

describe('CALENDAR_COLOR_PRESETS', () => {
  it('offers more than the 4 category colors so many calendars stay distinct', () => {
    expect(CALENDAR_COLOR_PRESETS.length).toBeGreaterThanOrEqual(10);
  });

  it('has no duplicate swatches', () => {
    expect(new Set(CALENDAR_COLOR_PRESETS).size).toBe(CALENDAR_COLOR_PRESETS.length);
  });

  it('contains the four auto-assigned category colors', () => {
    const categoryValues = Object.values(CALENDAR_COLORS);
    for (const c of categoryValues) {
      expect(CALENDAR_COLOR_PRESETS).toContain(c);
    }
  });
});

describe('getPastelColor / getFullColor', () => {
  it('maps every category full color to a distinct pastel', () => {
    const fulls = Object.values(CALENDAR_COLORS);
    const pastels = fulls.map(getPastelColor);
    expect(new Set(pastels).size).toBe(fulls.length);
  });

  it('renders an arbitrary custom hex color (e.g. a user-picked calendar color) as-is, lightened for the pastel variant', () => {
    // #000000 isn't one of the 4 category colors, but user-customized
    // calendar colors and family-member colors are arbitrary hex values
    // that must still render distinctly rather than collapsing to gray.
    expect(getFullColor('#000000')).toBe('#000000');
    expect(getPastelColor('#000000')).not.toBe('#e5e7eb');
  });

  it('falls back to neutral gray only for a genuinely unparseable color', () => {
    expect(getPastelColor('')).toBe('#e5e7eb');
    expect(getFullColor('')).toBe('#6b7280');
    expect(getPastelColor('not-a-color')).toBe('#e5e7eb');
    expect(getFullColor('not-a-color')).toBe('#6b7280');
  });

  it('getFullColor is idempotent for known colors', () => {
    for (const full of Object.values(CALENDAR_COLORS)) {
      expect(getFullColor(full)).toBe(full);
    }
  });
});

describe('resolveCalendarColor', () => {
  const members = [
    { color: '#3b82f6', calendar_entity: 'calendar.mom' },
    { color: '#22c55e', calendar_entity: 'calendar.dad', additional_calendar_entities: ['calendar.dad_soccer'] },
  ];

  it('prioritizes a user-customized calendar color above everything else', () => {
    const color = resolveCalendarColor('calendar.mom', 0, {
      calendarColors: { 'calendar.mom': '#ff00ff' },
      members,
    });
    expect(color).toBe('#ff00ff');
  });

  it('falls back to the linked family member color when no user override exists', () => {
    const color = resolveCalendarColor('calendar.mom', 0, { members });
    expect(color).toBe('#3b82f6');
  });

  it('matches a calendar linked via additional_calendar_entities, not just the primary calendar_entity', () => {
    const color = resolveCalendarColor('calendar.dad_soccer', 5, { members });
    expect(color).toBe('#22c55e');
  });

  it('falls back to the positional palette when no user color or member link exists', () => {
    const color = resolveCalendarColor('calendar.unlinked', 1, { members });
    expect(color).toBe(getCalendarColor(1));
  });

  it('works with no options at all (plain positional fallback)', () => {
    expect(resolveCalendarColor('calendar.x', 2)).toBe(getCalendarColor(2));
  });

  it('falls back to defaultColor instead of the positional palette when provided', () => {
    const color = resolveCalendarColor('beacon-local', 0, {
      defaultColor: '#6366f1',
    });
    expect(color).toBe('#6366f1');
  });

  it('still lets a user override beat defaultColor', () => {
    const color = resolveCalendarColor('beacon-local', 0, {
      calendarColors: { 'beacon-local': '#ff6600' },
      defaultColor: '#6366f1',
    });
    expect(color).toBe('#ff6600');
  });
});
