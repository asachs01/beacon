import { WeatherData } from '../types';
import type { EventPayload, OccurrenceTarget } from '../utils/calendar-edits';

type MessageHandler = (message: HAMessage) => void;

/**
 * Convert the app's REST-shaped event fields (start_date_time, end_date_time,
 * start_date, end_date, summary, description, location, rrule) into the shape
 * HA's WS calendar event commands expect (dtstart, dtend, summary, description,
 * location, rrule — see homeassistant/components/calendar/const.py EVENT_START
 * = "dtstart", EVENT_END = "dtend"). Only forwards fields that are present.
 */
export function toWsEventPayload(event: {
  summary?: string;
  start_date_time?: string;
  end_date_time?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  location?: string;
  rrule?: string;
}): Record<string, string> {
  const payload: Record<string, string> = {};
  if (event.summary !== undefined) payload.summary = event.summary;
  if (event.description !== undefined) payload.description = event.description;
  if (event.location !== undefined) payload.location = event.location;
  if (event.rrule !== undefined) payload.rrule = event.rrule;
  const dtstart = event.start_date_time ?? event.start_date;
  const dtend = event.end_date_time ?? event.end_date;
  if (dtstart !== undefined) payload.dtstart = dtstart;
  if (dtend !== undefined) payload.dtend = dtend;
  return payload;
}

/**
 * The occurrence fields of HA's calendar/event/update and /delete commands:
 * without them an edit or delete applies to every occurrence of a
 * repeating event.
 */
export function toWsTarget(target?: OccurrenceTarget): { recurrence_id?: string; recurrence_range?: string } {
  if (!target) return {};
  return target.recurrenceRange
    ? { recurrence_id: target.recurrenceId, recurrence_range: target.recurrenceRange }
    : { recurrence_id: target.recurrenceId };
}

interface HAMessage {
  id?: number;
  type: string;
  [key: string]: unknown;
}

interface HAResultMessage {
  id: number;
  type: 'result';
  success: boolean;
  result: unknown;
  error?: { code: string; message: string };
}

interface HAEventMessage {
  id: number;
  type: 'event';
  event: unknown;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export class HomeAssistantClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private msgId = 1;
  private authenticated = false;
  private pendingRequests = new Map<number, PendingRequest>();
  private subscriptions = new Map<number, MessageHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  /** Set by disconnect(): a disposed client stays disconnected. */
  private disposed = false;
  private onConnectionChange?: (connected: boolean) => void;

  constructor(url: string, token: string) {
    this.url = url.replace(/^http/, 'ws');
    if (!this.url.endsWith('/api/websocket')) {
      this.url = this.url.replace(/\/$/, '') + '/api/websocket';
    }
    this.token = token;
  }

  setConnectionChangeHandler(handler: (connected: boolean) => void) {
    this.onConnectionChange = handler;
  }

  /**
   * Opens the connection; resolves once authenticated. Rejects if the
   * token is refused or the connection closes first (it used to wait
   * forever then, so reconnects never backed off while HA was down).
   */
  connect(): Promise<void> {
    this.disposed = false;
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }
      this.ws = ws;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as HAMessage;

        if (msg.type === 'auth_required') {
          ws.send(JSON.stringify({
            type: 'auth',
            access_token: this.token,
          }));
          return;
        }

        if (msg.type === 'auth_ok') {
          this.authenticated = true;
          this.reconnectDelay = 1000;
          this.onConnectionChange?.(true);
          resolve();
          return;
        }

        if (msg.type === 'auth_invalid') {
          // A token HA refuses won't work next time either: don't retry
          // (retrying forever can get the display banned by HA's login
          // attempt limit).
          this.disposed = true;
          reject(new Error('Invalid Home Assistant token'));
          return;
        }

        if (msg.type === 'result' && msg.id !== undefined) {
          const result = msg as unknown as HAResultMessage;
          const pending = this.pendingRequests.get(result.id);
          if (pending) {
            this.pendingRequests.delete(result.id);
            if (result.success) {
              pending.resolve(result.result);
            } else {
              const err = Object.assign(
                new Error(result.error?.message || 'Home Assistant command failed'),
                { code: result.error?.code },
              );
              pending.reject(err);
            }
          }
        }

        if (msg.type === 'event' && msg.id !== undefined) {
          const eventMsg = msg as unknown as HAEventMessage;
          const handler = this.subscriptions.get(eventMsg.id);
          handler?.(eventMsg.event as HAMessage);
        }
      };

      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.authenticated = false;
        reject(new Error('Connection to Home Assistant closed')); // no-op once connected
        this.failPending(new Error('Connection to Home Assistant lost'));
        this.onConnectionChange?.(false);
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after this
      };
    });
  }

  /** Tries again after reconnectDelay, which doubles each time until a connection succeeds. */
  private scheduleReconnect() {
    if (this.reconnectTimer || this.disposed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => { /* its close schedules the next try */ });
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  /** Requests waiting for an answer that won't come get an error instead of hanging. */
  private failPending(err: Error) {
    const pending = [...this.pendingRequests.values()];
    this.pendingRequests.clear();
    for (const request of pending) request.reject(err);
  }

  private sendMessage(msg: Omit<HAMessage, 'id'>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.authenticated) {
        reject(new Error('Not connected'));
        return;
      }
      const id = this.msgId++;
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ ...msg, id }));
    });
  }

  /**
   * Create a new calendar event. HA requires the calendar/event/create WS
   * command (not calendar.create_event REST service) to support recurring
   * events (rrule) — the service silently ignores/rejects rrule. This method
   * uses the WS command with dtstart/dtend fields that match update/delete.
   */
  async createEvent(calendarId: string, event: {
    summary: string;
    start_date_time?: string;
    end_date_time?: string;
    start_date?: string;
    end_date?: string;
    description?: string;
    location?: string;
    rrule?: string;
  }): Promise<void> {
    await this.sendMessage({
      type: 'calendar/event/create',
      entity_id: calendarId,
      event: toWsEventPayload(event),
    });
  }

  /**
   * Update an existing event. HA moved this off the `calendar.update_event`
   * REST service to a WS-only command (`calendar/event/update`) with a
   * different field schema (dtstart/dtend/summary, not start_date_time/
   * end_date_time) — see homeassistant/components/calendar/__init__.py.
   * Calendars that don't support CalendarEntityFeature.UPDATE_EVENT (many
   * providers don't) reject this with error code "not_supported"; callers
   * should catch that and fall back to delete+recreate or show a clear
   * "this calendar doesn't support editing" message.
   */
  async updateEvent(calendarId: string, uid: string, event: EventPayload, target?: OccurrenceTarget): Promise<void> {
    await this.sendMessage({
      type: 'calendar/event/update',
      entity_id: calendarId,
      uid,
      ...toWsTarget(target),
      event: toWsEventPayload(event),
    });
  }

  /**
   * Delete an event. HA moved this off `calendar.delete_event` (REST
   * service) to the WS-only `calendar/event/delete` command — see note on
   * updateEvent above.
   */
  async deleteEvent(calendarId: string, uid: string, target?: OccurrenceTarget): Promise<void> {
    await this.sendMessage({
      type: 'calendar/event/delete',
      entity_id: calendarId,
      uid,
      ...toWsTarget(target),
    });
  }

  async getWeather(entityId: string): Promise<WeatherData> {
    const states = await this.sendMessage({ type: 'get_states' }) as Array<{
      entity_id: string;
      state: string;
      attributes: Record<string, unknown>;
    }>;

    const weather = states.find(s => s.entity_id === entityId);
    if (!weather) {
      throw new Error(`Weather entity ${entityId} not found`);
    }

    const attrs = weather.attributes;
    const forecast = ((attrs.forecast as Array<{
      datetime: string;
      condition: string;
      temperature: number;
      templow: number;
    }>) || []).slice(0, 5);

    return {
      temperature: attrs.temperature as number,
      temperatureUnit: (attrs.temperature_unit as string) || '°F',
      condition: weather.state,
      humidity: attrs.humidity as number | undefined,
      windSpeed: attrs.wind_speed as number | undefined,
      forecast: forecast.map(f => ({
        date: f.datetime,
        condition: f.condition,
        tempHigh: f.temperature,
        tempLow: f.templow,
      })),
    };
  }

  async subscribeEvents(eventType: string, handler: MessageHandler): Promise<number> {
    const id = this.msgId++;
    this.subscriptions.set(id, handler);

    if (this.ws && this.authenticated) {
      this.ws.send(JSON.stringify({
        id,
        type: 'subscribe_events',
        event_type: eventType,
      }));
    }

    return id;
  }

  /**
   * Closes the connection for good. The socket's handlers are detached
   * first: its close used to schedule a reconnect, so a client disposed of
   * (e.g. on unmount) came back and stayed connected.
   */
  disconnect() {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.authenticated = false;
    this.failPending(new Error('Disconnected from Home Assistant'));
    this.subscriptions.clear();
  }

  async getStates(): Promise<Array<{
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
  }>> {
    return this.sendMessage({ type: 'get_states' }) as Promise<Array<{
      entity_id: string;
      state: string;
      attributes: Record<string, unknown>;
    }>>;
  }

  async callService(domain: string, service: string, entityId: string, data?: Record<string, unknown>): Promise<unknown> {
    return this.sendMessage({
      type: 'call_service',
      domain,
      service,
      target: { entity_id: entityId },
      service_data: data || {},
    });
  }

  async subscribeStateChanges(handler: MessageHandler): Promise<number> {
    return this.subscribeEvents('state_changed', handler);
  }

  /**
   * Ends a subscription at Home Assistant too: only dropping the handler
   * here left HA sending every state change for it for the life of the
   * connection, one more stream each time the music screen's data reloaded.
   */
  unsubscribe(subscriptionId: number): void {
    this.subscriptions.delete(subscriptionId);
    if (this.ws && this.authenticated) {
      this.sendMessage({ type: 'unsubscribe_events', subscription: subscriptionId }).catch(() => { /* connection gone: nothing to end */ });
    }
  }

  get isConnected(): boolean {
    return this.authenticated;
  }
}
