import { CalendarEvent, CalendarInfo, WeatherData, getCalendarColor } from '../types';

type MessageHandler = (message: HAMessage) => void;

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
              pending.reject(result.result);
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

  async getCalendars(): Promise<CalendarInfo[]> {
    const result = await this.sendMessage({ type: 'calendars/list' }) as Array<{
      entity_id: string;
      name: string;
    }>;

    return result.map((cal, index) => ({
      id: cal.entity_id,
      name: cal.name,
      color: getCalendarColor(index),
    }));
  }

  async getEvents(calendarId: string, start: string, end: string): Promise<CalendarEvent[]> {
    const result = await this.sendMessage({
      type: 'calendars/list_events',
      entity_id: calendarId,
      start_date_time: start,
      end_date_time: end,
    }) as { events: Array<{
      uid?: string;
      summary: string;
      start: string | { dateTime: string; date: string };
      end: string | { dateTime: string; date: string };
      description?: string;
      recurrence_id?: string;
    }> };

    return (result.events || []).map((ev, i) => {
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

  async updateEvent(calendarId: string, uid: string, event: {
    summary?: string;
    start_date_time?: string;
    end_date_time?: string;
    start_date?: string;
    end_date?: string;
    description?: string;
  }): Promise<void> {
    await this.sendMessage({
      type: 'call_service',
      domain: 'calendar',
      service: 'update_event',
      target: { entity_id: calendarId },
      service_data: { uid, ...event },
    });
  }

  async deleteEvent(calendarId: string, uid: string): Promise<void> {
    await this.sendMessage({
      type: 'call_service',
      domain: 'calendar',
      service: 'delete_event',
      target: { entity_id: calendarId },
      service_data: { uid },
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
