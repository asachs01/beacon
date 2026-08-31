import { useState, useEffect, useCallback, useMemo } from 'react';
import { hasToken, haFetch, callHaService } from '../api/ha-rest';
import { useLocalTasks } from './useLocalTasks';
import { useTaskmate } from './useTaskmate';

export interface DashboardTodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
  listId: string;
  userId?: string;
}

export function useDashboardTasks(connected: boolean) {
  const localTasks = useLocalTasks();
  const { users, listByUser, completions } = useTaskmate(connected);
  const [haItems, setHaItems] = useState<Omit<DashboardTodoItem, 'userId'>[]>([]);

  // Fetch HA todo items for task-type lists
  useEffect(() => {
    if (!connected && !hasToken()) return;

    async function fetchTasks() {
      try {
        // Get the non-grocery HA todo entities
        const states = await haFetch('/api/states') as Array<{ entity_id: string; state: string; attributes: Record<string, unknown> }>;

        const todoEntities = states.filter(s =>
          s.entity_id.startsWith('todo.') &&
          s.state !== 'unavailable' &&
          !isGroceryEntity(s.attributes.friendly_name as string || s.entity_id)
        );

        // Fetch items from up to 3 task lists
        const items: Omit<DashboardTodoItem, 'userId'>[] = [];
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

  const items: DashboardTodoItem[] = useMemo(() => {
    const local: DashboardTodoItem[] = localTasks
      .getTasksForList('beacon-todo')
      .filter(t => t.status === 'needs_action' || (t.completedAt ? isToday(t.completedAt) : false))
      .map(t => ({
        uid: t.id,
        summary: t.summary,
        status: t.status,
        listId: 'beacon-todo',
      }));

    const fromHa: DashboardTodoItem[] = [];
    for (const i of haItems) {
      const userId = listByUser[i.listId]?.childId;
      if (i.status === 'needs_action' || userId != null) {
        fromHa.push({ ...i, userId });
      }
    }

    const done: DashboardTodoItem[] = completions.map(c => ({
      uid: c.uid,
      summary: c.summary,
      status: 'completed' as const,
      listId: '',
      userId: c.userId,
    }));

    const seen = new Set<string>();
    return [...local, ...fromHa, ...done].filter(it => {
      const key = `${it.userId ?? ''}:${it.uid}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [localTasks, haItems, listByUser, completions]);

  const toggleItem = useCallback(async (uid: string, currentStatus: string, listId?: string) => {
    // Check if it's a local item
    const localItem = localTasks.getTasksForList('beacon-todo').find(t => t.id === uid);
    if (localItem) {
      localTasks.toggleTask(uid);
      return;
    }

    const haItem = haItems.find(i => i.uid === uid && (listId == null || i.listId === listId))
      ?? haItems.find(i => i.uid === uid);
    if (!haItem) return;
    const newStatus = currentStatus === 'needs_action' ? 'completed' : 'needs_action';
    try {
      await callHaService('todo', 'update_item', {
        entity_id: haItem.listId,
        item: haItem.summary,
        status: newStatus,
      });
      setHaItems(prev => prev.map(i =>
        i.uid === uid && i.listId === haItem.listId
          ? { ...i, status: newStatus as 'needs_action' | 'completed' }
          : i
      ));
    } catch (err) {
      console.warn('Failed to toggle todo item:', err);
    }
  }, [localTasks, haItems]);

  return { items, toggleItem, users };
}

const GROCERY_KEYWORDS = [
  'grocer', 'shopping', 'costco', 'walmart', 'target', 'store',
  'pantry', 'fridge', 'freezer', 'inventory', 'meal',
];

function isGroceryEntity(name: string): boolean {
  const lower = name.toLowerCase();
  return GROCERY_KEYWORDS.some(kw => lower.includes(kw));
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
