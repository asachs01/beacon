import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { FamilyMember, Routine } from '../../types/family';
import type { BeaconSettings } from '../../hooks/useSettings';

const mocks = vi.hoisted(() => ({
  refreshRoutines: vi.fn(),
  refreshChores: vi.fn(),
}));

const kai: FamilyMember = { id: 'kai', name: 'Kai', avatar: '🦊', color: '#ff8800', role: 'child' };
const routine = (id: string, name: string, time_of_day: Routine['time_of_day']): Routine => ({
  id,
  name,
  member_id: 'kai',
  time_of_day,
  tasks: [{ id: `${id}-t`, name: `${name} task`, order: 0 }],
});
const routines = [routine('m', 'Morning routine', 'morning'), routine('a', 'Afternoon routine', 'afternoon')];

vi.mock('../../hooks/useFamily', () => ({ useFamily: () => ({ members: [kai] }) }));
vi.mock('../../hooks/useRoutines', () => ({
  useRoutines: () => ({
    routines,
    isTaskCompletedToday: () => false,
    toggleTask: () => {},
    refresh: mocks.refreshRoutines,
  }),
}));
vi.mock('../../hooks/useChores', () => ({
  useChores: () => ({
    chores: [],
    currentCompletions: [],
    completeChore: () => {},
    uncompleteChore: () => {},
    refresh: mocks.refreshChores,
  }),
}));
vi.mock('../ScreenSaver', () => ({ ScreenSaver: () => null }));

import { FocusView } from './FocusView';

const settings = { timeFormat: '12h', currencySymbol: '$' } as BeaconSettings;
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  mocks.refreshRoutines.mockClear();
  mocks.refreshChores.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FocusView over time', () => {
  it('switches greeting and routine at noon, with the clock', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 11, 59, 30));
    render(<FocusView memberId="kai" settings={settings} onExit={() => {}} />);
    expect(screen.getByText('Good morning,')).toBeInTheDocument();
    expect(screen.getByText('Morning routine')).toBeInTheDocument();
    expect(screen.getByText('11:59 AM')).toBeInTheDocument();

    advance(30_000);
    expect(screen.getByText('Good afternoon,')).toBeInTheDocument();
    expect(screen.getByText('Afternoon routine')).toBeInTheDocument();
    expect(screen.getByText('12:00 PM')).toBeInTheDocument();
  });

  // Reloading routines and chores at midnight is up to useRoutines and
  // useChores now (so every screen does it); see their tests.
  it('moves on to the new day at midnight', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 23, 59, 30));
    render(<FocusView memberId="kai" settings={settings} onExit={() => {}} />);
    expect(screen.getByText('Saturday, September 26')).toBeInTheDocument();

    advance(30_000);
    expect(screen.getByText('Sunday, September 27')).toBeInTheDocument();
    expect(screen.getByText('Good morning,')).toBeInTheDocument();
  });
});
