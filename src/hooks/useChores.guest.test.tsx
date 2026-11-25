import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { rewardRedemptionAllowed } from '../display/guest-mode';
import { useChores } from './useChores';

describe('guest chore check-off', () => {
  it('awards points and a streak, labels the completion, and still blocks redemption', async () => {
    const { result } = renderHook(() => useChores());

    await act(async () => {
      await result.current.addChore({
        name: 'Dishes',
        assigned_to: ['ada'],
        frequency: 'daily',
        value_cents: 250,
      });
    });

    await waitFor(() => {
      expect(result.current.chores).toHaveLength(1);
    });
    const choreId = result.current.chores[0].id;

    await act(async () => {
      await result.current.completeChore(choreId, 'ada', 'guest');
    });

    await waitFor(() => {
      expect(result.current.streaks.find((streak) => streak.member_id === 'ada')?.current).toBe(1);
    });

    const earnings = await result.current.getEarningsForPeriod('2000-01-01', '2099-12-31');
    expect(earnings).toEqual([
      expect.objectContaining({ member_id: 'ada', total_cents: 250, chore_count: 1 }),
    ]);
    expect(rewardRedemptionAllowed(true)).toBe(false);

    const stored = JSON.parse(localStorage.getItem('beacon_completions') ?? '[]') as Array<{
      chore_id: string;
      by?: string;
    }>;
    expect(stored).toEqual([
      expect.objectContaining({ chore_id: choreId, member_id: 'ada', by: 'guest' }),
    ]);

    await act(async () => {
      await result.current.addChore({
        name: 'Trash',
        assigned_to: ['ada'],
        frequency: 'daily',
        value_cents: 100,
      });
    });
    const trashId = result.current.chores.find((chore) => chore.name === 'Trash')?.id;
    expect(trashId).toBeTruthy();
    await act(async () => {
      await result.current.completeChore(trashId!, 'ada');
    });
    const after = JSON.parse(localStorage.getItem('beacon_completions') ?? '[]') as Array<{
      chore_id: string;
      by?: string;
    }>;
    const family = after.find((entry) => entry.chore_id === trashId);
    expect(family).toBeTruthy();
    expect(family).not.toHaveProperty('by');

    const both = await result.current.getEarningsForPeriod('2000-01-01', '2099-12-31');
    expect(both[0].total_cents).toBe(350);
  });
});
