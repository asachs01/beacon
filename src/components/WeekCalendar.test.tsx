import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { format } from 'date-fns';
import { WeekCalendar } from './WeekCalendar';

vi.mock('../hooks/useWeatherForecast', () => ({
  useWeatherForecast: () => [],
}));

// Thursday, so Sunday- and Monday-start weeks differ.
const TODAY = new Date('2026-09-24T12:00:00');

function renderCalendar(weekStartsOn: 0 | 1, onVisibleWeekChange = vi.fn()) {
  const props = {
    events: [],
    hiddenCalendars: new Set<string>(),
    onEventClick: vi.fn(),
    onSlotClick: vi.fn(),
    onVisibleWeekChange,
  };
  const utils = render(<WeekCalendar {...props} weekStartsOn={weekStartsOn} />);
  return {
    ...utils,
    onVisibleWeekChange,
    rerenderWith: (next: 0 | 1) =>
      utils.rerender(<WeekCalendar {...props} weekStartsOn={next} />),
  };
}

function lastReportedDay(fn: ReturnType<typeof vi.fn>) {
  return format(fn.mock.calls.at(-1)![0] as Date, 'yyyy-MM-dd');
}

describe('WeekCalendar weekStartsOn', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; WeekCalendar's useIsMobile needs one.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the week on Sunday when weekStartsOn is 0', () => {
    const { onVisibleWeekChange } = renderCalendar(0);
    expect(lastReportedDay(onVisibleWeekChange)).toBe('2026-09-20');
  });

  it('starts the week on Monday when weekStartsOn is 1', () => {
    const { onVisibleWeekChange } = renderCalendar(1);
    expect(lastReportedDay(onVisibleWeekChange)).toBe('2026-09-21');
  });

  it('reports the new week start when the setting changes while mounted', () => {
    const { onVisibleWeekChange, rerenderWith } = renderCalendar(0);
    expect(lastReportedDay(onVisibleWeekChange)).toBe('2026-09-20');

    rerenderWith(1);
    expect(lastReportedDay(onVisibleWeekChange)).toBe('2026-09-21');
  });
});
