import { describe, expect, it } from 'vitest';
import { filterHomeSensorChoices } from './entities';
import type { HaLiveState } from './types';

function row(entityId: string, name: string): HaLiveState {
  return { entity_id: entityId, state: 'on', attributes: { friendly_name: name } };
}

const returned = [
  row('sensor.kitchen_temp', 'Kitchen'),
  row('camera.porch', 'Porch camera'),
  row('binary_sensor.garage_door', 'Garage'),
];

describe('home sensor entity picker', () => {
  it('lists only entities the connection returned, and drops cameras', () => {
    const choices = filterHomeSensorChoices(returned);
    expect(choices.map((choice) => choice.entityId)).toEqual([
      'binary_sensor.garage_door',
      'sensor.kitchen_temp',
    ]);
    expect(choices.some((choice) => choice.domain === 'camera')).toBe(false);
    expect(choices.map((choice) => choice.entityId)).not.toContain('weather.home');
    expect(choices.map((choice) => choice.entityId)).not.toContain('light.porch');
  });

  it('filters the returned list by name or entity id', () => {
    expect(filterHomeSensorChoices(returned, 'kit').map((choice) => choice.entityId))
      .toEqual(['sensor.kitchen_temp']);
    expect(filterHomeSensorChoices(returned, 'binary_sensor.garage').map((choice) => choice.entityId))
      .toEqual(['binary_sensor.garage_door']);
    expect(filterHomeSensorChoices(returned, 'porch')).toEqual([]);
  });
});
