import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { DashboardCardProps } from '../../types/dashboard-cards';
import { AnyListClient } from '../../api/anylist';
import { callHaService } from '../../api/ha-rest';
import { useGrocery } from '../../hooks/useGrocery';
import { useTranslation } from '../../i18n';

interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
}

const fieldStyle = {
  flex: 1,
  padding: '6px 10px',
  fontSize: '0.85rem',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
} as const;

/** Sidebar "Shopping" section — configurable HA todo entity, plus Grocy when enabled. */
export function ShoppingCard({ config, context }: DashboardCardProps) {
  const { t } = useTranslation();
  const shoppingEntity = (config?.shoppingEntity as string) || '';
  const grocyOn = context.grocyEnabled === true;
  const grocy = useGrocery(grocyOn && context.connected === true, grocyOn);
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [grocyInput, setGrocyInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const grocyInputRef = useRef<HTMLInputElement>(null);
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

  const handleGrocyAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = grocyInput.trim();
    if (!trimmed || submitting || !grocyOn) return;
    setSubmitting(true);
    try {
      await grocy.addItem(trimmed);
      setGrocyInput('');
    } finally {
      setSubmitting(false);
      grocyInputRef.current?.focus();
    }
  }, [grocyInput, submitting, grocyOn, grocy]);

  const handleGrocyToggle = useCallback(async (id: string, checked: boolean) => {
    if (checked) await grocy.uncheckItem(id);
    else await grocy.checkItem(id);
  }, [grocy]);

  const uncheckedItems = items.filter(i => i.status === 'needs_action');
  const grocyUnchecked = grocyOn
    ? (grocy.list?.items ?? []).filter((item) => !item.checked)
    : [];

  if (!shoppingEntity && !grocyOn) {
    return (
      <section className="dash-sidebar-section">
        <h3 className="dash-sidebar-heading">{t('dashboard.shopping')}</h3>
        <div className="dash-sidebar-empty">
          {t('dashboard.shoppingNotConfigured')}
        </div>
      </section>
    );
  }

  return (
    <section className="dash-sidebar-section">
      <h3 className="dash-sidebar-heading">{t('dashboard.shopping')}</h3>

      {grocyOn && (
        <div data-grocy-list>
          <div className="dash-sidebar-heading">Grocy</div>
          <form className="dash-shopping-add" onSubmit={handleGrocyAdd} style={{ marginBottom: 12 }}>
            <input
              ref={grocyInputRef}
              type="text"
              className="dash-shopping-input"
              placeholder={t('dashboard.shoppingAddItemPlaceholder')}
              value={grocyInput}
              onChange={(e) => setGrocyInput(e.target.value)}
              disabled={submitting}
              aria-label="Add Grocy item"
              style={fieldStyle}
            />
            <button
              type="submit"
              className="dash-shopping-add-btn"
              disabled={!grocyInput.trim() || submitting}
              aria-label={t('dashboard.shoppingAddItem')}
              style={{
                padding: '6px 10px',
                border: 'none',
                borderRadius: 6,
                background: grocyInput.trim() ? 'var(--accent)' : 'var(--border)',
                color: 'white',
                cursor: grocyInput.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={16} />
            </button>
          </form>
          {grocyUnchecked.length === 0 ? (
            <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {t('dashboard.shoppingEmpty')}
            </div>
          ) : (
            <ul className="task-checklist">
              {grocyUnchecked.map((item) => (
                <li key={item.id} className="task-checklist-item">
                  <button
                    type="button"
                    className="task-checkbox"
                    onClick={() => handleGrocyToggle(item.id, item.checked)}
                    aria-label={t('dashboard.shoppingCheckItem', { name: item.name })}
                  >
                    <span className="task-checkbox-box" />
                  </button>
                  <span className="task-checklist-label">{item.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {shoppingEntity && (
        <>
          <form className="dash-shopping-add" onSubmit={handleAdd} style={{ marginBottom: 12 }}>
            <input
              ref={inputRef}
              type="text"
              className="dash-shopping-input"
              placeholder={t('dashboard.shoppingAddItemPlaceholder')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={submitting}
              style={fieldStyle}
            />
            <button
              type="submit"
              className="dash-shopping-add-btn"
              disabled={!inputValue.trim() || submitting}
              aria-label={t('dashboard.shoppingAddItem')}
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

          {loading && items.length === 0 ? (
            <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {t('dashboard.shoppingLoading')}
            </div>
          ) : uncheckedItems.length === 0 ? (
            <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {t('dashboard.shoppingEmpty')}
            </div>
          ) : (
            <ul className="task-checklist">
              {uncheckedItems.map((item) => (
                <li key={item.uid} className="task-checklist-item">
                  <button
                    type="button"
                    className="task-checkbox"
                    onClick={() => handleToggle(item)}
                    aria-label={t('dashboard.shoppingCheckItem', { name: item.summary })}
                  >
                    <span className="task-checkbox-box" />
                  </button>
                  <span className="task-checklist-label">{item.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
