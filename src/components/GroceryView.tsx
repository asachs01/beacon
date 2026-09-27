import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { GroceryList } from '../types/grocery';
import { AnyListClient } from '../api/anylist';
import { hasToken } from '../api/ha-rest';
import { getTodoItems } from '../api/ha-services';
import { isGroceryListName } from '../utils/grocery';
import { useLocalTasks } from '../hooks/useLocalTasks';
import { refreshWhileAwake } from '../utils/display-sleep';

interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
}

/** Unified list entry (HA or local) */
interface UnifiedList {
  id: string;
  name: string;
  source: 'ha' | 'local';
}

export type ListViewMode = 'grocery' | 'tasks';

interface GroceryViewProps {
  defaultListId?: string;
  /** Which lists to show: 'grocery' for shopping lists, 'tasks' for everything else */
  mode?: ListViewMode;
  /** Explicit list of HA todo entity IDs that are grocery/shopping lists */
  groceryListIds?: string[];
  /** When true, excludes Beacon's built-in local list (beacon-shopping / beacon-todo) from selection */
  hideLocalList?: boolean;
  /** HA todo entity IDs never shown here (e.g. per-person chore sync lists) */
  hiddenListIds?: string[];
}

const NO_HIDDEN_LISTS: string[] = [];

export function GroceryView({ defaultListId, mode = 'grocery', groceryListIds = [], hideLocalList = false, hiddenListIds = NO_HIDDEN_LISTS }: GroceryViewProps) {
  const [haLists, setHaLists] = useState<GroceryList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>(defaultListId || '');
  const [haItems, setHaItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const anylistRef = useRef(new AnyListClient());

  const localTasks = useLocalTasks();

  // Merge HA lists + local lists, then filter by mode
  const allLists = useMemo<UnifiedList[]>(() => {
    const ha: UnifiedList[] = haLists
      .filter(l => !hiddenListIds.includes(l.id))
      .map(l => ({ id: l.id, name: l.name, source: 'ha' }));
    // When hideLocalList is set, drop every local-sourced list entirely —
    // including any custom ones the user may have created, not just the
    // built-in beacon-shopping / beacon-todo defaults.
    const local: UnifiedList[] = hideLocalList
      ? []
      : localTasks.lists.map(l => ({ id: l.id, name: l.name, source: 'local' }));
    const merged = [...local, ...ha];

    // Determine if an HA list is a grocery list:
    // - If groceryListIds is configured (non-empty), use it as source of truth
    // - Otherwise fall back to keyword classification (for backward compatibility / new installs)
    const isGroceryHA = (id: string, name: string): boolean => {
      if (groceryListIds.length > 0) {
        return groceryListIds.includes(id);
      }
      return isGroceryListName(name);
    };

    // Filter by mode: grocery lists vs task lists
    if (mode === 'grocery') {
      return merged.filter(l =>
        l.id === 'beacon-shopping' ||
        (defaultListId != null && defaultListId !== '' && l.id === defaultListId) ||
        (l.source === 'ha' && isGroceryHA(l.id, l.name))
      );
    }
    // tasks mode: local To-Do + all HA lists that aren't grocery
    return merged.filter(l =>
      l.id === 'beacon-todo' || (l.source === 'ha' && !isGroceryHA(l.id, l.name))
    );
  }, [haLists, localTasks.lists, mode, defaultListId, groceryListIds, hideLocalList, hiddenListIds]);

  const selectedList = allLists.find(l => l.id === selectedListId);
  const isLocal = selectedList?.source === 'local';
  // Only lists this screen offers — a list id left over from elsewhere isn't
  // an HA entity, and asking HA for its items fails.
  const haListId = selectedList?.source === 'ha' ? selectedList.id : '';

  // Items for current list
  const items = useMemo<TodoItem[]>(() => {
    if (isLocal) {
      return localTasks.getTasksForList(selectedListId).map(t => ({
        uid: t.id,
        summary: t.summary,
        status: t.status,
      }));
    }
    return haItems;
  }, [isLocal, selectedListId, localTasks, haItems]);

  // Discover HA todo lists (only if HA token is available)
  useEffect(() => {
    let cancelled = false;

    async function discover() {
      if (!hasToken()) {
        setLoading(false);
        return;
      }

      try {
        const foundLists = await anylistRef.current.getLists();
        if (cancelled) return;
        setHaLists(foundLists);
      } catch (err) {
        console.warn('GroceryView: Failed to discover HA lists', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    discover();
    return () => { cancelled = true; };
  }, []);

  // Auto-select first list when lists are available
  useEffect(() => {
    if (selectedListId && allLists.some(l => l.id === selectedListId)) return;
    if (defaultListId && allLists.some(l => l.id === defaultListId)) {
      setSelectedListId(defaultListId);
    } else if (allLists.length > 0) {
      setSelectedListId(allLists[0].id);
    }
  }, [allLists, selectedListId, defaultListId]);

  // The HA list showing, for loads that finish after another was picked.
  const showingListRef = useRef(haListId);
  showingListRef.current = haListId;

  // Load HA items via todo.get_items. Only the showing list's items are
  // shown: a slow load (a refresh, or the reload after a tick) for the list
  // left behind used to land after the new list's, showing its items under
  // the new list's name, where ticking one failed. A failed load leaves the
  // items as they were.
  const loadHaItems = useCallback(async (entityId: string) => {
    if (!entityId) return;
    setLoading(true);

    try {
      const items = (await getTodoItems(entityId)) ?? [];
      if (entityId === showingListRef.current) setHaItems(items);
    } catch (err) {
      console.warn('GroceryView: Failed to load items', err);
    } finally {
      if (entityId === showingListRef.current) setLoading(false);
    }
  }, []);

  // Reload when selected list changes (HA lists only), dropping the last
  // list's items at once rather than showing them until the new ones load.
  useEffect(() => {
    setHaItems([]);
    if (!haListId) {
      setLoading(false);
      return;
    }
    loadHaItems(haListId);
  }, [haListId, loadHaItems]);

  // Refresh HA lists every 30 seconds (not while hidden or under the
  // screensaver)
  useEffect(() => {
    if (!haListId) return;
    return refreshWhileAwake(() => loadHaItems(haListId), 30_000);
  }, [haListId, loadHaItems]);

  // Split items
  const uncheckedItems = useMemo(
    () => items.filter(i => i.status === 'needs_action'),
    [items],
  );
  const checkedItems = useMemo(
    () => items.filter(i => i.status === 'completed'),
    [items],
  );

  // Add item
  const handleAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || submitting || !selectedListId) return;

    setSubmitting(true);
    try {
      if (isLocal) {
        localTasks.addTask(selectedListId, trimmed);
      } else {
        await anylistRef.current.addItem(selectedListId, trimmed);
        setHaItems(prev => [...prev, { uid: `temp-${Date.now()}`, summary: trimmed, status: 'needs_action' }]);
        setTimeout(() => loadHaItems(selectedListId), 500);
      }
      setInputValue('');
    } catch (err) {
      console.warn('GroceryView: Failed to add item', err);
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }, [inputValue, submitting, selectedListId, isLocal, localTasks, loadHaItems]);

  // Toggle item
  const handleToggle = useCallback(async (item: TodoItem) => {
    if (isLocal) {
      localTasks.toggleTask(item.uid);
      return;
    }

    const newStatus = item.status === 'needs_action' ? 'completed' : 'needs_action';
    setHaItems(prev => prev.map(i =>
      i.uid === item.uid ? { ...i, status: newStatus } : i
    ));

    try {
      if (newStatus === 'completed') {
        await anylistRef.current.checkItem(selectedListId, item);
      } else {
        await anylistRef.current.uncheckItem(selectedListId, item);
      }
      setTimeout(() => loadHaItems(selectedListId), 500);
    } catch (err) {
      console.warn('GroceryView: Failed to toggle item', err);
      setHaItems(prev => prev.map(i =>
        i.uid === item.uid ? { ...i, status: item.status } : i
      ));
    }
  }, [isLocal, selectedListId, localTasks, loadHaItems]);

  // Delete local item (long-press or swipe equivalent)
  const handleDelete = useCallback((item: TodoItem) => {
    if (isLocal) {
      localTasks.removeTask(item.uid);
    }
  }, [isLocal, localTasks]);

  return (
    <div className="grocery-view" data-grocery-view>
      {/* List selector */}
      <div className="grocery-view-header">
        <div className="grocery-view-selector">
          <select
            className="grocery-view-select"
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
          >
            {allLists.length === 0 && (
              <option value="">No lists available</option>
            )}
            {allLists.map(list => (
              <option key={list.id} value={list.id}>
                {list.name}{list.source === 'ha' ? ' (HA)' : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="grocery-view-select-icon" />
        </div>
      </div>

      {/* Quick-add input */}
      <form className="grocery-view-add" onSubmit={handleAdd}>
        <input
          ref={inputRef}
          type="text"
          className="grocery-view-input"
          placeholder="Add an item..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={submitting || !selectedListId}
        />
        <button
          type="submit"
          className="grocery-view-add-btn"
          disabled={!inputValue.trim() || submitting}
          aria-label="Add item"
        >
          <Plus size={20} />
        </button>
      </form>

      {/* Items list */}
      <div className="grocery-view-list">
        {loading && items.length === 0 ? (
          <div className="grocery-view-loading">Loading items...</div>
        ) : items.length === 0 && !loading ? (
          <div className="grocery-view-empty">
            <div className="grocery-view-empty-icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <rect x="12" y="16" width="40" height="40" rx="8" stroke="var(--border)" strokeWidth="2" fill="none" />
                <path d="M24 32h16M24 40h10" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="20" cy="32" r="2" fill="var(--border)" />
                <circle cx="20" cy="40" r="2" fill="var(--border)" />
              </svg>
            </div>
            <p>No items yet — add one above</p>
          </div>
        ) : (
          <>
            {/* Unchecked items */}
            {uncheckedItems.length > 0 && (
              <div className="grocery-view-section">
                <div className="grocery-view-section-header">
                  Items ({uncheckedItems.length})
                </div>
                {uncheckedItems.map(item => (
                  <div key={item.uid} className="grocery-view-item-row">
                    <button
                      type="button"
                      className="grocery-view-item"
                      onClick={() => handleToggle(item)}
                    >
                      <span className="grocery-view-checkbox" />
                      <span className="grocery-view-item-name">{item.summary}</span>
                    </button>
                    {isLocal && (
                      <button
                        type="button"
                        className="grocery-view-delete"
                        onClick={() => handleDelete(item)}
                        aria-label="Delete item"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Completed items */}
            {checkedItems.length > 0 && (
              <div className="grocery-view-section">
                <button
                  type="button"
                  className="grocery-view-section-header grocery-view-section-header--toggle"
                  onClick={() => setCompletedCollapsed(prev => !prev)}
                >
                  {completedCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  Completed ({checkedItems.length})
                </button>
                {!completedCollapsed && checkedItems.map(item => (
                  <div key={item.uid} className="grocery-view-item-row">
                    <button
                      type="button"
                      className="grocery-view-item grocery-view-item--checked"
                      onClick={() => handleToggle(item)}
                    >
                      <span className="grocery-view-checkbox grocery-view-checkbox--checked">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path
                            d="M2.5 7L5.5 10L11.5 4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="grocery-view-item-name">{item.summary}</span>
                    </button>
                    {isLocal && (
                      <button
                        type="button"
                        className="grocery-view-delete"
                        onClick={() => handleDelete(item)}
                        aria-label="Delete item"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
