import { loadData, saveData } from './beacon-store';
import { AnyListClient } from './anylist';

/**
 * Append ingredients using the grocery list's existing write path.
 * Home Assistant todo entities go through AnyListClient.addItem (todo.add_item).
 * The built-in Shopping List goes through the local task store GroceryView writes.
 * Grocy is intentionally not used.
 */

const TASKS_KEY = 'beacon-local-tasks';

interface LocalTask {
  id: string;
  summary: string;
  status: 'needs_action' | 'completed';
  listId: string;
  createdAt: string;
}

export async function addIngredientsToGroceryList(
  ingredients: string[],
  listId = 'beacon-shopping',
): Promise<number> {
  const names = ingredients.map((item) => item.trim()).filter(Boolean);
  if (names.length === 0) return 0;

  if (listId.startsWith('todo.')) {
    const client = new AnyListClient();
    for (const name of names) {
      await client.addItem(listId, name);
    }
    return names.length;
  }

  const existing = await loadData<unknown>(TASKS_KEY, []);
  const tasks = Array.isArray(existing) ? existing as LocalTask[] : [];
  const now = Date.now();
  const additions: LocalTask[] = names.map((summary, index) => ({
    id: `local-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    summary,
    status: 'needs_action',
    listId,
    createdAt: new Date().toISOString(),
  }));
  await saveData(TASKS_KEY, [...tasks, ...additions]);
  return names.length;
}
