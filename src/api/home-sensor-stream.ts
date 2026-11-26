import { useEffect, useState } from 'react';
import { HomeAssistantClient } from './homeassistant';
import { isAddOn, getIngressBasePath } from '../utils/ha-env';
import {
  pickHomeSensorSource,
  runHomeSensorSubscription,
  type HaStateSource,
} from '../home-sensors/live';
import { proxiedHaSocketUrl } from '../home-sensors/socket-url';
import type { HaLiveState } from '../home-sensors/types';

export interface HomeSensorStreamSnapshot {
  entities: HaLiveState[];
  ready: boolean;
  failed: boolean;
}

const EMPTY: HomeSensorStreamSnapshot = { entities: [], ready: false, failed: false };

let directClient: HomeAssistantClient | null = null;
let proxiedClient: HomeAssistantClient | null = null;
let proxiedReady = false;
let activeStop: (() => void) | null = null;
let activeSource: HaStateSource | null = null;
let inflight: Promise<void> | null = null;
let restarting = false;
const listeners = new Set<(snapshot: HomeSensorStreamSnapshot) => void>();
let snapshot: HomeSensorStreamSnapshot = EMPTY;

function publish(next: HomeSensorStreamSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener(snapshot));
}

function stopSubscription(): void {
  activeStop?.();
  activeStop = null;
  activeSource = null;
}

async function subscribe(source: HaStateSource): Promise<void> {
  stopSubscription();
  const stop = await runHomeSensorSubscription(source, (entities) => {
    publish({ entities, ready: true, failed: false });
  });
  activeStop = stop;
  activeSource = source;
}

async function restart(client: HomeAssistantClient): Promise<void> {
  if (restarting || listeners.size === 0) return;
  restarting = true;
  try {
    await subscribe(client);
  } catch {
    publish({ entities: snapshot.entities, ready: true, failed: true });
  } finally {
    restarting = false;
  }
}

async function openProxiedClient(): Promise<HomeAssistantClient | null> {
  if (typeof window === 'undefined') return null;
  const client = new HomeAssistantClient(window.location.origin, '', {
    socketUrl: proxiedHaSocketUrl(window.location, getIngressBasePath()),
  });
  client.setConnectionChangeHandler((up) => {
    if (up && proxiedReady) void restart(client);
  });
  try {
    await client.connect();
  } catch {
    client.disconnect();
    return null;
  }
  proxiedClient = client;
  return client;
}

async function resolveSource(): Promise<HaStateSource | null> {
  const picked = pickHomeSensorSource({
    direct: directClient,
    proxyMode: safeAddOn(),
    proxy: proxiedClient,
  });
  if (picked) return picked;
  if (!safeAddOn()) return null;
  const opened = await openProxiedClient();
  return opened?.isConnected ? opened : null;
}

function safeAddOn(): boolean {
  try {
    return isAddOn();
  } catch {
    return false;
  }
}

async function ensure(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const source = await resolveSource();
      if (!source) {
        publish({ entities: [], ready: true, failed: true });
        return;
      }
      // Keep the subscription we have. A later direct client replaces the proxy.
      if (activeStop && activeSource === source && source.isConnected) return;
      await subscribe(source);
      if (source === proxiedClient) proxiedReady = true;
    } catch {
      publish({ entities: [], ready: true, failed: true });
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The app's existing Home Assistant websocket, when the browser holds a token. */
export function attachDirectHaClient(client: HomeAssistantClient | null): void {
  directClient = client;
  if (client?.isConnected && listeners.size > 0) void ensure();
}

export function watchHomeSensorEntities(
  listener: (snapshot: HomeSensorStreamSnapshot) => void,
): () => void {
  listeners.add(listener);
  listener(snapshot);
  void ensure();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    stopSubscription();
    proxiedReady = false;
    proxiedClient?.disconnect();
    proxiedClient = null;
    snapshot = EMPTY;
  };
}

/** Live entity states for the home sensors card and its picker. No polling. */
export function useHomeSensorStream(enabled: boolean): HomeSensorStreamSnapshot {
  const [current, setCurrent] = useState<HomeSensorStreamSnapshot>(EMPTY);

  useEffect(() => {
    if (!enabled) {
      setCurrent(EMPTY);
      return undefined;
    }
    return watchHomeSensorEntities(setCurrent);
  }, [enabled]);

  return enabled ? current : EMPTY;
}

export function resetHomeSensorStreamForTests(): void {
  stopSubscription();
  proxiedReady = false;
  proxiedClient?.disconnect();
  proxiedClient = null;
  directClient = null;
  restarting = false;
  inflight = null;
  listeners.clear();
  snapshot = EMPTY;
}
