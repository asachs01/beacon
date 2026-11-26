import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { homeSensorsCardVisible, normalizeHomeSensorSettings } from './settings';

describe('home sensor settings', () => {
  it('stays off with an empty list when nothing has been saved', () => {
    expect(normalizeHomeSensorSettings(undefined)).toEqual({
      homeSensorsEnabled: false,
      homeSensors: [],
    });
    expect(normalizeHomeSensorSettings({})).toEqual({
      homeSensorsEnabled: false,
      homeSensors: [],
    });
    const source = readFileSync(path.resolve('src/hooks/useSettings.ts'), 'utf8');
    expect(source).toMatch(/homeSensorsEnabled:\s*false/);
    expect(source).toMatch(/homeSensors:\s*\[\]/);
  });

  it('keeps an explicit on switch and drops cameras, blanks, and duplicates', () => {
    expect(normalizeHomeSensorSettings({
      homeSensorsEnabled: true,
      homeSensors: [
        { entityId: 'sensor.kitchen', name: ' Kitchen ', icon: '🌡️' },
        { entityId: 'sensor.kitchen', name: 'Again', icon: '' },
        { entityId: 'camera.porch', name: 'Porch', icon: '' },
        { entityId: 'not-an-entity', name: '', icon: '' },
        { entityId: 'binary_sensor.garage', name: '', icon: 'garage-door-icon-too-long' },
        null,
      ],
    })).toEqual({
      homeSensorsEnabled: true,
      homeSensors: [
        { entityId: 'sensor.kitchen', name: 'Kitchen', icon: '🌡️' },
        { entityId: 'binary_sensor.garage', name: '', icon: 'garage-d' },
      ],
    });
  });

  it('does not treat a non-boolean as on', () => {
    expect(normalizeHomeSensorSettings({ homeSensorsEnabled: 'true' }).homeSensorsEnabled).toBe(false);
  });

  it('hides the card from guests and from Kid Display', () => {
    expect(homeSensorsCardVisible({ enabled: false, guestActive: false })).toBe(false);
    expect(homeSensorsCardVisible({ enabled: true, guestActive: false })).toBe(true);
    expect(homeSensorsCardVisible({ enabled: true, guestActive: true })).toBe(false);
    expect(homeSensorsCardVisible({ enabled: true, guestActive: false, kidDisplay: true })).toBe(false);
  });
});
