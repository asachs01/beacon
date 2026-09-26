import { useState, useEffect, useCallback, useMemo } from 'react';
import { hasToken, callHaService, fetchAllStates, ENTITY_LIST_MAX_AGE_MS } from '../api/ha-rest';
import { getTodoItems } from '../api/ha-services';
import { isGroceryListName } from '../utils/grocery';
import { localDayKey } from '../api/date-keys';
import { useLocalTasks } from './useLocalTasks';
import { useTaskmate } from './useTaskmate';
import { refreshWhileAwake } from '../utils/display-sleep';
import { todoItemRef } from '../api/anylist';

export interface DashboardTodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
  listId: string;
  userId?: string;
}

const NO_HIDDEN_LISTS: string[] = [];

export function useDashboardTasks(
  connected: boolean,
  groceryListIds: string[] = [],
  hideLocalTasks: boolean = false,
  /** HA todo entity IDs never shown on the dashboard (e.g. per-person chore sync lists) */
  hiddenListIds: string[] = NO_HIDDEN_LISTS,
  /** false stops the minute-by-minute refresh; turning it back on fetches at once */
  enabled = true,
) {
  const localTasks = useLocalTasks();
  const { users, listByUser, completions } = useTaskmate(connected, enabled);
  const [haItems, setHaItems] = useState<Omit<DashboardTodoItem, 'userId'>[]>([]);

  // Fetch HA todo items for task-type lists
  useEffect(() => {
    if (!enabled || (!connected && !hasToken())) return;

    async function fetchTasks() {
      try {
        // Get the non-grocery HA todo entities (their items are fetched fresh below)
        const states = await fetchAllStates(ENTITY_LIST_MAX_AGE_MS);

        const todoEntities = states.filter(s => {
          if (!s.entity_id.startsWith('todo.') || s.state === 'unavailable') return false;
          if (hiddenListIds.includes(s.entity_id)) return false;
          const name = s.attributes.friendly_name as string || s.entity_id;
          // Use groceryListIds if configured, otherwise fall back to keyword classification
          if (groceryListIds.length > 0) {
            return !groceryListIds.includes(s.entity_id);
          }
          return !isGroceryListName(name);
        });

        // Fetch items from up to 3 task lists, at the same time
        const lists = await Promise.all(todoEntities.slice(0, 3).map(async (entity) => {
          try {
            return ((await getTodoItems(entity.entity_id)) ?? []).map(item => ({
              uid: item.uid,
              summary: item.summary,
              status: item.status,
              listId: entity.entity_id,
            }));
          } catch {
            return []; // skip failed lists
          }
        }));
        setHaItems(lists.flat());
      } catch (err) {
        console.warn('Failed to fetch dashboard tasks:', err);
      }
    }

    fetchTasks();
    return refreshWhileAwake(fetchTasks, 60_000);
  }, [connected, groceryListIds, hiddenListIds, enabled]);

  const items: DashboardTodoItem[] = useMemo(() => {
    const local: DashboardTodoItem[] = hideLocalTasks
      ? []
      : localTasks
        .getTasksForList('beacon-todo')
        .filter(t => t.status === 'needs_action' || (t.completedAt ? localDayKey(t.completedAt) === localDayKey() : false))
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
  }, [localTasks, haItems, listByUser, completions, hideLocalTasks]);

  const toggleItem = useCallback(async (uid: string, currentStatus: string, listId?: string) => {
    // Check if it's a local item
    const localItem = hideLocalTasks ? undefined : localTasks.getTasksForList('beacon-todo').find(t => t.id === uid);
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
        item: todoItemRef(haItem),
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
  }, [localTasks, haItems, hideLocalTasks]);

  return { items, toggleItem, users };
}
