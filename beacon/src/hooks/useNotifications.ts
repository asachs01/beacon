import { useEffect, useRef, useCallback } from 'react';
import { CalendarEvent } from '../types';
import { HomeAssistantClient } from '../api/homeassistant';

const CHECK_INTERVAL = 60 * 1000; // 1 minute
const NOTIFY_BEFORE_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Checks upcoming events every minute and fires browser notifications
 * 15 minutes before each event. Also sends HA mobile_app notifications
 * if the client is connected.
 */
export function useNotifications(
  events: CalendarEvent[],
  getClient: () => HomeAssistantClient | null,
) {
  // Track which event IDs we've already notified about to avoid duplicates
  const notifiedRef = useRef<Set<string>>(new Set());

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const checkUpcoming = useCallback(() => {
    const now = Date.now();

    for (const event of events) {
      if (event.allDay) continue;

      const eventStart = new Date(event.start).getTime();
      const diff = eventStart - now;

      // Event is within 15 minutes but hasn't started yet, and we haven't notified
      if (diff > 0 && diff <= NOTIFY_BEFORE_MS && !notifiedRef.current.has(event.id)) {
        notifiedRef.current.add(event.id);

        const minutesUntil = Math.round(diff / 60_000);
        const body = minutesUntil <= 1
          ? `Starting now`
          : `Starts in ${minutesUntil} minutes`;

        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(event.title, {
            body,
            icon: '/beacon-icon.svg',
            tag: `beacon-event-${event.id}`,
          });
        }

        // HA mobile app notification (best-effort)
        const client = getClient();
        if (client?.isConnected) {
          sendHANotification(client, event.title, body);
        }
      }
    }

    // Prune old notification IDs for events that have already passed
    const activeIds = new Set(events.map((e) => e.id));
    for (const id of notifiedRef.current) {
      if (!activeIds.has(id)) {
        notifiedRef.current.delete(id);
      }
    }
  }, [events, getClient]);

  useEffect(() => {
    // Check immediately on mount / event change
    checkUpcoming();

    const interval = setInterval(checkUpcoming, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkUpcoming]);
}

/**
 * Sends a notification through HA's notify.mobile_app service.
 * Discovers the first available mobile_app notify entity automatically.
 */
async function sendHANotification(
  client: HomeAssistantClient,
  title: string,
  message: string,
) {
  try {
    // The notify.mobile_app_<name> service follows a convention.
    // We call the generic notify.notify which fans out to all targets,
    // or we try the mobile_app domain directly.
    await client.callService('notify', 'notify', '', {
      title: `Beacon: ${title}`,
      message,
    });
  } catch {
    // Silently fail — the service may not be available
  }
}
