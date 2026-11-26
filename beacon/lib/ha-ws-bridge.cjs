'use strict';

/**
 * Bridge a browser Home Assistant websocket client to the server's HA
 * connection. The browser speaks the normal auth / command / event protocol.
 * The server authenticates upstream with its own token (Supervisor token or
 * HA_TOKEN) and never forwards the browser's access token.
 *
 * Used by the Home sensors card so add-on and standalone mode can call
 * get_states and subscribe to state_changed without a browser-side token.
 *
 * /beacon-ws/ha is read-only. After the browser auth handshake, the only
 * commands forwarded upstream are get_states, subscribe_events for
 * state_changed, unsubscribe_events for a subscription id this browser
 * created, and ping. Anything else is answered locally and is not sent.
 *
 * Results are limited to the entity ids currently selected for the Home
 * sensors card. allowedEntityIds() is called on every message, so saving a
 * new pick starts delivery on this socket. A disabled card or an empty
 * selection delivers no entity states. Callers must not cache the Set.
 */

function subscriptionKey(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function rejectNotAllowed(sendToBrowser, msg) {
  sendToBrowser({
    id: msg.id,
    type: 'result',
    success: false,
    error: { code: 'not_allowed' },
  });
}

function parseWsJson(raw) {
  try {
    const text = typeof raw === 'string' ? raw : raw.toString('utf8');
    const msg = JSON.parse(text);
    if (!msg || typeof msg !== 'object') return null;
    return msg;
  } catch {
    return null;
  }
}

function currentAllowed(allowedEntityIds) {
  if (typeof allowedEntityIds !== 'function') return new Set();
  try {
    const value = allowedEntityIds();
    if (value instanceof Set) return value;
  } catch {
    return new Set();
  }
  return new Set();
}

function entityIdOf(value) {
  return value && typeof value === 'object' && typeof value.entity_id === 'string'
    ? value.entity_id
    : '';
}

function filterStateRows(rows, allowed) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => {
    const entityId = entityIdOf(row);
    return entityId !== '' && allowed.has(entityId);
  });
}

/**
 * Keep a state_changed event only when data.entity_id is picked. A nested
 * new_state or old_state for a different entity is dropped too.
 */
function allowedStateChanged(msg, allowed) {
  if (!msg || msg.type !== 'event' || !msg.event || msg.event.event_type !== 'state_changed') {
    return false;
  }
  const data = msg.event.data;
  const entityId = entityIdOf(data) || (data && typeof data.entity_id === 'string' ? data.entity_id : '');
  if (!entityId || !allowed.has(entityId)) return false;
  if (data && data.new_state && typeof data.new_state === 'object') {
    const nested = entityIdOf(data.new_state);
    if (nested && nested !== entityId) return false;
  }
  if (data && data.old_state && typeof data.old_state === 'object') {
    const nested = entityIdOf(data.old_state);
    if (nested && nested !== entityId) return false;
  }
  return true;
}

function createHaWsBridge({
  token,
  sendToHa,
  sendToBrowser,
  closeBrowser,
  closeHa,
  allowedEntityIds,
  registerDeliver,
}) {
  let haAuthed = false;
  let browserAuthed = false;
  let closed = false;
  const browserSubscriptions = new Set();
  const getStatesIds = new Set();

  function allow() {
    return currentAllowed(allowedEntityIds);
  }

  function deliverState(state) {
    if (!haAuthed || !browserAuthed || closed) return;
    const entityId = entityIdOf(state);
    if (!entityId || !allow().has(entityId)) return;
    if (browserSubscriptions.size === 0) return;
    for (const id of browserSubscriptions) {
      sendToBrowser({
        id,
        type: 'event',
        event: {
          event_type: 'state_changed',
          data: { entity_id: entityId, new_state: state },
        },
      });
    }
  }

  let unregister = null;
  if (typeof registerDeliver === 'function') {
    try {
      const stop = registerDeliver(deliverState);
      if (typeof stop === 'function') unregister = stop;
    } catch {
      unregister = null;
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    if (unregister) {
      try { unregister(); } catch { /* ignore */ }
    }
  }

  return {
    close,
    deliverState,
    onHaMessage(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'auth_required') {
        if (!token) {
          closeBrowser();
          closeHa();
          return;
        }
        sendToHa({ type: 'auth', access_token: token });
        return;
      }
      if (msg.type === 'auth_invalid' || msg.type === 'auth_ok') {
        if (msg.type === 'auth_invalid') {
          closeBrowser();
          closeHa();
          return;
        }
        haAuthed = true;
        if (!browserAuthed) sendToBrowser({ type: 'auth_required' });
        return;
      }
      if (!haAuthed || !browserAuthed) return;

      if (msg.type === 'result' && (getStatesIds.has(msg.id) || Array.isArray(msg.result))) {
        getStatesIds.delete(msg.id);
        if (msg.success !== true && !Array.isArray(msg.result)) {
          sendToBrowser(msg);
          return;
        }
        sendToBrowser({ ...msg, result: filterStateRows(msg.result, allow()) });
        return;
      }

      if (msg.type === 'event') {
        if (allowedStateChanged(msg, allow())) sendToBrowser(msg);
        return;
      }

      sendToBrowser(msg);
    },
    onBrowserMessage(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'auth') {
        if (!haAuthed) return;
        if (!browserAuthed) {
          browserAuthed = true;
          sendToBrowser({ type: 'auth_ok' });
        }
        return;
      }
      if (!haAuthed || !browserAuthed) return;
      if (msg.type === 'get_states' || msg.type === 'ping') {
        if (msg.type === 'get_states') {
          const id = subscriptionKey(msg.id);
          if (id !== undefined) getStatesIds.add(id);
        }
        sendToHa(msg);
        return;
      }
      if (msg.type === 'subscribe_events' && msg.event_type === 'state_changed') {
        const id = subscriptionKey(msg.id);
        if (id !== undefined) browserSubscriptions.add(id);
        sendToHa(msg);
        return;
      }
      if (msg.type === 'unsubscribe_events') {
        const subscription = subscriptionKey(msg.subscription);
        if (subscription !== undefined && browserSubscriptions.has(subscription)) {
          browserSubscriptions.delete(subscription);
          sendToHa(msg);
          return;
        }
      }
      rejectNotAllowed(sendToBrowser, msg);
    },
  };
}

function attachHaWsBridge(browserWs, { url, token, WebSocketImpl, allowedEntityIds, registerDeliver }) {
  const Impl = WebSocketImpl;
  const ha = new Impl(url);
  const sendToHa = (msg) => {
    if (ha.readyState === 1) ha.send(JSON.stringify(msg));
  };
  const sendToBrowser = (msg) => {
    if (browserWs.readyState === 1) browserWs.send(JSON.stringify(msg));
  };
  const closeBrowser = () => {
    try { browserWs.close(); } catch { /* ignore */ }
  };
  const closeHa = () => {
    try { ha.close(); } catch { /* ignore */ }
  };
  const bridge = createHaWsBridge({
    token,
    sendToHa,
    sendToBrowser,
    closeBrowser,
    closeHa,
    allowedEntityIds,
    registerDeliver,
  });

  const shutdownBrowser = () => {
    bridge.close();
    closeBrowser();
  };
  const shutdownHa = () => {
    bridge.close();
    closeHa();
  };

  ha.on('message', (raw) => {
    const msg = parseWsJson(raw);
    if (msg) bridge.onHaMessage(msg);
  });
  browserWs.on('message', (raw) => {
    const msg = parseWsJson(raw);
    if (msg) bridge.onBrowserMessage(msg);
  });
  ha.on('close', shutdownBrowser);
  browserWs.on('close', shutdownHa);
  ha.on('error', shutdownBrowser);
  browserWs.on('error', shutdownHa);
  return bridge;
}

module.exports = {
  attachHaWsBridge,
  createHaWsBridge,
  parseWsJson,
};
