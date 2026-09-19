import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { DashboardCardProps } from '../../types/dashboard-cards';
import { AnyListClient } from '../../api/anylist';
import { callHaService } from '../../api/ha-rest';

interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
}

/** Sidebar "Shopping" section — configurable HA todo entity for shopping lists. */
export function ShoppingCard({ config }: DashboardCardProps) {
  const shoppingEntity = (config?.shoppingEntity as string) || '';
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const anylistRef = useRef(new AnyListClient());

  // Load items from HA entity
  const loadItems = useCallback(async () => {
    if (!shoppingEntity) return;
    setLoading(true);

    try {
      const result = await callHaService('todo', 'get_items', {
        entity_id: shoppingEntity,
      }, true) as {
        service_response?: Record<string, { items?: TodoItem[] }>;
      };

      const entityResponse = result?.service_response?.[shoppingEntity];
      setItems(entityResponse?.items ?? []);
    } catch (err) {
      console.warn('ShoppingCard: Failed to load items', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [shoppingEntity]);

  // Load on mount and when entity changes
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Refresh every 30 seconds
  useEffect(() => {
    if (!shoppingEntity) return;
    const interval = setInterval(loadItems, 30_000);
    return () => clearInterval(interval);
  }, [shoppingEntity, loadItems]);

  // Add item
  const handleAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || submitting || !shoppingEntity) return;

    setSubmitting(true);
    try {
      await anylistRef.current.addItem(shoppingEntity, trimmed);
      setItems(prev => [...prev, { uid: `temp-${Date.now()}`, summary: trimmed, status: 'needs_action' }]);
      setTimeout(loadItems, 500);
      setInputValue('');
    } catch (err) {
      console.warn('ShoppingCard: Failed to add item', err);
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }, [inputValue, submitting, shoppingEntity, loadItems]);

  // Toggle item (check/uncheck)
  const handleToggle = useCallback(async (item: TodoItem) => {
    const newStatus = item.status === 'needs_action' ? 'completed' : 'needs_action';
    setItems(prev => prev.map(i =>
      i.uid === item.uid ? { ...i, status: newStatus } : i
    ));

    try {
      if (newStatus === 'completed') {
        await anylistRef.current.checkItem(shoppingEntity, item.summary);
      } else {
        await anylistRef.current.uncheckItem(shoppingEntity, item.summary);
      }
      setTimeout(loadItems, 500);
    } catch (err) {
      console.warn('ShoppingCard: Failed to toggle item', err);
      setItems(prev => prev.map(i =>
        i.uid === item.uid ? { ...i, status: item.status } : i
      ));
    }
  }, [shoppingEntity, loadItems]);

  const uncheckedItems = items.filter(i => i.status === 'needs_action');

  if (!shoppingEntity) {
    return (
      <section className="dash-sidebar-section">
        <h3 className="dash-sidebar-heading">Shopping</h3>
        <div className="dash-sidebar-empty">
          Configure a shopping list in Settings → Integrations
        </div>
      </section>
    );
  }

  return (
    <section className="dash-sidebar-section">
      <h3 className="dash-sidebar-heading">Shopping</h3>

      {/* Quick-add input */}
      <form className="dash-shopping-add" onSubmit={handleAdd} style={{ marginBottom: 12 }}>
        <input
          ref={inputRef}
          type="text"
          className="dash-shopping-input"
          placeholder="Add item..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={submitting}
          style={{
            flex: 1,
            padding: '6px 10px',
            fontSize: '0.85rem',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          type="submit"
          className="dash-shopping-add-btn"
          disabled={!inputValue.trim() || submitting}
          aria-label="Add item"
          style={{
            padding: '6px 10px',
            border: 'none',
            borderRadius: 6,
            background: inputValue.trim() ? 'var(--accent)' : 'var(--border)',
            color: 'white',
            cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={16} />
        </button>
      </form>

      {/* Items list */}
      {loading && items.length === 0 ? (
        <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Loading items...
        </div>
      ) : uncheckedItems.length === 0 ? (
        <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No items yet — add one above
        </div>
      ) : (
        <ul className="task-checklist">
          {uncheckedItems.map((item) => (
            <li key={item.uid} className="task-checklist-item">
              <button
                type="button"
                className="task-checkbox"
                onClick={() => handleToggle(item)}
                aria-label={`Check ${item.summary}`}
              >
                <span className="task-checkbox-box" />
              </button>
              <span className="task-checklist-label">{item.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
