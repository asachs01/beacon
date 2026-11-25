import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChoreCard } from './ChoreCard';
import { TaskChecklist } from './TaskChecklist';
import type { Chore, FamilyMember } from '../types/family';

const member: FamilyMember = {
  id: 'ada',
  name: 'Ada',
  avatar: '👧',
  color: '#3b82f6',
  role: 'child',
};

const chore: Chore = {
  id: 'dishes',
  name: 'Dishes',
  assigned_to: ['ada'],
  frequency: 'daily',
  value_cents: 100,
};

describe('Checked off by Guest', () => {
  it('shows the label on a completed chore and on a listed completion', () => {
    render(
      <ChoreCard
        chore={chore}
        member={member}
        isCompleted
        checkedOffByGuest
        onComplete={() => {}}
        onUncomplete={() => {}}
      />,
    );
    expect(screen.getByText('Checked off by Guest')).toBeInTheDocument();

    const open: Chore = { ...chore, id: 'trash', name: 'Trash' };
    render(
      <TaskChecklist
        chores={[chore, open]}
        completedIds={new Set(['dishes'])}
        guestCheckedIds={new Set(['dishes'])}
        onToggle={() => {}}
      />,
    );
    expect(screen.getAllByText('Checked off by Guest')).toHaveLength(2);
  });

  it('omits the label when the completion was not by a guest', () => {
    render(
      <ChoreCard
        chore={chore}
        member={member}
        isCompleted
        onComplete={() => {}}
        onUncomplete={() => {}}
      />,
    );
    expect(screen.queryByText('Checked off by Guest')).toBeNull();
  });
});
