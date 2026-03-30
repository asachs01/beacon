import { useState, useEffect, useCallback } from 'react';
import { hasToken, callHaService, haFetch } from '../api/ha-rest';
import { useLocalTasks } from './useLocalTasks';

export interface DashboardTodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
  listId: string;
}

/**
 * Fetches todo items for the dashboard Tasks section.
 * Combines local To-Do items with items from the first HA task-type list.
 */
export function useDashboardTasks(connected: boolean) {
  const localTasks = useLocalTasks();
  const [haItems, setHaItems] = useState<DashboardTodoItem[]>([]);

  // Fetch HA todo items for task-type lists
  useEffect(() => {
    if (!connected && !hasToken()) return;

    async function fetchTasks() {
      try {
        // Get the first non-grocery HA todo entity
        const states = await haFetch('/api/states') as Array<{ entity_id: string; state: string; attributes: Record<string, unknown> }>;

        const todoEntities = states.filter(s =>
          s.entity_id.startsWith('todo.') &&
          s.state !== 'unavailable' &&
          !isGroceryEntity(s.attributes.friendly_name as string || s.entity_id)
        );

        // Fetch items from up to 3 task lists
        const items: DashboardTodoItem[] = [];
        for (const entity of todoEntities.slice(0, 3)) {
          try {
            const result = await callHaService('todo', 'get_items', {
              entity_id: entity.entity_id,
            }, true) as {
              service_response?: Record<string, { items?: Array<{ uid: string; summary: string; status: string }> }>;
            };
            const entityItems = result?.service_response?.[entity.entity_id]?.items ?? [];
            for (const item of entityItems) {
              items.push({
                uid: item.uid,
                summary: item.summary,
                status: item.status as 'needs_action' | 'completed',
                listId: entity.entity_id,
              });
            }
          } catch { /* skip failed lists */ }
        }
        setHaItems(items);
      } catch (err) {
        console.warn('Failed to fetch dashboard tasks:', err);
      }
    }

    fetchTasks();
    const interval = setInterval(fetchTasks, 60_000);
    return () => clearInterval(interval);
  }, [connected]);

  // Combine local To-Do items + HA task items
  const localItems: DashboardTodoItem[] = localTasks
    .getTasksForList('beacon-todo')
    .map(t => ({
      uid: t.id,
      summary: t.summary,
      status: t.status,
      listId: 'beacon-todo',
    }));

  const allItems = [...localItems, ...haItems];

  const toggleItem = useCallback(async (uid: string, currentStatus: string) => {
    // Check if it's a local item
    const localItem = localTasks.getTasksForList('beacon-todo').find(t => t.id === uid);
    if (localItem) {
      localTasks.toggleTask(uid);
      return;
    }

    // HA item — find the list and toggle
    const haItem = haItems.find(i => i.uid === uid);
    if (!haItem) return;
    const newStatus = currentStatus === 'needs_action' ? 'completed' : 'needs_action';
    try {
      await callHaService('todo', 'update_item', {
        entity_id: haItem.listId,
        item: haItem.summary,
        status: newStatus,
      });
      setHaItems(prev => prev.map(i =>
        i.uid === uid ? { ...i, status: newStatus as 'needs_action' | 'completed' } : i
      ));
    } catch (err) {
      console.warn('Failed to toggle todo item:', err);
    }
  }, [localTasks, haItems]);

  return { items: allItems, toggleItem };
}

const GROCERY_KEYWORDS = [
  'grocer', 'shopping', 'costco', 'walmart', 'target', 'store',
  'pantry', 'fridge', 'freezer', 'inventory', 'meal',
];

function isGroceryEntity(name: string): boolean {
  const lower = name.toLowerCase();
  return GROCERY_KEYWORDS.some(kw => lower.includes(kw));
}
