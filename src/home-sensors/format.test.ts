import { describe, expect, it } from 'vitest';
import { HOME_SENSOR_STALE_MS, readHomeSensor } from './format';
import type { HaLiveState } from './types';

const NOW = Date.parse('2026-11-25T15:00:00.000Z');

function entity(overrides: Partial<HaLiveState> & { entity_id: string; state: string }): HaLiveState {
  return { attributes: {}, ...overrides };
}

describe('home sensor readout', () => {
  it('says unavailable instead of a value', () => {
    const readout = readHomeSensor(entity({
      entity_id: 'sensor.kitchen',
      state: 'unavailable',
      attributes: { unit_of_measurement: '°F' },
      last_updated: new Date(NOW).toISOString(),
    }), NOW);
    expect(readout).toEqual({ kind: 'unavailable' });
  });

  it('says unknown for an unknown or blank state', () => {
    expect(readHomeSensor(entity({ entity_id: 'sensor.kitchen', state: 'unknown' }), NOW)).toEqual({ kind: 'unknown' });
    expect(readHomeSensor(entity({ entity_id: 'sensor.kitchen', state: '  ' }), NOW)).toEqual({ kind: 'unknown' });
  });

  it('replaces a value that has not updated for 3 hours', () => {
    const last = new Date(NOW - HOME_SENSOR_STALE_MS).toISOString();
    expect(readHomeSensor(entity({
      entity_id: 'sensor.kitchen',
      state: '70',
      attributes: { unit_of_measurement: '°F' },
      last_updated: last,
    }), NOW)).toEqual({ kind: 'stale', unit: 'h', count: 3 });
  });

  it('keeps a value that updated just inside the 3 hour window', () => {
    const last = new Date(NOW - HOME_SENSOR_STALE_MS + 1).toISOString();
    expect(readHomeSensor(entity({
      entity_id: 'sensor.kitchen',
      state: '70',
      attributes: { unit_of_measurement: '°F' },
      last_changed: new Date(NOW - HOME_SENSOR_STALE_MS * 2).toISOString(),
      last_updated: last,
    }), NOW)).toEqual({ kind: 'value', text: '70', unit: '°F' });
  });

  it('trusts a fresh last_reported over an older last_updated', () => {
    expect(readHomeSensor(entity({
      entity_id: 'sensor.kitchen',
      state: '70',
      last_updated: new Date(NOW - HOME_SENSOR_STALE_MS * 2).toISOString(),
      last_reported: new Date(NOW).toISOString(),
    }), NOW)).toEqual({ kind: 'value', text: '70', unit: '' });
  });

  it('keeps a value when Home Assistant sent no timestamp', () => {
    expect(readHomeSensor(entity({ entity_id: 'sensor.washer', state: 'done' }), NOW))
      .toEqual({ kind: 'value', text: 'done', unit: '' });
  });

  it('names door, garage, lock, and running states without showing on or off', () => {
    expect(readHomeSensor(entity({
      entity_id: 'binary_sensor.front_door',
      state: 'on',
      attributes: { device_class: 'door' },
      last_updated: new Date(NOW).toISOString(),
    }), NOW)).toEqual({ kind: 'value', text: 'Open', unit: '' });
    expect(readHomeSensor(entity({
      entity_id: 'binary_sensor.garage',
      state: 'off',
      attributes: { device_class: 'garage_door' },
      last_updated: new Date(NOW).toISOString(),
    }), NOW)).toEqual({ kind: 'value', text: 'Closed', unit: '' });
    expect(readHomeSensor(entity({
      entity_id: 'binary_sensor.lock',
      state: 'on',
      attributes: { device_class: 'lock' },
      last_updated: new Date(NOW).toISOString(),
    }), NOW)).toEqual({ kind: 'value', text: 'Unlocked', unit: '' });
    expect(readHomeSensor(entity({
      entity_id: 'binary_sensor.washer',
      state: 'off',
      attributes: { device_class: 'running' },
      last_updated: new Date(NOW).toISOString(),
    }), NOW)).toEqual({ kind: 'value', text: 'Idle', unit: '' });
  });

  it('marks a quiet door stale instead of leaving it on Closed', () => {
    expect(readHomeSensor(entity({
      entity_id: 'binary_sensor.garage',
      state: 'off',
      attributes: { device_class: 'garage_door' },
      last_updated: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
    }), NOW)).toEqual({ kind: 'stale', unit: 'h', count: 4 });
  });
});
