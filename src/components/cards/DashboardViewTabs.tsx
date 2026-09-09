import { useState } from 'react';
import { DashboardLayoutView } from '../../types/dashboard-cards';
import { ViewNameModal } from './ViewNameModal';

interface DashboardViewTabsProps {
  views: DashboardLayoutView[];
  activeViewId: string;
  editMode: boolean;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

/** Tab bar for switching between dashboard "views", like Lovelace's multiple views. */
export function DashboardViewTabs({ views, activeViewId, editMode, onSelect, onAdd, onRename, onRemove }: DashboardViewTabsProps) {
  const [adding, setAdding] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renamingView = views.find((v) => v.id === renamingId) ?? null;

  return (
    <div className="dash-view-tabs">
      {views.map((view) => (
        <div key={view.id} className={`dash-view-tab ${view.id === activeViewId ? 'dash-view-tab--active' : ''}`}>
          <button type="button" className="dash-view-tab-btn" onClick={() => onSelect(view.id)}>
            {view.name}
          </button>
          {editMode && (
            <>
              <button type="button" className="dash-view-tab-icon" onClick={() => setRenamingId(view.id)} aria-label={`Rename ${view.name}`}>
                ✎
              </button>
              {views.length > 1 && (
                <button type="button" className="dash-view-tab-icon" onClick={() => onRemove(view.id)} aria-label={`Delete ${view.name}`}>
                  ✕
                </button>
              )}
            </>
          )}
        </div>
      ))}
      {editMode && (
        <button type="button" className="dash-view-tab-add" onClick={() => setAdding(true)} aria-label="Add view">
          +
        </button>
      )}
      {adding && (
        <ViewNameModal
          title="New View"
          initialValue="New View"
          onSave={(name) => { onAdd(name); setAdding(false); }}
          onClose={() => setAdding(false)}
        />
      )}
      {renamingView && (
        <ViewNameModal
          title="Rename View"
          initialValue={renamingView.name}
          onSave={(name) => { onRename(renamingView.id, name); setRenamingId(null); }}
          onClose={() => setRenamingId(null)}
        />
      )}
    </div>
  );
}
