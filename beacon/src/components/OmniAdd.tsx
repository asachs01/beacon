import { useState, useRef, useEffect, useCallback } from 'react';
import { CalendarPlus, ShoppingCart, CheckSquare, Timer } from 'lucide-react';
import { hapticTap } from '../hooks/useHaptics';

interface OmniAddProps {
  onAddEvent: () => void;
  onAddGroceryItem: () => void;
  onAddChore: () => void;
  onNavigateTimer: () => void;
  sidebarPosition?: 'left' | 'right' | 'bottom';
}

interface ActionDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  handler: () => void;
}

export function OmniAdd({
  onAddEvent,
  onAddGroceryItem,
  onAddChore,
  onNavigateTimer,
  sidebarPosition = 'left',
}: OmniAddProps) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const actions: ActionDef[] = [
    { id: 'timer', label: 'Timer', icon: <Timer size={22} />, handler: onNavigateTimer },
    { id: 'chore', label: 'Chore', icon: <CheckSquare size={22} />, handler: onAddChore },
    { id: 'grocery', label: 'Grocery', icon: <ShoppingCart size={22} />, handler: onAddGroceryItem },
    { id: 'event', label: 'Event', icon: <CalendarPlus size={22} />, handler: onAddEvent },
  ];

  const toggle = useCallback(() => {
    hapticTap();
    setExpanded(prev => !prev);
  }, []);

  const handleAction = useCallback((action: ActionDef) => {
    setExpanded(false);
    action.handler();
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!expanded) return;

    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };

    // Use a short delay so the opening click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [expanded]);

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [expanded]);

  return (
    <div
      ref={containerRef}
      className={`omni-add omni-add--sidebar-${sidebarPosition} ${expanded ? 'omni-add--expanded' : ''}`}
    >
      {/* Backdrop blur overlay */}
      {expanded && <div className="omni-add-backdrop" onClick={() => setExpanded(false)} />}

      {/* Action buttons (fan upward) */}
      <div className="omni-add-actions" aria-hidden={!expanded}>
        {actions.map((action, i) => (
          <button
            key={action.id}
            type="button"
            className="omni-add-action"
            style={{ '--omni-delay': `${i * 50}ms` } as React.CSSProperties}
            onClick={() => handleAction(action)}
            tabIndex={expanded ? 0 : -1}
            aria-label={action.label}
          >
            <span className="omni-add-action-icon">{action.icon}</span>
            <span className="omni-add-action-label">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Main FAB */}
      <button
        type="button"
        className="omni-add-fab"
        onClick={toggle}
        aria-label={expanded ? 'Close quick add' : 'Quick add'}
        aria-expanded={expanded}
      >
        <span className={`omni-add-fab-icon ${expanded ? 'omni-add-fab-icon--open' : ''}`}>+</span>
      </button>
    </div>
  );
}
