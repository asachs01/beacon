import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getEarningsForPeriod: vi.fn(async () => []),
  settings: { weekStartsOn: 0 as 0 | 1, payoutSchedule: 'weekly', currencySymbol: '$' },
}));

vi.mock('../hooks/useFamily', () => ({ useFamily: () => ({ members: [] }) }));
vi.mock('../hooks/useSettings', () => ({ useSettings: () => ({ settings: mocks.settings }) }));
vi.mock('../hooks/useChores', () => ({
  useChores: () => ({ getEarningsForPeriod: mocks.getEarningsForPeriod, getStreakForMember: () => null }),
}));

import { Leaderboard } from './Leaderboard';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 27, 10, 0)); // Sunday 27 September
  mocks.getEarningsForPeriod.mockClear();
  mocks.settings.weekStartsOn = 0;
  mocks.settings.payoutSchedule = 'weekly';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Leaderboard', () => {
  it('counts the week from the day set in Settings', () => {
    mocks.settings.weekStartsOn = 1;
    render(<Leaderboard open onClose={() => {}} />);
    expect(mocks.getEarningsForPeriod).toHaveBeenCalledWith('2026-09-21', '2026-09-27');
  });

  it('counts a Sunday-to-Saturday week by default', () => {
    render(<Leaderboard open onClose={() => {}} />);
    expect(mocks.getEarningsForPeriod).toHaveBeenCalledWith('2026-09-27', '2026-10-03');
  });

  it('opens on the month when chores are paid monthly', () => {
    mocks.settings.payoutSchedule = 'monthly';
    render(<Leaderboard open onClose={() => {}} />);
    expect(mocks.getEarningsForPeriod).toHaveBeenCalledWith('2026-09-01', '2026-09-30');
    expect(screen.getByRole('button', { name: 'This Month' })).toHaveClass('lb-period-btn--active');
  });
});
