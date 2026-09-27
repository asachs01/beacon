import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskChecklist } from './TaskChecklist';
import type { Chore, ChoreCompletion, FamilyMember } from '../types/family';

const alex: FamilyMember = { id: 'alex', name: 'Alex', avatar: '🧑', color: '#3b82f6', role: 'parent' };
const sam: FamilyMember = { id: 'sam', name: 'Sam', avatar: '👧', color: '#ec4899', role: 'child' };

const chore = (id: string, name: string, assigned_to: string[]): Chore => ({
  id, name, assigned_to, frequency: 'daily', value_cents: 100,
});
const doneBy = (chore_id: string, member_id: string): ChoreCompletion => ({
  id: `chore-${chore_id}:${member_id}:today`, chore_id, member_id, completed_at: new Date().toISOString(),
});

describe('TaskChecklist', () => {
  it('ticks a chore for the person it is assigned to, not the first family member', async () => {
    const onToggle = vi.fn();
    render(
      <TaskChecklist chores={[chore('dishes', 'Dishes', ['sam'])]} completions={[]} onToggle={onToggle} members={[alex, sam]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Complete Dishes for Sam' }));

    expect(onToggle).toHaveBeenCalledWith('dishes', 'sam');
  });

  it("shows each person's own tick for a chore shared by two", async () => {
    const onToggle = vi.fn();
    render(
      <TaskChecklist
        chores={[chore('dishes', 'Dishes', ['alex', 'sam'])]}
        completions={[doneBy('dishes', 'sam')]}
        onToggle={onToggle}
        members={[alex, sam]}
      />,
    );

    // Sam's done; Alex still has it to do (it used to show whatever the
    // first member had done, for everyone).
    expect(screen.getByRole('button', { name: 'Undo Dishes for Sam' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Complete Dishes for Alex' }));
    expect(onToggle).toHaveBeenCalledWith('dishes', 'alex');

    await userEvent.click(screen.getByRole('button', { name: 'Undo Dishes for Sam' }));
    expect(onToggle).toHaveBeenLastCalledWith('dishes', 'sam');
  });

  it('is all done only when everyone has done their chores', () => {
    const { rerender } = render(
      <TaskChecklist
        chores={[chore('dishes', 'Dishes', ['alex', 'sam'])]}
        completions={[doneBy('dishes', 'alex')]}
        onToggle={() => {}}
        members={[alex, sam]}
      />,
    );
    expect(screen.queryByText('All done — great job!')).not.toBeInTheDocument();

    rerender(
      <TaskChecklist
        chores={[chore('dishes', 'Dishes', ['alex', 'sam'])]}
        completions={[doneBy('dishes', 'alex'), doneBy('dishes', 'sam')]}
        onToggle={() => {}}
        members={[alex, sam]}
      />,
    );
    expect(screen.getByText('All done — great job!')).toBeInTheDocument();
  });

  it("shows only the filtered member's rows", () => {
    render(
      <TaskChecklist
        chores={[chore('dishes', 'Dishes', ['alex', 'sam'])]}
        completions={[]}
        onToggle={() => {}}
        members={[alex, sam]}
        onlyMemberId="sam"
      />,
    );

    expect(screen.getByRole('button', { name: 'Complete Dishes for Sam' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete Dishes for Alex' })).not.toBeInTheDocument();
  });

  it('asks who did a chore assigned to no one', async () => {
    const onToggle = vi.fn();
    render(
      <TaskChecklist chores={[chore('lawn', 'Mow lawn', [])]} completions={[]} onToggle={onToggle} members={[alex, sam]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Complete Mow lawn' }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText('Who did it?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sam did Mow lawn' }));
    expect(onToggle).toHaveBeenCalledWith('lawn', 'sam');
    expect(screen.queryByText('Who did it?')).not.toBeInTheDocument();
  });

  it('credits the only family member without asking', async () => {
    const onToggle = vi.fn();
    render(
      <TaskChecklist chores={[chore('lawn', 'Mow lawn', [])]} completions={[]} onToggle={onToggle} members={[sam]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Complete Mow lawn' }));

    expect(onToggle).toHaveBeenCalledWith('lawn', 'sam');
  });

  it('shows who did a chore assigned to no one, and undoes just theirs', async () => {
    const onToggle = vi.fn();
    render(
      <TaskChecklist
        chores={[chore('lawn', 'Mow lawn', []), chore('dishes', 'Dishes', ['alex'])]}
        completions={[doneBy('lawn', 'sam')]}
        onToggle={onToggle}
        members={[alex, sam]}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Complete Mow lawn' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo Mow lawn for Sam' }));
    expect(onToggle).toHaveBeenCalledWith('lawn', 'sam');
  });
});
