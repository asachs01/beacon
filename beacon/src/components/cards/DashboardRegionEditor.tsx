import { useState } from 'react';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CardSize, DashboardCard, DashboardCardContext, DashboardRegion } from '../../types/dashboard-cards';
import { cardRegistry } from './registry';
import { SortableCardItem } from './SortableCardItem';
import { CardPickerModal } from './CardPickerModal';
import { CardConfigModal } from './CardConfigModal';

const SIZE_CYCLE: CardSize[] = ['sm', 'md', 'lg'];

interface DashboardRegionEditorProps {
  region: DashboardRegion;
  cards: DashboardCard[];
  context: DashboardCardContext;
  onChange: (cards: DashboardCard[]) => void;
  /** Whether cards in this region can be resized (has a visible effect in the final, non-edit view). */
  resizable?: boolean;
}

/** Renders a region's cards as a reorderable/removable/addable vertical drag list while editing (topbar/sidebar, and classic layout's main). */
export function DashboardRegionEditor({ region, cards, context, onChange, resizable = true }: DashboardRegionEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [configuringId, setConfiguringId] = useState<string | null>(null);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = cards.findIndex((c) => c.id === active.id);
    const newIndex = cards.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(cards, oldIndex, newIndex));
  };

  const handleAdd = (type: string) => {
    const definition = cardRegistry[type];
    if (!definition) return;
    const newCard: DashboardCard = {
      id: `${type}-${Date.now()}`,
      type,
      size: definition.defaultSize,
      config: { ...definition.defaultConfig },
    };
    onChange([...cards, newCard]);
    setPickerOpen(false);
  };

  const handleRemove = (id: string) => {
    onChange(cards.filter((c) => c.id !== id));
  };

  const handleResize = (id: string, direction: 1 | -1) => {
    onChange(cards.map((c) => {
      if (c.id !== id) return c;
      const nextIndex = Math.min(SIZE_CYCLE.length - 1, Math.max(0, SIZE_CYCLE.indexOf(c.size) + direction));
      return { ...c, size: SIZE_CYCLE[nextIndex] };
    }));
  };

  const handleConfigSave = (id: string, config: Record<string, unknown>) => {
    onChange(cards.map((c) => (c.id === id ? { ...c, config } : c)));
    setConfiguringId(null);
  };

  const configuringCard = cards.find((c) => c.id === configuringId) ?? null;

  return (
    <div className={`dash-region-editor dash-region-editor--${region}`}>
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCardItem
              key={card.id}
              card={card}
              context={context}
              configurable={card.type.startsWith('ha-')}
              resizable={resizable}
              sizeClassName={`dash-card--${card.size}`}
              onConfigure={() => setConfiguringId(card.id)}
              onRemove={() => handleRemove(card.id)}
              onResize={(direction) => handleResize(card.id, direction)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button type="button" className="dash-card-add-float" onClick={() => setPickerOpen(true)}>
        + Add Card
      </button>
      {pickerOpen && (
        <CardPickerModal region={region} onPick={handleAdd} onClose={() => setPickerOpen(false)} />
      )}
      {configuringCard && (
        <CardConfigModal
          card={configuringCard}
          onSave={(config) => handleConfigSave(configuringCard.id, config)}
          onClose={() => setConfiguringId(null)}
        />
      )}
    </div>
  );
}
