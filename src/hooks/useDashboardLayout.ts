import { useEffect, useMemo, useRef, useState } from 'react';
import { loadData, loadDataSync } from '../api/beacon-store';
import { addToCollection, getCollection, getCollectionSync, removeFromCollection } from '../api/beacon-collection';
import { DashboardCard, DashboardLayoutView, DashboardRegionLayout, GridPosition } from '../types/dashboard-cards';

/** The whole layout as one document: now only read, to carry it over to VIEWS_COLLECTION. */
const LEGACY_STORAGE_KEY = 'beacon-dashboard-layout';
/** One item per view, so displays editing different views don't collide. */
const VIEWS_COLLECTION = 'beacon_dashboard_views';
/** The view this display shows; each display picks its own. */
const ACTIVE_VIEW_KEY = 'beacon-dashboard-active-view';
const DEFAULT_VIEW_ID = 'default-view';

type DashboardPreset = 'default' | 'classic' | 'compact';

export interface StoredDashboardLayoutV3 {
  version: 3;
  customized: boolean;
  activeViewId: string;
  views: DashboardLayoutView[];
}

/** Previous multi-view layout shape, using 12 columns in every region. */
export interface StoredDashboardLayoutV2 {
  version: 2;
  customized: boolean;
  activeViewId: string;
  views: DashboardLayoutView[];
}

/** Pre-Phase-4 shape, kept only for the one-time migration below. */
export interface StoredDashboardLayoutV1 {
  customized: boolean;
  regions: DashboardRegionLayout;
}

function card(id: string, type: string, size: DashboardCard['size'], layout?: GridPosition): DashboardCard {
  return { id, type, size, layout, config: {} };
}

/** Builds the region layout matching today's visual arrangement for a given preset. */
function defaultLayoutFor(preset: DashboardPreset): DashboardRegionLayout {
  const topbar = [card('clock-weather', 'clock-weather', 'lg', { x: 0, y: 0, w: 24, h: 2 })];
  const sidebar = [card('menu', 'menu', 'sm'), card('tasks', 'tasks', 'sm')];

  if (preset === 'classic') {
    return {
      topbar,
      main: [card('agenda-today', 'agenda-today', 'md'), card('agenda-week', 'agenda-week', 'md')],
      sidebar,
    };
  }
  // 'default' and 'compact' both use the per-member family calendar as main content.
  return {
    topbar,
    main: [card('family-calendar', 'family-calendar', 'lg', { x: 0, y: 0, w: 24, h: 16 })],
    sidebar,
  };
}

function initialFor(preset: DashboardPreset): StoredDashboardLayoutV3 {
  return {
    version: 3,
    customized: false,
    activeViewId: DEFAULT_VIEW_ID,
    views: [{ id: DEFAULT_VIEW_ID, name: 'Dashboard', regions: defaultLayoutFor(preset) }],
  };
}

/** Doubles x/width in regions whose column count changed from 12 to 24. */
export function widenRegions(regions: DashboardRegionLayout): DashboardRegionLayout {
  const widenCards = (cards: DashboardCard[]) => cards.map((dashboardCard) => (
    dashboardCard.layout
      ? {
        ...dashboardCard,
        layout: {
          ...dashboardCard.layout,
          x: dashboardCard.layout.x * 2,
          w: dashboardCard.layout.w * 2,
        },
      }
      : dashboardCard
  ));
  return {
    topbar: widenCards(regions.topbar),
    main: widenCards(regions.main),
    sidebar: regions.sidebar,
  };
}

/** Migrates persisted dashboard layouts to the current multi-view grid shape. */
export function migrate(stored: StoredDashboardLayoutV1 | StoredDashboardLayoutV2 | StoredDashboardLayoutV3, preset: DashboardPreset): StoredDashboardLayoutV3 {
  if ('version' in stored && stored.version === 3) {
    return { ...stored, views: stored.views.map((view) => ({ ...view, regions: dedupeRegions(view.regions) })) };
  }
  if ('version' in stored && stored.version === 2) {
    return {
      ...stored,
      version: 3,
      views: stored.views.map((view) => ({ ...view, regions: dedupeRegions(widenRegions(view.regions)) })),
    };
  }
  const v1 = stored as StoredDashboardLayoutV1;
  return {
    version: 3,
    customized: v1.customized,
    activeViewId: DEFAULT_VIEW_ID,
    views: [{
      id: DEFAULT_VIEW_ID,
      name: 'Dashboard',
      regions: dedupeRegions(v1.regions ? widenRegions(v1.regions) : defaultLayoutFor(preset)),
    }],
  };
}

function makeViewId(): string {
  return `view-${Date.now()}`;
}

/** Drops duplicate-id cards within a region (keeps the last occurrence). */
function dedupeCards(cards: DashboardCard[]): DashboardCard[] {
  const byId = new Map<string, DashboardCard>();
  for (const c of cards) byId.set(c.id, c);
  return Array.from(byId.values());
}

export function dedupeRegions(regions: DashboardRegionLayout): DashboardRegionLayout {
  return {
    topbar: dedupeCards(regions.topbar),
    main: dedupeCards(regions.main),
    sidebar: dedupeCards(regions.sidebar),
  };
}

/** A view as stored in VIEWS_COLLECTION. */
export interface StoredDashboardView extends DashboardLayoutView {
  /** Primary view only: edited, so it no longer follows the preset. */
  customized?: boolean;
}

type LegacyLayout = StoredDashboardLayoutV1 | StoredDashboardLayoutV2 | StoredDashboardLayoutV3;

const EMPTY_REGIONS: DashboardRegionLayout = { topbar: [], main: [], sidebar: [] };

/**
 * Fills in what a stored view may lack: an edit saves only the fields it
 * changes, so an edit to a view another display has just removed stores
 * only those.
 */
function completeView(view: Partial<StoredDashboardView> & { id: string }, preset: DashboardPreset): StoredDashboardView {
  return {
    ...view,
    name: view.name ?? 'Dashboard',
    regions: dedupeRegions(view.regions ?? (view.id === DEFAULT_VIEW_ID ? defaultLayoutFor(preset) : EMPTY_REGIONS)),
  };
}

/** The views of a layout saved as one document. */
function viewsFromLegacy(stored: LegacyLayout, preset: DashboardPreset): StoredDashboardView[] {
  const layout = migrate(stored, preset);
  return layout.views.map((view) => (view.id === DEFAULT_VIEW_ID ? { ...view, customized: layout.customized } : view));
}

/** This device's copy, for the first render. */
function cachedViews(preset: DashboardPreset): StoredDashboardView[] {
  const views = getCollectionSync<StoredDashboardView>(VIEWS_COLLECTION);
  if (views.length) return views.map((view) => completeView(view, preset));
  const legacy = loadDataSync<LegacyLayout | null>(LEGACY_STORAGE_KEY, null);
  return legacy ? viewsFromLegacy(legacy, preset) : initialFor(preset).views;
}

/** The stored views, or null if there are none (in either form). */
async function loadViews(preset: DashboardPreset): Promise<StoredDashboardView[] | null> {
  const views = await getCollection<StoredDashboardView>(VIEWS_COLLECTION);
  if (views.length) return views.map((view) => completeView(view, preset));
  const legacy = await loadData<LegacyLayout | null>(LEGACY_STORAGE_KEY, null);
  return legacy ? viewsFromLegacy(legacy, preset) : null;
}

function readActiveViewId(): string {
  try {
    const id = localStorage.getItem(ACTIVE_VIEW_KEY);
    if (id) return id;
  } catch {
    /* localStorage unavailable */
  }
  // Before each display kept its own, the choice was saved with the layout.
  return loadDataSync<{ activeViewId?: string } | null>(LEGACY_STORAGE_KEY, null)?.activeViewId ?? DEFAULT_VIEW_ID;
}

function writeActiveViewId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_VIEW_KEY, id);
  } catch {
    /* localStorage unavailable */
  }
}

/**
 * Persists the dashboard's card layout across one or more named "views" (tabs).
 * Until the primary view is actually customized (Phase 2 edit mode), it always
 * follows the Settings `dashboardLayout` preset so switching presets keeps
 * working exactly as before. Additional views the user creates are always
 * fully custom (they have no preset to fall back to).
 *
 * Each view is an item of VIEWS_COLLECTION, and an edit sends only the
 * fields it changes, which the server merges into that item. The layout
 * used to be saved whole, so a display that had been open a while undid
 * other displays' changes the next time it saved anything, even a tab tap.
 * The view showing is chosen per display.
 */
export function useDashboardLayout(preset: DashboardPreset) {
  const [views, setViews] = useState<StoredDashboardView[]>(() => cachedViews(preset));
  const [activeViewId, setActiveId] = useState(readActiveViewId);
  // One save at a time, in order, so an older save can't land last.
  const saving = useRef<Promise<void>>(Promise.resolve());
  const serverHasViews = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadViews(preset).then((loaded) => {
      if (!cancelled && loaded) setViews(loaded);
    });
    return () => { cancelled = true; };
    // Only re-fetch on mount — preset changes are handled below without a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load; preset is just the fallback for a missing saved layout
  }, []);

  /**
   * Runs `write` once the server has views: while it has none (a new
   * install, or a layout still saved as one document) every view in `next`
   * is stored first, or the first edit would leave the others unsaved.
   */
  const save = (next: StoredDashboardView[], write: () => Promise<unknown>) => {
    saving.current = saving.current.then(async () => {
      if (!serverHasViews.current) {
        const stored = await getCollection<StoredDashboardView>(VIEWS_COLLECTION);
        if (!stored.length) {
          for (const view of next) await addToCollection<StoredDashboardView>(VIEWS_COLLECTION, view);
        }
        serverHasViews.current = true;
      }
      await write();
    }).catch(() => {
      /* reported by beacon-collection, for App's notice */
    });
  };

  /** Changes one view, saving only `patch` (the fields that changed). */
  const changeView = (id: string, patch: Partial<StoredDashboardView>) => {
    const next = views.map((v) => (v.id === id ? { ...v, ...patch } : v));
    setViews(next);
    // An add with a known id merges into that item (see collectionAdd in server.js).
    save(next, () => addToCollection<Partial<StoredDashboardView>>(VIEWS_COLLECTION, { ...patch, id }));
  };

  const activeIndex = Math.max(0, views.findIndex((v) => v.id === activeViewId));
  const activeView = views[activeIndex];
  const isPrimaryView = activeView.id === DEFAULT_VIEW_ID;
  const customized = !isPrimaryView || !!activeView.customized;

  // Stable reference across re-renders (e.g. the dashboard clock ticking every
  // second) unless the preset actually changes, so downstream consumers
  // (GridStack widget diffing, etc.) don't see a spurious "cards changed".
  const defaultRegions = useMemo(() => defaultLayoutFor(preset), [preset]);
  const regions = customized ? activeView.regions : defaultRegions;

  const updateLayout = (regions: DashboardRegionLayout) => {
    changeView(activeView.id, { regions: dedupeRegions(regions), customized: true });
  };

  const resetToPreset = () => {
    if (!isPrimaryView) return;
    changeView(activeView.id, { regions: defaultLayoutFor(preset), customized: false });
  };

  const setActiveViewId = (id: string) => {
    setActiveId(id);
    writeActiveViewId(id);
  };

  const addView = (name: string) => {
    const view: StoredDashboardView = { id: makeViewId(), name, regions: EMPTY_REGIONS };
    const next = [...views, view];
    setViews(next);
    setActiveViewId(view.id);
    save(next, () => addToCollection<StoredDashboardView>(VIEWS_COLLECTION, view));
  };

  const renameView = (id: string, name: string) => {
    changeView(id, { name });
  };

  const removeView = (id: string) => {
    if (views.length <= 1) return;
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    if (activeView.id === id) setActiveViewId(next[0].id);
    save(next, () => removeFromCollection(VIEWS_COLLECTION, id));
  };

  return {
    layout: regions,
    customized,
    updateLayout,
    resetToPreset,
    views,
    activeViewId: activeView.id,
    setActiveViewId,
    addView,
    renameView,
    removeView,
  };
}

