import { useState } from 'react';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import { cardRegistry } from './cards/registry';
import { DashboardGridStack } from './cards/DashboardGridStack';
import { DashboardViewTabs } from './cards/DashboardViewTabs';
import { LazyBoundary } from './LazyBoundary';
import { lazyNamed } from '../utils/lazy-screen';
import { DashboardCard, DashboardCardContext } from '../types/dashboard-cards';

// Only used while editing the classic layout; brings dnd-kit along.
const DashboardRegionEditor = lazyNamed(() => import('./cards/DashboardRegionEditor'), 'DashboardRegionEditor');

interface AdvancedDashboardProps {
  layout: 'default' | 'classic' | 'compact';
  context: DashboardCardContext;
}

function renderCard(card: DashboardCard, context: DashboardCardContext) {
  const definition = cardRegistry[card.type];
  if (!definition) return null;
  const Component = definition.component;
  return <Component key={card.id} config={card.config} context={context} />;
}

/**
 * The customizable card dashboard (Settings → Appearance → Advanced
 * Dashboard). DashboardView loads this file only when that's switched on,
 * since it brings GridStack, the card registry and the layout editor along.
 */
export function AdvancedDashboard({ layout, context }: AdvancedDashboardProps) {
  const [editMode, setEditMode] = useState(false);
  const { layout: regions, updateRegion, views, activeViewId, setActiveViewId, addView, renameView, removeView } = useDashboardLayout(layout);

  // ─── Classic: clock + three agenda columns (Today | This Week | Tasks) ───
  if (layout === 'classic') {
    return (
      <div className="dashboard dashboard--classic dashboard--advanced">
        <button type="button" className="dash-edit-toggle" onClick={() => setEditMode((v) => !v)}>
          {editMode ? 'Done' : '✎ Edit Dashboard'}
        </button>
        <div className="dash-topbar-region">
          {(views.length > 1 || editMode) && (
            <DashboardViewTabs
              views={views}
              activeViewId={activeViewId}
              editMode={editMode}
              onSelect={setActiveViewId}
              onAdd={addView}
              onRename={renameView}
              onRemove={removeView}
            />
          )}
          <DashboardGridStack
            region="topbar"
            cards={regions.topbar}
            context={context}
            editMode={editMode}
            onChange={(c) => updateRegion('topbar', c)}
          />
        </div>
        <main className="dash-classic">
          {editMode ? (
            <LazyBoundary>
              <DashboardRegionEditor region="main" cards={regions.main} context={context} onChange={(c) => updateRegion('main', c)} resizable={false} />
            </LazyBoundary>
          ) : (
            regions.main.map((card) => renderCard(card, context))
          )}
          <aside className="dash-classic-col dash-classic-sidebar">
            <DashboardGridStack
              region="sidebar"
              cards={regions.sidebar}
              context={context}
              editMode={editMode}
              onChange={(c) => updateRegion('sidebar', c)}
            />
          </aside>
        </main>
      </div>
    );
  }

  return (
    <div className={`dashboard dashboard--${layout} dashboard--advanced`}>
      {/* ─── TOP BAR: Time + Date + Weather ─── */}
      <button type="button" className="dash-edit-toggle" onClick={() => setEditMode((v) => !v)}>
        {editMode ? 'Done' : '✎ Edit Dashboard'}
      </button>
      <div className="dash-topbar-region">
        {(views.length > 1 || editMode) && (
          <DashboardViewTabs
            views={views}
            activeViewId={activeViewId}
            editMode={editMode}
            onSelect={setActiveViewId}
            onAdd={addView}
            onRename={renameView}
            onRemove={removeView}
          />
        )}
        <DashboardGridStack
          region="topbar"
          cards={regions.topbar}
          context={context}
          editMode={editMode}
          onChange={(c) => updateRegion('topbar', c)}
        />
      </div>

      {/* ─── MAIN: Per-member calendar columns ─── */}
      <main className="dash-main">
        <DashboardGridStack
          region="main"
          cards={regions.main}
          context={context}
          editMode={editMode}
          onChange={(c) => updateRegion('main', c)}
        />
      </main>

      {/* ─── SIDEBAR: Menu + Tasks + Chores ─── */}
      <aside className="dash-sidebar">
        <DashboardGridStack
          region="sidebar"
          cards={regions.sidebar}
          context={context}
          editMode={editMode}
          onChange={(c) => updateRegion('sidebar', c)}
        />
      </aside>
    </div>
  );
}
