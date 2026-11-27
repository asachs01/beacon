import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { handleHomeSensorEntities } from '../../lib/home-sensor-entities.cjs';
import { homeSensorEntityMetadata } from '../../lib/home-sensor-allowlist.cjs';
import { coerceHomeSensorCatalogEntity } from '../api/home-sensor-catalog';

function mockRes() {
  return {
    status: 0,
    body: '',
    headersSent: false,
    writeHead(status: number) {
      this.status = status;
      this.headersSent = true;
    },
    end(body?: string) {
      this.body = body ?? '';
    },
  };
}

const haStates = [
  {
    entity_id: 'sensor.kitchen',
    state: '70',
    last_changed: '2026-11-26T00:00:00Z',
    context: { id: 'secret-context', user_id: 'user-1' },
    attributes: {
      friendly_name: 'Kitchen',
      device_class: 'temperature',
      unit_of_measurement: '°F',
      latitude: 41.8,
      entity_picture: '/api/camera_proxy/camera.porch',
    },
  },
  {
    entity_id: 'camera.porch',
    state: 'streaming',
    attributes: { friendly_name: 'Porch camera', entity_picture: '/secret' },
  },
  {
    entity_id: 'binary_sensor.garage',
    state: 'off',
    attributes: { device_class: 'garage_door' },
  },
];

describe('home sensor entity catalog', () => {
  it('returns metadata only and omits cameras, state, and extra attributes', () => {
    const entities = homeSensorEntityMetadata(haStates);
    expect(entities).toEqual([
      {
        entity_id: 'sensor.kitchen',
        friendly_name: 'Kitchen',
        domain: 'sensor',
        device_class: 'temperature',
        unit: '°F',
      },
      {
        entity_id: 'binary_sensor.garage',
        friendly_name: null,
        domain: 'binary_sensor',
        device_class: 'garage_door',
        unit: null,
      },
    ]);
    const encoded = JSON.stringify(entities);
    expect(encoded).not.toContain('70');
    expect(encoded).not.toContain('streaming');
    expect(encoded).not.toContain('latitude');
    expect(encoded).not.toContain('entity_picture');
    expect(encoded).not.toContain('secret');
    expect(encoded).not.toContain('camera.porch');
    for (const row of entities) {
      expect(Object.keys(row).sort()).toEqual([
        'device_class',
        'domain',
        'entity_id',
        'friendly_name',
        'unit',
      ]);
    }
  });

  it('answers GET /beacon-api/home-sensors/entities with that catalog', async () => {
    const res = mockRes();
    const fetchStates = vi.fn(async () => haStates);
    const handled = await handleHomeSensorEntities(
      { method: 'GET', url: '/beacon-api/home-sensors/entities?unused=1' },
      res,
      { fetchStates },
    );
    expect(handled).toBe(true);
    expect(fetchStates).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { entities: Array<Record<string, unknown>> };
    expect(body.entities.map((row) => row.entity_id)).toEqual(['sensor.kitchen', 'binary_sensor.garage']);
    expect(res.body).not.toContain('"state"');
    expect(res.body).not.toContain('latitude');
    expect(res.body).not.toContain('70');
  });

  it('does not require a new auth scheme and rejects other methods', async () => {
    const res = mockRes();
    const fetchStates = vi.fn();
    await handleHomeSensorEntities(
      { method: 'POST', url: '/beacon-api/home-sensors/entities' },
      res,
      { fetchStates },
    );
    expect(res.status).toBe(405);
    expect(fetchStates).not.toHaveBeenCalled();

    const missed = mockRes();
    const handled = await handleHomeSensorEntities(
      { method: 'GET', url: '/beacon-api/other' },
      missed,
      { fetchStates },
    );
    expect(handled).toBe(false);
    expect(missed.status).toBe(0);

    const failed = mockRes();
    await handleHomeSensorEntities(
      { method: 'GET', url: '/beacon-api/home-sensors/entities' },
      failed,
      { fetchStates: async () => { throw new Error('token super-secret down'); } },
    );
    expect(failed.status).toBe(502);
    expect(failed.body).not.toContain('super-secret');
    expect(JSON.parse(failed.body)).toEqual({ error: 'Home Assistant states unavailable' });
  });

  it('is wired to settings saves without a server-side PIN check', () => {
    const server = readFileSync('server.js', 'utf8');
    expect(server).toContain('/beacon-api/home-sensors/entities');
    expect(server).toContain('homeSensorGate.applySettings');
    expect(server).toContain('allowedEntityIds: () => homeSensorGate.allowedEntityIds()');
    expect(server).not.toMatch(/home-sensors\/entities[\s\S]{0,400}pin/i);
  });
});

describe('catalog client keeps metadata fields only', () => {
  it('drops state and unknown attributes from a row', () => {
    expect(coerceHomeSensorCatalogEntity({
      entity_id: 'sensor.kitchen',
      friendly_name: 'Kitchen',
      domain: 'sensor',
      device_class: 'temperature',
      unit: '°F',
      state: '70',
      attributes: { latitude: 1 },
    })).toEqual({
      entity_id: 'sensor.kitchen',
      friendly_name: 'Kitchen',
      domain: 'sensor',
      device_class: 'temperature',
      unit: '°F',
    });
    expect(coerceHomeSensorCatalogEntity({
      entity_id: 'camera.porch',
      friendly_name: 'Porch',
      domain: 'camera',
      device_class: null,
      unit: null,
    })).toBeNull();
  });
});
