import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getCardDefinition } from './registry';
import { HomeSensorsCard } from './HomeSensorsCard';

function read(rel: string): string {
  return readFileSync(path.resolve(rel), 'utf8');
}

describe('home sensors card is mounted', () => {
  it('registers the card component in the dashboard registry', () => {
    const definition = getCardDefinition('home-sensors');
    expect(definition?.component).toBe(HomeSensorsCard);
    expect(definition?.allowedRegions).toEqual(['topbar', 'sidebar', 'main']);
    expect(definition?.defaultConfig).toEqual({});
  });

  it('is wired in both the app tree and the add-on tree', () => {
    for (const root of ['src', 'beacon/src']) {
      const registry = read(`${root}/components/cards/registry.tsx`);
      expect(registry).toContain("import { HomeSensorsCard } from './HomeSensorsCard'");
      expect(registry).toContain("type: 'home-sensors'");
      expect(registry).toContain('component: HomeSensorsCard');

      const settings = read(`${root}/components/SettingsView.tsx`);
      expect(settings).toContain('<HomeSensorsSettings');
      expect(settings).toContain('settings.homeSensorsEnabled');
      expect(settings).toContain('settings.homeSensors');

      const picker = read(`${root}/components/HomeSensorsSettings.tsx`);
      expect(picker).toContain('useHomeSensorCatalog');
      expect(picker).not.toContain('useHomeSensorStream');
      expect(picker).not.toContain('get_states');

      const dashboard = read(`${root}/components/DashboardView.tsx`);
      expect(dashboard).toContain('homeSensorsEnabled');
      expect(dashboard).toContain('homeSensors');

      const app = read(`${root}/App.tsx`);
      expect(app).toContain('homeSensorsEnabled={settings.homeSensorsEnabled}');
      expect(app).toContain('homeSensors={settings.homeSensors}');
      expect(app).toContain('attachDirectHaClient');

      const focus = read(`${root}/components/focus/FocusView.tsx`);
      expect(focus).not.toContain('HomeSensorsCard');
      expect(focus).not.toContain('home-sensors');
      expect(focus).not.toContain('homeSensors');
    }

    const card = read('src/components/cards/HomeSensorsCard.tsx');
    const stream = read('src/api/home-sensor-stream.ts');
    const live = read('src/home-sensors/live.ts');
    expect(card).not.toContain('callHaService');
    expect(card).not.toContain('setInterval');
    expect(stream).not.toContain('setInterval');
    expect(live).not.toContain('setInterval');
  });
});
