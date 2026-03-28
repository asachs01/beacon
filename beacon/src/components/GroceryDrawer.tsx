import { useState, useRef, useCallback, useEffect } from 'react';
import { GroceryItem, GroceryList } from '../types/grocery';
import { GrocerySource } from '../hooks/useGrocery';

interface GroceryDrawerProps {
  list: GroceryList | null;
  source: GrocerySource;
  loading: boolean;
  expiringItems: GroceryItem[];
  onAddItem: (name: string) => Promise<void>;
  onCheckItem: (id: string) => Promise<void>;
  onUncheckItem: (id: string) => Promise<void>;
  forceOpen?: boolean;
}

export function GroceryDrawer({
  list,
  source,
  loading,
  expiringItems,
  onAddItem,
  onCheckItem,
  onUncheckItem,
  forceOpen = false,
}: GroceryDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = expanded || forceOpen;
  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  const uncheckedCount = list?.items.filter(i => !i.checked).length ?? 0;

  const toggle = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  // Focus input when drawer expands
  useEffect(() => {
    if (expanded && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 320);
    }
  }, [expanded]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      await onAddItem(trimmed);
      setInputValue('');
    } finally {
      setSubmitting(false);
    }
  }, [inputValue, submitting, onAddItem]);

  const handleToggleItem = useCallback((item: GroceryItem) => {
    if (item.checked) {
      onUncheckItem(item.id);
    } else {
      onCheckItem(item.id);
    }
  }, [onCheckItem, onUncheckItem]);

  // Touch drag to expand/collapse
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const deltaY = e.changedTouches[0].clientY - dragStartY.current;
    dragStartY.current = null;

    if (Math.abs(deltaY) < 30) return;

    if (deltaY < 0 && !expanded) {
      setExpanded(true);
    } else if (deltaY > 0 && expanded) {
      setExpanded(false);
    }
  }, [expanded]);

  return (
    <div
      ref={drawerRef}
      className={`grocery-drawer ${isOpen ? 'grocery-drawer--expanded' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Handle / tab */}
      <button
        type="button"
        className="grocery-drawer-handle"
        onClick={toggle}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse grocery list' : 'Expand grocery list'}
      >
        <div className="grocery-drawer-handle-bar" />
        <div className="grocery-drawer-handle-label">
          <span className="grocery-drawer-handle-icon">
            {/* Simple cart icon using CSS */}
          </span>
          <span>Grocery</span>
          {uncheckedCount > 0 && (
            <span className="grocery-drawer-badge">{uncheckedCount}</span>
          )}
          {source !== 'none' && (
            <span className="grocery-drawer-source">
              via {source === 'grocy' ? 'Grocy' : 'AnyList'}
            </span>
          )}
        </div>
      </button>

      {/* Drawer content */}
      <div className="grocery-drawer-content">
        {source === 'none' ? (
          <div className="grocery-drawer-empty">
            <p>Connect Grocy or AnyList in Home Assistant to see your lists</p>
          </div>
        ) : (
          <>
            {/* Quick-add input */}
            <form className="grocery-drawer-add" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="text"
                className="grocery-drawer-input"
                placeholder="Add an item..."
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                disabled={submitting}
              />
              <button
                type="submit"
                className="grocery-drawer-add-btn"
                disabled={!inputValue.trim() || submitting}
              >
                Add
              </button>
            </form>

            {/* Expiring items alert */}
            {expiringItems.length > 0 && (
              <div className="grocery-drawer-alert">
                <span className="grocery-drawer-alert-icon">!</span>
                <span>
                  {expiringItems.length} item{expiringItems.length !== 1 ? 's' : ''} expiring soon:{' '}
                  {expiringItems.slice(0, 3).map(i => i.name).join(', ')}
                  {expiringItems.length > 3 ? '...' : ''}
                </span>
              </div>
            )}

            {/* Shopping list */}
            {loading && !list ? (
              <div className="grocery-drawer-loading">Loading...</div>
            ) : (
              <div className="grocery-drawer-list">
                {list?.items
                  .slice()
                  .sort((a, b) => {
                    // unchecked first, then alphabetical
                    if (a.checked !== b.checked) return a.checked ? 1 : -1;
                    return a.name.localeCompare(b.name);
                  })
                  .map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`grocery-item ${item.checked ? 'grocery-item--checked' : ''}`}
                      onClick={() => handleToggleItem(item)}
                    >
                      <span className="grocery-item-checkbox">
                        {item.checked && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path
                              d="M2.5 7L5.5 10L11.5 4"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="grocery-item-name">{item.name}</span>
                      {item.quantity && (
                        <span className="grocery-item-qty">{item.quantity}</span>
                      )}
                      {item.category && (
                        <span className="grocery-item-category">{item.category}</span>
                      )}
                    </button>
                  ))}
                {list?.items.length === 0 && (
                  <div className="grocery-drawer-empty">
                    <p>Your list is empty</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
