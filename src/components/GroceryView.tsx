import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { GroceryList } from '../types/grocery';
import { AnyListClient } from '../api/anylist';
import { callHaService } from '../api/ha-rest';

interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
}

interface GroceryViewProps {
  defaultListId?: string;
}

export function GroceryView({ defaultListId }: GroceryViewProps) {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>(defaultListId || '');
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const anylistRef = useRef(new AnyListClient());

  // Discover all todo lists
  useEffect(() => {
    let cancelled = false;

    async function discover() {
      try {
        const foundLists = await anylistRef.current.getLists();
        if (cancelled) return;
        setLists(foundLists);

        // Pick default list
        if (foundLists.length > 0) {
          const defaultId = defaultListId && foundLists.some(l => l.id === defaultListId)
            ? defaultListId
            : foundLists[0].id;
          setSelectedListId(defaultId);
        }
      } catch (err) {
        console.warn('GroceryView: Failed to discover lists', err);
      }
    }

    discover();
    return () => { cancelled = true; };
  }, [defaultListId]);

  // Load items via todo.get_items service call with return_response
  const loadItems = useCallback(async (entityId: string) => {
    if (!entityId) return;
    setLoading(true);

    try {
      const result = await callHaService('todo', 'get_items', {
        entity_id: entityId,
      }, true) as {
        service_response?: Record<string, { items?: TodoItem[] }>;
      };

      const entityResponse = result?.service_response?.[entityId];
      setItems(entityResponse?.items ?? []);
    } catch (err) {
      console.warn('GroceryView: Failed to load items', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when selected list changes
  useEffect(() => {
    if (selectedListId) {
      loadItems(selectedListId);
    }
  }, [selectedListId, loadItems]);

  // Refresh every 30 seconds
  useEffect(() => {
    if (!selectedListId) return;
    const interval = setInterval(() => loadItems(selectedListId), 30_000);
    return () => clearInterval(interval);
  }, [selectedListId, loadItems]);

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
      await anylistRef.current.addItem(selectedListId, trimmed);
      setInputValue('');
      // Optimistic: add to local state
      setItems(prev => [...prev, { uid: `temp-${Date.now()}`, summary: trimmed, status: 'needs_action' }]);
      // Then refresh from server
      setTimeout(() => loadItems(selectedListId), 500);
    } catch (err) {
      console.warn('GroceryView: Failed to add item', err);
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }, [inputValue, submitting, selectedListId, loadItems]);

  // Toggle item
  const handleToggle = useCallback(async (item: TodoItem) => {
    const newStatus = item.status === 'needs_action' ? 'completed' : 'needs_action';

    // Optimistic update
    setItems(prev => prev.map(i =>
      i.uid === item.uid ? { ...i, status: newStatus } : i
    ));

    try {
      if (newStatus === 'completed') {
        await anylistRef.current.checkItem(selectedListId, item.summary);
      } else {
        await anylistRef.current.uncheckItem(selectedListId, item.summary);
      }
      // Refresh to get server state
      setTimeout(() => loadItems(selectedListId), 500);
    } catch (err) {
      console.warn('GroceryView: Failed to toggle item', err);
      // Revert
      setItems(prev => prev.map(i =>
        i.uid === item.uid ? { ...i, status: item.status } : i
      ));
    }
  }, [selectedListId, loadItems]);

  /** Public method: focus the input (called from OmniAdd) */
  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Expose focusInput on the DOM element for parent access
  const viewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (viewRef.current) {
      (viewRef.current as HTMLDivElement & { focusInput?: () => void }).focusInput = focusInput;
    }
  }, [focusInput]);

  return (
    <div ref={viewRef} className="grocery-view" data-grocery-view>
      {/* List selector */}
      <div className="grocery-view-header">
        <div className="grocery-view-selector">
          <select
            className="grocery-view-select"
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
          >
            {lists.map(list => (
              <option key={list.id} value={list.id}>{list.name}</option>
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
            <p>No items in this list</p>
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
                  <button
                    key={item.uid}
                    type="button"
                    className="grocery-view-item"
                    onClick={() => handleToggle(item)}
                  >
                    <span className="grocery-view-checkbox" />
                    <span className="grocery-view-item-name">{item.summary}</span>
                  </button>
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
                  <button
                    key={item.uid}
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
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
