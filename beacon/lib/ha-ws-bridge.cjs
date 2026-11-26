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

function createHaWsBridge({ token, sendToHa, sendToBrowser, closeBrowser, closeHa }) {
  let haAuthed = false;
  let browserAuthed = false;
  const browserSubscriptions = new Set();

  return {
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
      if (haAuthed && browserAuthed) sendToBrowser(msg);
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

function attachHaWsBridge(browserWs, { url, token, WebSocketImpl }) {
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
  const bridge = createHaWsBridge({ token, sendToHa, sendToBrowser, closeBrowser, closeHa });

  ha.on('message', (raw) => {
    const msg = parseWsJson(raw);
    if (msg) bridge.onHaMessage(msg);
  });
  browserWs.on('message', (raw) => {
    const msg = parseWsJson(raw);
    if (msg) bridge.onBrowserMessage(msg);
  });
  ha.on('close', closeBrowser);
  browserWs.on('close', closeHa);
  ha.on('error', closeBrowser);
  browserWs.on('error', closeHa);
  return bridge;
}

module.exports = {
  attachHaWsBridge,
  createHaWsBridge,
  parseWsJson,
};
