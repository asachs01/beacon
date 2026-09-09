import { describe, it, expect } from 'vitest';
import {
  dedupeRegions,
  migrate,
  widenRegions,
  StoredDashboardLayoutV1,
  StoredDashboardLayoutV2,
  StoredDashboardLayoutV3,
} from './useDashboardLayout';
import { DashboardCard, DashboardRegionLayout } from '../types/dashboard-cards';

function card(id: string, layout?: { x: number; y: number; w: number; h: number }): DashboardCard {
  return { id, type: id, size: 'sm', layout, config: {} };
}

function regions(overrides: Partial<DashboardRegionLayout> = {}): DashboardRegionLayout {
  return { topbar: [], main: [], sidebar: [], ...overrides };
}

function v2(views: DashboardRegionLayout): StoredDashboardLayoutV2 {
  return {
    version: 2,
    customized: true,
    activeViewId: 'default-view',
    views: [{ id: 'default-view', name: 'Dashboard', regions: views }],
  };
}

describe('widenRegions — 12-column layouts move to a 24-column grid', () => {
  it('doubles x and w for topbar and main cards', () => {
    const widened = widenRegions(regions({
      topbar: [card('clock-weather', { x: 0, y: 0, w: 12, h: 2 })],
      main: [card('family-calendar', { x: 6, y: 1, w: 6, h: 16 })],
    }));

    expect(widened.topbar[0].layout).toEqual({ x: 0, y: 0, w: 24, h: 2 });
    expect(widened.main[0].layout).toEqual({ x: 12, y: 1, w: 12, h: 16 });
  });

  it('leaves y and h untouched', () => {
    const widened = widenRegions(regions({ main: [card('a', { x: 3, y: 7, w: 3, h: 9 })] }));

    expect(widened.main[0].layout?.y).toBe(7);
    expect(widened.main[0].layout?.h).toBe(9);
  });

  it('does not touch the sidebar, which stayed at 12 columns', () => {
    const sidebarCard = card('menu', { x: 0, y: 0, w: 12, h: 3 });
    const widened = widenRegions(regions({ sidebar: [sidebarCard] }));

    expect(widened.sidebar[0].layout).toEqual({ x: 0, y: 0, w: 12, h: 3 });
  });

  it('keeps cards that never had a stored position', () => {
    const widened = widenRegions(regions({ sidebar: [card('tasks')], main: [card('agenda-today')] }));

    expect(widened.main[0].layout).toBeUndefined();
    expect(widened.sidebar[0].layout).toBeUndefined();
  });
});

describe('dedupeRegions', () => {
  it('keeps the last card for a repeated id, per region', () => {
    const deduped = dedupeRegions(regions({
      main: [card('family-calendar', { x: 0, y: 0, w: 12, h: 16 }), card('family-calendar', { x: 4, y: 0, w: 8, h: 16 })],
    }));

    expect(deduped.main).toHaveLength(1);
    expect(deduped.main[0].layout?.x).toBe(4);
  });

  it('does not merge ids across regions', () => {
    const deduped = dedupeRegions(regions({ topbar: [card('shared')], sidebar: [card('shared')] }));

    expect(deduped.topbar).toHaveLength(1);
    expect(deduped.sidebar).toHaveLength(1);
  });
});

describe('migrate — persisted layouts survive the upgrade', () => {
  it('upgrades a v1 layout to v3 and widens it', () => {
    const stored: StoredDashboardLayoutV1 = {
      customized: true,
      regions: regions({ main: [card('family-calendar', { x: 6, y: 0, w: 6, h: 16 })] }),
    };

    const migrated = migrate(stored, 'default');

    expect(migrated.version).toBe(3);
    expect(migrated.customized).toBe(true);
    expect(migrated.views).toHaveLength(1);
    expect(migrated.views[0].regions.main[0].layout).toEqual({ x: 12, y: 0, w: 12, h: 16 });
  });

  it('falls back to the preset when a v1 layout has no regions', () => {
    const migrated = migrate({ customized: false } as StoredDashboardLayoutV1, 'default');

    expect(migrated.views[0].regions.main[0].type).toBe('family-calendar');
    // The preset is already 24-column, so it must not be widened again.
    expect(migrated.views[0].regions.main[0].layout).toEqual({ x: 0, y: 0, w: 24, h: 16 });
  });

  it('widens every view of a v2 layout', () => {
    const stored = v2(regions({
      topbar: [card('clock-weather', { x: 0, y: 0, w: 12, h: 2 })],
      main: [card('family-calendar', { x: 0, y: 0, w: 12, h: 16 })],
    }));

    const migrated = migrate(stored, 'default');

    expect(migrated.version).toBe(3);
    expect(migrated.views[0].regions.topbar[0].layout?.w).toBe(24);
    expect(migrated.views[0].regions.main[0].layout?.w).toBe(24);
  });

  it('preserves activeViewId and view names', () => {
    const stored = v2(regions());
    stored.activeViewId = 'default-view';
    stored.views[0].name = 'Kitchen';

    const migrated = migrate(stored, 'default');

    expect(migrated.activeViewId).toBe('default-view');
    expect(migrated.views[0].name).toBe('Kitchen');
  });

  it('is idempotent — a v3 layout is never widened a second time', () => {
    const once = migrate(v2(regions({ main: [card('family-calendar', { x: 0, y: 0, w: 12, h: 16 })] })), 'default');
    const twice = migrate(once, 'default');

    expect(twice.views[0].regions.main[0].layout).toEqual({ x: 0, y: 0, w: 24, h: 16 });
    expect(twice).toEqual(once);
  });

  it('dedupes while migrating a v3 layout', () => {
    const stored: StoredDashboardLayoutV3 = {
      version: 3,
      customized: true,
      activeViewId: 'default-view',
      views: [{
        id: 'default-view',
        name: 'Dashboard',
        regions: regions({ main: [card('family-calendar'), card('family-calendar')] }),
      }],
    };

    expect(migrate(stored, 'default').views[0].regions.main).toHaveLength(1);
  });
});
