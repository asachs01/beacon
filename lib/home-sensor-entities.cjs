'use strict';

const { homeSensorEntityMetadata } = require('./home-sensor-allowlist.cjs');

const ROUTE = '/beacon-api/home-sensors/entities';

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * GET /beacon-api/home-sensors/entities
 *
 * Settings-time catalog for the Home sensors picker. The body is metadata
 * only: entity_id, friendly_name, domain, device_class, and unit.
 *
 * Beacon has no server-side family PIN or settings unlock. PUT /beacon-data/*
 * is not authenticated. This route is gated the same way: any client that
 * can reach Beacon can read the catalog. Do not invent a new auth scheme
 * here. The catalog does not include state values.
 */
async function handleHomeSensorEntities(req, res, deps) {
  const pathname = (req.url || '').split('?')[0];
  if (pathname !== ROUTE) return false;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return true;
  }
  try {
    const states = await deps.fetchStates();
    sendJson(res, 200, { entities: homeSensorEntityMetadata(states) });
  } catch {
    console.warn('[beacon] home sensor catalog failed');
    if (!res.headersSent) {
      sendJson(res, 502, { error: 'Home Assistant states unavailable' });
    }
  }
  return true;
}

module.exports = {
  handleHomeSensorEntities,
  HOME_SENSOR_ENTITIES_ROUTE: ROUTE,
};
