import { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DashboardCard, DashboardCardContext } from '../../types/dashboard-cards';
import { cardRegistry } from './registry';

/** Pixels of drag (in whichever axis moves more) before the size steps up/down once. */
const RESIZE_STEP_PX = 60;

interface SortableCardItemProps {
  card: DashboardCard;
  context: DashboardCardContext;
  configurable: boolean;
  resizable: boolean;
  /** Class applied for the current card.size (min-height for list regions, grid-span for the main grid). */
  sizeClassName: string;
  onConfigure: () => void;
  onRemove: () => void;
  /** Called with +1 (grow) or -1 (shrink) as the handle is dragged past a size-step threshold. */
  onResize: (direction: 1 | -1) => void;
}

/** Drag handle + remove/configure/resize overlay wrapper shown while editing the dashboard. */
export function SortableCardItem({ card, context, configurable, resizable, sizeClassName, onConfigure, onRemove, onResize }: SortableCardItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const definition = cardRegistry[card.type];
  const dragState = useRef<{ startX: number; startY: number; stepsIssued: number } | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!definition) return null;
  const Component = definition.component;

  // Drag the handle right/down to grow, left/up to shrink — whichever axis moved further drives it,
  // so resizing works the same whether the card lives in a row-based grid or a vertical list.
  const handleResizePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, stepsIssued: 0 };
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const dominant = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    const targetSteps = Math.trunc(dominant / RESIZE_STEP_PX);
    while (drag.stepsIssued < targetSteps) {
      onResize(1);
      drag.stepsIssued++;
    }
    while (drag.stepsIssued > targetSteps) {
      onResize(-1);
      drag.stepsIssued--;
    }
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragState.current = null;
  };

  const handleResizeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') onResize(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') onResize(-1);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`dash-card-edit-wrapper ${resizable ? sizeClassName : ''} ${isDragging ? 'dash-card-edit-wrapper--dragging' : ''}`}
    >
      <div className="dash-card-edit-toolbar">
        <button type="button" className="dash-card-edit-btn dash-card-edit-drag" {...attributes} {...listeners} aria-label="Drag to reorder">
          ⠿
        </button>
        {resizable && (
          <button
            type="button"
            className="dash-card-edit-btn dash-card-edit-resize"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onKeyDown={handleResizeKeyDown}
            aria-label="Drag to resize (or use arrow keys)"
            title={`Size: ${card.size} — drag to resize`}
          >
            ⤡
          </button>
        )}
        {configurable && (
          <button type="button" className="dash-card-edit-btn" onClick={onConfigure} aria-label="Configure card">
            ⚙
          </button>
        )}
        <button type="button" className="dash-card-edit-btn dash-card-edit-remove" onClick={onRemove} aria-label="Remove card">
          ✕
        </button>
      </div>
      <div className="dash-card-edit-content">
        <Component config={card.config} context={context} />
      </div>
    </div>
  );
}
