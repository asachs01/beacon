import { useState, useCallback, useEffect } from 'react';
import { loadData, loadDataSync, saveData } from '../api/beacon-store';

/**
 * Built-in local task/todo list synced via beacon-store.
 * Server is source of truth in add-on mode; localStorage is offline cache.
 */

export interface LocalTask {
  id: string;
  summary: string;
  status: 'needs_action' | 'completed';
  listId: string;
  createdAt: string;
}

export interface LocalTaskList {
  id: string;
  name: string;
}

const STORAGE_KEY = 'beacon-local-tasks';
const LISTS_KEY = 'beacon-local-task-lists';

// Default built-in lists
const DEFAULT_LISTS: LocalTaskList[] = [
  { id: 'beacon-todo', name: 'To-Do' },
  { id: 'beacon-shopping', name: 'Shopping List' },
];

export function useLocalTasks() {
  // Initialize with localStorage data immediately
  const [lists, setLists] = useState<LocalTaskList[]>(() =>
    loadDataSync<LocalTaskList[]>(LISTS_KEY, DEFAULT_LISTS)
  );
  const [tasks, setTasks] = useState<LocalTask[]>(() =>
    loadDataSync<LocalTask[]>(STORAGE_KEY, [])
  );

  // Fetch from server on mount
  useEffect(() => {
    loadData<LocalTaskList[]>(LISTS_KEY, DEFAULT_LISTS).then(setLists);
    loadData<LocalTask[]>(STORAGE_KEY, []).then(setTasks);
  }, []);

  // Persist on change
  useEffect(() => { saveData(LISTS_KEY, lists); }, [lists]);
  useEffect(() => { saveData(STORAGE_KEY, tasks); }, [tasks]);

  const getTasksForList = useCallback((listId: string) => {
    return tasks.filter(t => t.listId === listId);
  }, [tasks]);

  const addTask = useCallback((listId: string, summary: string) => {
    const task: LocalTask = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      summary,
      status: 'needs_action',
      listId,
      createdAt: new Date().toISOString(),
    };
    setTasks(prev => [...prev, task]);
    return task;
  }, []);

  const toggleTask = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: t.status === 'needs_action' ? 'completed' : 'needs_action' }
        : t
    ));
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  const addList = useCallback((name: string) => {
    const list: LocalTaskList = {
      id: `beacon-${Date.now()}`,
      name,
    };
    setLists(prev => [...prev, list]);
    return list;
  }, []);

  const removeList = useCallback((listId: string) => {
    setLists(prev => prev.filter(l => l.id !== listId));
    setTasks(prev => prev.filter(t => t.listId !== listId));
  }, []);

  return {
    lists,
    tasks,
    getTasksForList,
    addTask,
    toggleTask,
    removeTask,
    addList,
    removeList,
  };
}
