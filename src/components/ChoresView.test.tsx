import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Chore, FamilyMember } from '../types/family';

const mocks = vi.hoisted(() => ({
  addChore: vi.fn(),
  settings: { currencySymbol: '$' },
  chores: [] as Chore[],
}));

const sam: FamilyMember = { id: 'sam', name: 'Sam', avatar: '👧', color: '#ec4899', role: 'child' };

vi.mock('../hooks/useFamily', () => ({ useFamily: () => ({ members: [sam] }) }));
vi.mock('../hooks/useSettings', () => ({ useSettings: () => ({ settings: mocks.settings }) }));
vi.mock('../hooks/useChores', () => ({
  useChores: () => ({
    chores: mocks.chores,
    addChore: mocks.addChore,
    updateChore: vi.fn(),
    removeChore: vi.fn(),
    completeChore: vi.fn(),
    uncompleteChore: vi.fn(),
    isChoreDone: () => false,
    getStreakForMember: (id: string) => ({ member_id: id, current: 0, longest: 0, last_completed: '' }),
    getChoresForMember: () => [],
    getMemberProgress: () => ({ completed: 0, total: 0 }),
  }),
}));

import { ChoresView } from './ChoresView';

async function openNewChoreForm() {
  const user = userEvent.setup();
  render(<ChoresView />);
  await user.click(screen.getByRole('button', { name: 'Add chore for Sam' }));
  const form = within(document.querySelector<HTMLElement>('.modal')!);
  await user.type(form.getByPlaceholderText('e.g., Vacuum living room'), 'Dishes');
  return { user, form };
}

describe('ChoresView chore value', () => {
  beforeEach(() => {
    mocks.addChore.mockClear();
    mocks.settings.currencySymbol = '$';
  });

  // The field was reformatted on every keystroke ("2" became "2.00", with
  // the cursor after it), so typing 2.50 into the cleared field saved $0.01.
  // fireEvent rather than user-event here: user-event rewrites what the page
  // puts in a number field ("2.00" → "2"), which hides that reformatting.
  it('keeps the amount as typed until the field is left', async () => {
    const { form } = await openNewChoreForm();
    const value = form.getByLabelText('Value') as HTMLInputElement;

    fireEvent.change(value, { target: { value: '2' } });
    expect(value.value).toBe('2');

    fireEvent.blur(value);
    expect(value.value).toBe('2.00');
  });

  it('can be emptied', async () => {
    const { form } = await openNewChoreForm();
    const value = form.getByLabelText('Value') as HTMLInputElement;

    fireEvent.change(value, { target: { value: '' } });

    expect(value.value).toBe('');
  });

  it('saves the amount typed', async () => {
    const { user, form } = await openNewChoreForm();
    const value = form.getByLabelText('Value');

    await user.clear(value);
    await user.type(value, '2.50');
    await user.click(form.getByRole('button', { name: 'Add Chore' }));

    expect(mocks.addChore).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dishes', value_cents: 250 }));
  });

  it('rounds stars to a whole number once the field is left', async () => {
    mocks.settings.currencySymbol = '⭐';
    const { user, form } = await openNewChoreForm();
    const value = form.getByLabelText('Value') as HTMLInputElement;

    await user.clear(value);
    await user.type(value, '2.6');
    await user.tab();

    expect(value.value).toBe('3');
    await user.click(form.getByRole('button', { name: 'Add Chore' }));
    expect(mocks.addChore).toHaveBeenCalledWith(expect.objectContaining({ value_cents: 300 }));
  });

  it('shows the currency chosen in Settings', async () => {
    mocks.settings.currencySymbol = '€';
    const { form } = await openNewChoreForm();

    expect(form.getByText('€')).toBeInTheDocument();
  });
});

describe('ChoresView open chores', () => {
  afterEach(() => {
    mocks.chores = [];
  });

  // A chore whose people had all been removed from the family showed in no
  // column and not as open, so it couldn't be reassigned or deleted.
  it('lists a chore whose people were all removed as an open chore', () => {
    mocks.chores = [{ id: 'c1', name: 'Walk the dog', assigned_to: ['gone'], frequency: 'daily', value_cents: 0 }];
    render(<ChoresView />);

    expect(screen.getByRole('heading', { name: 'Open Chores' })).toBeInTheDocument();
    expect(screen.getByText('Walk the dog')).toBeInTheDocument();
  });
});
