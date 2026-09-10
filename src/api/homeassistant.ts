import { CalendarEvent, CalendarInfo, WeatherData, CalendarColorMember, resolveCalendarColor } from '../types';

type MessageHandler = (message: HAMessage) => void;

/**
 * Convert the app's REST-shaped event fields (start_date_time, end_date_time,
 * start_date, end_date, summary, description) into the shape HA's WS-only
 * calendar/event/update command expects (dtstart, dtend, summary,
 * description — see homeassistant/components/calendar/const.py EVENT_START
 * = "dtstart", EVENT_END = "dtend"). Only forwards fields that are present.
 */
export function toWsEventPayload(event: {
  summary?: string;
  start_date_time?: string;
  end_date_time?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
}): Record<string, string> {
  const payload: Record<string, string> = {};
  if (event.summary !== undefined) payload.summary = event.summary;
  if (event.description !== undefined) payload.description = event.description;
  const dtstart = event.start_date_time ?? event.start_date;
  const dtend = event.end_date_time ?? event.end_date;
  if (dtstart !== undefined) payload.dtstart = dtstart;
  if (dtend !== undefined) payload.dtend = dtend;
  return payload;
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

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        this.reconnectDelay = 1000;
      };

      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as HAMessage;

        if (msg.type === 'auth_required') {
          this.ws?.send(JSON.stringify({
            type: 'auth',
            access_token: this.token,
          }));
          return;
        }

        if (msg.type === 'auth_ok') {
          this.authenticated = true;
          this.onConnectionChange?.(true);
          resolve();
          return;
        }

        if (msg.type === 'auth_invalid') {
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

      this.ws.onclose = () => {
        this.authenticated = false;
        this.onConnectionChange?.(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // onclose will fire after this
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      });
    }, this.reconnectDelay);
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

  private getRestUrl(): string {
    return this.url.replace(/\/api\/websocket$/, '').replace(/^ws/, 'http');
  }

  async getCalendars(colorOptions?: {
    calendarColors?: Record<string, string>;
    members?: CalendarColorMember[];
  }): Promise<CalendarInfo[]> {
    const baseUrl = this.getRestUrl();
    const response = await fetch(`${baseUrl}/api/calendars`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch calendars: ${response.status}`);
    const data = await response.json() as Array<{ entity_id: string; name: string }>;

    return data.map((cal, index) => ({
      id: cal.entity_id,
      name: cal.name,
      color: resolveCalendarColor(cal.entity_id, index, colorOptions),
    }));
  }

  async getEvents(calendarId: string, start: string, end: string): Promise<CalendarEvent[]> {
    const baseUrl = this.getRestUrl();
    const params = new URLSearchParams({ start, end });
    const response = await fetch(`${baseUrl}/api/calendars/${calendarId}?${params}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch events: ${response.status}`);
    const result = await response.json() as Array<{
      uid?: string;
      summary: string;
      start: string | { dateTime: string; date: string };
      end: string | { dateTime: string; date: string };
      description?: string;
      location?: string;
      recurrence_id?: string;
    }>;

    return (result || []).map((ev, i) => {
      const startStr = typeof ev.start === 'string' ? ev.start : (ev.start.dateTime || ev.start.date);
      const endStr = typeof ev.end === 'string' ? ev.end : (ev.end.dateTime || ev.end.date);
      const allDay = typeof ev.start === 'string'
        ? ev.start.length === 10
        : !!ev.start.date && !ev.start.dateTime;

      return {
        id: ev.uid || ev.recurrence_id || `${calendarId}-${i}`,
        title: ev.summary,
        start: startStr,
        end: endStr,
        allDay,
        description: ev.description,
        location: ev.location,
        calendarId,
        calendarName: calendarId,
        color: '', // will be set by consumer
      };
    });
  }

  async createEvent(calendarId: string, event: {
    summary: string;
    start_date_time?: string;
    end_date_time?: string;
    start_date?: string;
    end_date?: string;
    description?: string;
    rrule?: string;
  }): Promise<void> {
    await this.sendMessage({
      type: 'call_service',
      domain: 'calendar',
      service: 'create_event',
      target: { entity_id: calendarId },
      service_data: event,
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
  async updateEvent(calendarId: string, uid: string, event: {
    summary?: string;
    start_date_time?: string;
    end_date_time?: string;
    start_date?: string;
    end_date?: string;
    description?: string;
  }): Promise<void> {
    await this.sendMessage({
      type: 'calendar/event/update',
      entity_id: calendarId,
      uid,
      event: toWsEventPayload(event),
    });
  }

  /**
   * Delete an event. HA moved this off `calendar.delete_event` (REST
   * service) to the WS-only `calendar/event/delete` command — see note on
   * updateEvent above.
   */
  async deleteEvent(calendarId: string, uid: string): Promise<void> {
    await this.sendMessage({
      type: 'calendar/event/delete',
      entity_id: calendarId,
      uid,
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

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.authenticated = false;
    this.pendingRequests.clear();
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

  unsubscribe(subscriptionId: number): void {
    this.subscriptions.delete(subscriptionId);
  }

  get isConnected(): boolean {
    return this.authenticated;
  }
}
