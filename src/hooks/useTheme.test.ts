import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { isDarkHours, resolveThemeId, useTheme, type DarkHours } from './useTheme';

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 8, 27, h, m);
};
const on: DarkHours = { autoDarkMode: true, darkModeStart: '19:00', darkModeEnd: '06:00' };
const off: DarkHours = { ...on, autoDarkMode: false };

afterEach(() => {
  vi.useRealTimers();
});

describe('isDarkHours', () => {
  it('runs past midnight', () => {
    expect(isDarkHours(at('18:59'), '19:00', '06:00')).toBe(false);
    expect(isDarkHours(at('19:00'), '19:00', '06:00')).toBe(true);
    expect(isDarkHours(at('02:30'), '19:00', '06:00')).toBe(true);
    expect(isDarkHours(at('06:00'), '19:00', '06:00')).toBe(false);
  });

  it('works within one day, and never for equal times', () => {
    expect(isDarkHours(at('14:00'), '13:00', '15:00')).toBe(true);
    expect(isDarkHours(at('16:00'), '13:00', '15:00')).toBe(false);
    expect(isDarkHours(at('12:00'), '12:00', '12:00')).toBe(false);
  });
});

describe('resolveThemeId', () => {
  // The toggle and its hours were saved but never read.
  it('turns a light theme dark by night with Auto Dark Mode on', () => {
    expect(resolveThemeId('skylight', on, at('21:00'))).toBe('midnight');
    expect(resolveThemeId('skylight', on, at('12:00'))).toBe('skylight');
    expect(resolveThemeId('skylight', off, at('21:00'))).toBe('skylight');
  });

  it('leaves a dark theme as it is', () => {
    expect(resolveThemeId('dracula', on, at('21:00'))).toBe('dracula');
  });

  it("switches the Auto theme at Settings' hours", () => {
    const late: DarkHours = { ...off, darkModeStart: '22:00', darkModeEnd: '07:00' };
    expect(resolveThemeId('auto', late, at('21:00'))).toBe('skylight');
    expect(resolveThemeId('auto', late, at('22:30'))).toBe('midnight');
  });
});

describe('useTheme', () => {
  it('turns dark on the minute the dark hours start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 27, 18, 59, 30));
    renderHook(() => useTheme('skylight', on));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => { vi.advanceTimersByTime(30_000); });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
