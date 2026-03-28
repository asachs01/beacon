---
title: "API Reference"
date: 2026-03-26
description: "Technical reference for Beacon's internal APIs — Home Assistant WebSocket, calendar operations, weather, media player, photos, and configuration."
categories: ["docs"]
tags: ["api", "websocket", "reference", "technical"]
slug: "api-reference"
draft: false
---

# API Reference

This document covers the internal APIs that Beacon uses to communicate with Home Assistant and manage data. It is intended for developers who want to understand Beacon's data layer or build extensions.

---

## Home Assistant WebSocket Client

**File**: `src/api/homeassistant.ts`

The `HomeAssistantClient` class manages the WebSocket connection to Home Assistant.

### Constructor

```typescript
const client = new HomeAssistantClient(url: string, token: string);
```

| Parameter | Description |
|-----------|-------------|
| `url` | Home Assistant URL (http/https). Automatically converted to ws/wss and `/api/websocket` is appended. |
| `token` | Long-lived access token or Supervisor token |

### Connection

```typescript
await client.connect();
```

Establishes the WebSocket connection and authenticates. Returns a Promise that resolves when authentication succeeds.

**Auto-reconnect**: If the connection drops, the client automatically reconnects with exponential backoff (1s, 2s, 4s, ... up to 30s).

### Connection status

```typescript
client.isConnected: boolean  // true when authenticated
client.setConnectionChangeHandler((connected: boolean) => void)
```

### Disconnect

```typescript
client.disconnect()
```

Closes the WebSocket, cancels reconnect timer, and clears all pending requests and subscriptions.

---

## Calendar API

### List calendars

```typescript
const calendars: CalendarInfo[] = await client.getCalendars();
```

Sends `{ type: "calendars/list" }` over WebSocket. Returns:

```typescript
interface CalendarInfo {
  id: string;        // entity_id (e.g., "calendar.family")
  name: string;      // Human-readable name
  color: string;     // Assigned color hex
}
```

### List events

```typescript
const events: CalendarEvent[] = await client.getEvents(
  calendarId: string,  // entity_id
  start: string,       // ISO datetime
  end: string          // ISO datetime
);
```

Sends `{ type: "calendars/list_events", entity_id, start_date_time, end_date_time }`. Returns:

```typescript
interface CalendarEvent {
  id: string;             // UID from calendar
  title: string;          // Event summary
  start: string;          // ISO datetime or date string
  end: string;            // ISO datetime or date string
  allDay: boolean;        // true if date-only (no time component)
  description?: string;   // Event description
  calendarId: string;     // Source calendar entity_id
  calendarName: string;   // Source calendar name
  color: string;          // Calendar color (set by consumer)
  recurrence?: RecurrenceFrequency;
  recurrenceEnd?: string;
}
```

### Create event

```typescript
await client.createEvent(calendarId: string, event: {
  summary: string;
  start_date_time?: string;    // For timed events
  end_date_time?: string;      // For timed events
  start_date?: string;         // For all-day events
  end_date?: string;           // For all-day events
  description?: string;
  rrule?: string;              // iCalendar recurrence rule
});
```

Calls `calendar.create_event` service via WebSocket.

**Recurrence rule format**: `FREQ=DAILY|WEEKLY|MONTHLY;UNTIL=YYYYMMDDTHHmmssZ`

### Update event

```typescript
await client.updateEvent(calendarId: string, uid: string, event: {
  summary?: string;
  start_date_time?: string;
  end_date_time?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
});
```

Calls `calendar.update_event` service. The `uid` identifies the specific event instance.

### Delete event

```typescript
await client.deleteEvent(calendarId: string, uid: string);
```

Calls `calendar.delete_event` service.

---

## Weather API

```typescript
const weather: WeatherData = await client.getWeather(entityId: string);
```

Fetches all entity states and extracts the weather entity. Returns:

```typescript
interface WeatherData {
  temperature: number;
  temperatureUnit: string;     // e.g., "°F"
  condition: string;           // HA weather condition string
  humidity?: number;
  windSpeed?: number;
  forecast: ForecastDay[];     // Up to 5 days
}

interface ForecastDay {
  date: string;
  condition: string;
  tempHigh: number;
  tempLow: number;
}
```

**Refresh interval**: 10 minutes (configured in `useWeather.ts`).

---

## Media Player API

**File**: `src/api/music.ts`

### Get all players

```typescript
const players: MediaPlayer[] = await getMediaPlayers(client);
```

Fetches all states and filters to `media_player.*` entities. Returns:

```typescript
interface MediaPlayer {
  entity_id: string;
  friendly_name: string;
  state: 'playing' | 'paused' | 'idle' | 'off' | 'unavailable';
  media_title?: string;
  media_artist?: string;
  media_album_name?: string;
  media_content_id?: string;
  media_duration?: number;      // seconds
  media_position?: number;      // seconds
  entity_picture?: string;      // URL or relative path
  volume_level?: number;        // 0.0 to 1.0
  is_volume_muted?: boolean;
}
```

### Transport controls

```typescript
await play(client, entityId);
await pause(client, entityId);
await next(client, entityId);
await previous(client, entityId);
await setVolume(client, entityId, level);  // 0.0 to 1.0
```

Each calls the corresponding HA service:
- `media_player.media_play`
- `media_player.media_pause`
- `media_player.media_next_track`
- `media_player.media_previous_track`
- `media_player.volume_set`

### Subscribe to state changes

```typescript
const subId = await subscribeToPlayer(client, entityId, (player: MediaPlayer) => {
  // Called on every state change for this entity
});
```

Uses `subscribe_events` for `state_changed` events, filtered to the specific entity.

---

## Photo API

**File**: `src/api/photos.ts`

### Get photos

```typescript
const photos: Photo[] = await getPhotos(sources);
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sources` | `PhotoSource[]` | `['ha_media', 'local']` | Which sources to fetch from |

Returns shuffled array of:

```typescript
interface Photo {
  url: string;
  caption?: string;
  date?: string;
  source: 'local' | 'google_photos' | 'ha_media';
}
```

**Internal fetch methods:**

1. `fetchHAMediaPhotos()`: Calls `GET /api/media_source/browse_media` to list root media items, filters to images.
2. `fetchLocalPhotos()`: Calls `GET /api/media_source/browse_media?media_content_id={photo_directory}` to list photos in the configured directory.

Both methods require the HA token for authentication.

---

## Grocery API (Grocy)

**File**: `src/api/grocy.ts`

The `GrocyClient` class communicates with Grocy through Home Assistant's REST API.

### Get shopping list

```typescript
const list: GroceryList = await grocyClient.getShoppingList();
```

Reads `sensor.grocy_shopping_list` state and parses the `items` attribute.

### Add item

```typescript
await grocyClient.addItem(name: string);
```

Calls `grocy.add_generic` service with `entity_type: 'shopping_list'`.

### Check / uncheck item

```typescript
await grocyClient.checkItem(id: string);
await grocyClient.uncheckItem(id: string);
```

### Get expiring products

```typescript
const items: GroceryItem[] = await grocyClient.getExpiringProducts(days: number);
```

Reads `sensor.grocy_expiring_products` state and filters to products expiring within `days` days.

### Get meal plan

```typescript
const meals: MealPlanEntry[] = await grocyClient.getMealPlan(startDate, endDate);
```

Reads `sensor.grocy_meal_plan` state and filters to the date range.

---

## Grocery API (AnyList)

**File**: `src/api/anylist.ts`

The `AnyListClient` class communicates with AnyList through Home Assistant's todo entities.

### Discover lists

```typescript
const lists: GroceryList[] = await anylistClient.getLists();
```

Auto-discovers `todo.anylist_*` entities by fetching all states.

### Get items

```typescript
const items: GroceryItem[] = await anylistClient.getItems(listId: string);
```

Calls `todo.get_items` service or falls back to reading the entity state directly.

### Add / check / uncheck items

```typescript
await anylistClient.addItem(listId, name);
await anylistClient.checkItem(listId, itemId);
await anylistClient.uncheckItem(listId, itemId);
```

Uses `todo.add_item` and `todo.update_item` services.

---

## Family Store API

**File**: `src/api/family.ts`

The `FamilyStore` class manages family member, chore, completion, streak, and routine data.

### Storage

- **Primary**: Browser localStorage
- **Secondary sync**: HA `input_text.*` helpers (when connected and data < 255 chars)

### LocalStorage keys

| Key | Contents |
|-----|----------|
| `beacon_family_members` | `FamilyMember[]` |
| `beacon_chores` | `Chore[]` |
| `beacon_completions` | `ChoreCompletion[]` |
| `beacon_streaks` | `Streak[]` |
| `beacon_routines` | `Routine[]` |

### Member operations

```typescript
store.getMembers(): FamilyMember[]
store.addMember(member: Omit<FamilyMember, 'id'>): FamilyMember
store.updateMember(id, data): FamilyMember | null
store.removeMember(id): boolean
```

### Chore operations

```typescript
store.getChores(): Chore[]
store.addChore(chore: Omit<Chore, 'id'>): Chore
store.updateChore(id, data): Chore | null
store.removeChore(id): boolean
```

### Completion operations

```typescript
store.getCompletions(): ChoreCompletion[]
store.getCompletionsToday(): ChoreCompletion[]
store.getCompletionsForPeriod(startDate, endDate): ChoreCompletion[]
store.completeChore(choreId, memberId, verifiedBy?): ChoreCompletion
store.uncompleteChore(choreId, memberId): boolean
```

### Streak operations

```typescript
store.getStreaks(): Streak[]
store.getStreakForMember(memberId): Streak
```

Streaks are updated automatically when `completeChore()` is called. The streak logic:
- If `last_completed` was yesterday: `current += 1`
- If `last_completed` was today: no change
- Otherwise: `current = 1`
- `longest = max(longest, current)`

---

## Configuration API

**File**: `src/config.ts`

### getConfig()

```typescript
import { getConfig } from './config';

const config: BeaconConfig = getConfig();
```

Returns the resolved configuration object (cached after first call):

```typescript
interface BeaconConfig {
  ha_url: string;
  ha_token: string;
  family_name: string;
  theme: string;
  auto_dark_mode: boolean;
  weather_entity: string;
  photo_directory: string;
  photo_interval: number;
  screen_saver_timeout: number;
}
```

### Resolution order

For each property, the first non-empty value wins:

1. `window.__BEACON_CONFIG__[property]` (runtime injection by `run.sh`)
2. `import.meta.env.VITE_[PROPERTY]` (Vite build-time environment)
3. Hard-coded default

---

## Event subscription API

### Subscribe to state changes

```typescript
const subId: number = await client.subscribeStateChanges(
  (event: Record<string, unknown>) => {
    const data = event as {
      data?: {
        new_state?: {
          entity_id: string;
          state: string;
          attributes: Record<string, unknown>;
        };
      };
    };
    // Handle state change
  }
);
```

Sends `{ type: "subscribe_events", event_type: "state_changed" }` over WebSocket. The handler fires for every entity state change in HA.

### Unsubscribe

```typescript
client.unsubscribe(subId: number);
```

Removes the local handler. Does not send an unsubscribe message to HA (the WebSocket subscription remains active server-side until the connection closes).

---

## Generic service calls

```typescript
const result = await client.callService(
  domain: string,      // e.g., "calendar", "media_player", "notify"
  service: string,     // e.g., "create_event", "media_play", "notify"
  entityId: string,    // target entity_id
  data?: Record<string, unknown>  // service_data
);
```

Sends a `call_service` message over WebSocket:

```json
{
  "type": "call_service",
  "domain": "calendar",
  "service": "create_event",
  "target": { "entity_id": "calendar.family" },
  "service_data": { "summary": "Test", "start_date": "2026-03-28" }
}
```

---

## Data refresh intervals

| Data | Interval | Trigger |
|------|----------|---------|
| Calendar events | 5 minutes | Also refreshes on create/update/delete |
| Weather | 10 minutes | On connection, then periodic |
| Media players | Real-time | WebSocket subscription (state_changed) |
| Grocery list | 2 minutes | Also refreshes on add/check/uncheck |
| Meal plan | 5 minutes | On connection, then periodic |
| Notifications check | 1 minute | Scans events for 15-min-before window |
| Screen saver check | 10 seconds | Checks idle time |
| Theme auto-switch | 1 minute | Only when theme is set to "auto" |
