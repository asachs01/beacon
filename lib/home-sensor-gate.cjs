'use strict';

const { allowedEntityIdSet } = require('./home-sensor-allowlist.cjs');

/**
 * In-memory Home sensors allowlist.
 *
 * Loaded from beacon-settings.json at startup and replaced when that file
 * is saved. Bridges call allowedEntityIds() on every message so a newly
 * picked entity is delivered on the socket that is already open.
 *
 * When the set grows, fetchEntityState is asked for each added id and the
 * state is handed to watchers. A fetch that returns after the id was
 * removed is not delivered.
 */
function createHomeSensorGate({ readSettings, fetchEntityState } = {}) {
  let allowed = new Set();
  const listeners = new Set();

  function allowedEntityIds() {
    return allowed;
  }

  function watch(deliver) {
    if (typeof deliver !== 'function') return () => {};
    listeners.add(deliver);
    return () => {
      listeners.delete(deliver);
    };
  }

  function replaceAllowed(settings) {
    const previous = allowed;
    const next = allowedEntityIdSet(settings);
    allowed = next;
    return { previous, next };
  }

  async function publishAdded(previous, next) {
    if (typeof fetchEntityState !== 'function') return;
    const added = [];
    for (const entityId of next) {
      if (!previous.has(entityId)) added.push(entityId);
    }
    if (added.length === 0) return;
    await Promise.all(added.map(async (entityId) => {
      let state;
      try {
        state = await fetchEntityState(entityId);
      } catch {
        return;
      }
      if (!state || typeof state !== 'object' || state.entity_id !== entityId) return;
      if (!allowed.has(entityId)) return;
      for (const deliver of listeners) {
        try {
          deliver(state);
        } catch {
          /* one browser must not block the others */
        }
      }
    }));
  }

  /**
   * Replace the allowlist before the first await, so callers that do not
   * wait for the state push still filter the next websocket message with
   * the new set.
   */
  function applySettings(settings) {
    const { previous, next } = replaceAllowed(settings);
    return publishAdded(previous, next);
  }

  async function load() {
    if (typeof readSettings !== 'function') {
      allowed = new Set();
      return allowed;
    }
    try {
      replaceAllowed(await readSettings());
    } catch {
      allowed = new Set();
    }
    return allowed;
  }

  return {
    allowedEntityIds,
    watch,
    applySettings,
    load,
  };
}

module.exports = {
  createHomeSensorGate,
};
