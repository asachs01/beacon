import { describe, expect, it } from 'vitest';
import { addIngredientsToGroceryList } from './grocery-write';

describe('addIngredientsToGroceryList', () => {
  it('appends ingredients to the built-in shopping list', async () => {
    localStorage.setItem('beacon-local-tasks', JSON.stringify([
      { id: 'local-1', summary: 'Milk', status: 'needs_action', listId: 'beacon-shopping', createdAt: '2026-11-20T00:00:00.000Z' },
    ]));

    const added = await addIngredientsToGroceryList([' pasta ', '', 'cheese'], 'beacon-shopping');

    expect(added).toBe(2);
    const tasks = JSON.parse(localStorage.getItem('beacon-local-tasks') ?? '[]') as Array<{ summary: string; listId: string; status: string }>;
    expect(tasks.map((task) => task.summary)).toEqual(['Milk', 'pasta', 'cheese']);
    expect(tasks.slice(1).every((task) => task.listId === 'beacon-shopping' && task.status === 'needs_action')).toBe(true);
  });
});
