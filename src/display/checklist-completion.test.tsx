import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CalendarSidebar } from '../components/CalendarSidebar';
import { TasksCard } from '../components/cards/TasksCard';
import { useChores } from '../hooks/useChores';
import type { DashboardCardContext } from '../types/dashboard-cards';
import type { FamilyMember } from '../types/family';
import { checklistGuestCheckedIds, planChecklistToggle } from './checklist-completion';

const parent: FamilyMember = {
  id: 'parent',
  name: 'Pat',
  avatar: '🧑',
  color: '#111111',
  role: 'parent',
};
const ada: FamilyMember = {
  id: 'ada',
  name: 'Ada',
  avatar: '👧',
  color: '#3b82f6',
  role: 'child',
};

describe('dashboard and calendar guest check-off', () => {
  it('records by: guest on the assignee and labels both task lists', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useChores());
    await act(async () => {
      await result.current.addChore({
        name: 'Dishes',
        assigned_to: ['ada'],
        frequency: 'daily',
        value_cents: 100,
      });
      await result.current.addChore({
        name: 'Trash',
        assigned_to: ['ada'],
        frequency: 'daily',
        value_cents: 50,
      });
    });
    const dishes = result.current.chores.find((chore) => chore.name === 'Dishes');
    const trash = result.current.chores.find((chore) => chore.name === 'Trash');
    expect(dishes?.id).toBeTruthy();
    expect(trash?.id).toBeTruthy();

    const members = [parent, ada];
    const plan = planChecklistToggle({
      choreId: dishes!.id,
      chores: result.current.chores,
      members,
      completions: result.current.completionsToday,
      guestActive: true,
    });
    expect(plan).toEqual({ memberId: 'ada', action: 'complete', by: 'guest' });

    await act(async () => {
      await result.current.completeChore(dishes!.id, plan.memberId, plan.by);
    });
    await waitFor(() => {
      expect(result.current.completionsToday.some((entry) => entry.chore_id === dishes!.id)).toBe(true);
    });

    const stored = JSON.parse(localStorage.getItem('beacon_completions') ?? '[]') as Array<{
      member_id: string;
      by?: string;
    }>;
    expect(stored).toEqual([
      expect.objectContaining({ member_id: 'ada', by: 'guest' }),
    ]);
    expect(stored.some((entry) => entry.member_id === 'parent')).toBe(false);

    const guestChecked = checklistGuestCheckedIds({
      chores: result.current.chores,
      members,
      completions: result.current.completionsToday,
      guestActive: true,
    });
    expect(guestChecked.has(dishes!.id)).toBe(true);
    const completed = new Set([dishes!.id]);
    const onToggle = vi.fn();

    const calendar = render(
      <CalendarSidebar
        events={[]}
        chores={result.current.chores}
        completedChoreIds={completed}
        guestCheckedChoreIds={guestChecked}
        onToggleChore={onToggle}
        todoItems={[]}
        members={members}
      />,
    );
    expect(screen.getByText('Checked off by Guest')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Complete Trash' }));
    expect(onToggle).toHaveBeenCalledWith(trash!.id);
    calendar.unmount();

    render(
      <TasksCard
        config={{}}
        context={{
          todoItems: [],
          taskmateUsers: [],
          filteredChores: result.current.chores,
          completedChoreIds: completed,
          onToggleChore: onToggle,
          members,
          guestCheckedChoreIds: guestChecked,
        } as DashboardCardContext}
      />,
    );
    expect(screen.getByText('Checked off by Guest')).toBeInTheDocument();
  });

  it('records an unassigned guest check-off with by: guest and no member', () => {
    const plan = planChecklistToggle({
      choreId: 'open',
      chores: [{ id: 'open', assigned_to: [] }],
      members: [{ id: 'parent' }, { id: 'ada' }],
      completions: [],
      guestActive: true,
    });
    expect(plan).toEqual({ memberId: '', action: 'complete', by: 'guest' });
    expect(plan.memberId).not.toBe('parent');
  });

  it('still credits a family check-off to the first member and omits by', () => {
    const plan = planChecklistToggle({
      choreId: 'dishes',
      chores: [{ id: 'dishes', assigned_to: ['ada'] }],
      members: [{ id: 'parent' }, { id: 'ada' }],
      completions: [],
      guestActive: false,
    });
    expect(plan).toEqual({ memberId: 'parent', action: 'complete' });
    expect(plan).not.toHaveProperty('by');
  });
});
