import { useState, useCallback, useEffect } from 'react';

/**
 * Built-in local task/todo list backed by localStorage.
 * Works without any HA integration — install and go.
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

function loadLists(): LocalTaskList[] {
  try {
    const raw = localStorage.getItem(LISTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_LISTS;
}

function saveLists(lists: LocalTaskList[]): void {
  try {
    localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
  } catch { /* ignore */ }
}

function loadTasks(): LocalTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveTasks(tasks: LocalTask[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch { /* ignore */ }
}

export function useLocalTasks() {
  const [lists, setLists] = useState<LocalTaskList[]>(loadLists);
  const [tasks, setTasks] = useState<LocalTask[]>(loadTasks);

  // Persist on change
  useEffect(() => { saveLists(lists); }, [lists]);
  useEffect(() => { saveTasks(tasks); }, [tasks]);

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
