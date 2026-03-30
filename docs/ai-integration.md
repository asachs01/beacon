# AI and Voice Control Integration

Beacon supports three approaches for voice and AI control, ranging from a simple built-in keyword API to full LLM agent tooling. Choose the one that fits your setup.

| Approach | Best for | Requires LLM? | Setup |
|----------|----------|----------------|-------|
| [Voice API](#voice-api) | Quick automations, custom UIs | No | None (built-in) |
| [MCP Server](#mcp-server) | Claude Code, LLM agents | Yes | Config file |
| [HA Custom Sentences](#ha-custom-sentences) | Home Assistant Assist voice | No | Script install |

---

## Voice API

Beacon's server exposes a built-in REST endpoint for natural-language commands. It uses simple keyword matching (no LLM required) and runs entirely on the add-on container.

### Endpoint

```
POST /beacon-action/voice
Content-Type: application/json

{ "text": "add milk to the grocery list" }
```

### Response format

```json
{
  "response": "Added milk to grocery",
  "action": "add_item",
  "entity_id": "todo.grocery",
  "success": true
}
```

### Supported commands

#### List management

| Say | What happens |
|-----|-------------|
| `add <item> to <list>` | Adds an item to a todo list (fuzzy name match) |
| `check off <item>` / `mark <item> as done` | Marks a todo item as completed |
| `complete <item>` / `finish <item>` | Same as above |

```bash
# Add an item
curl -X POST http://<beacon-host>:8099/beacon-action/voice \
  -H 'Content-Type: application/json' \
  -d '{"text": "add eggs to the grocery list"}'

# Complete a chore
curl -X POST http://<beacon-host>:8099/beacon-action/voice \
  -H 'Content-Type: application/json' \
  -d '{"text": "mark dishes as done"}'
```

#### Media control

| Say | What happens |
|-----|-------------|
| `play` / `play music` / `resume music` | Plays the active media player |
| `pause` / `stop music` / `pause music` | Pauses the active media player |
| `next song` / `skip` / `next track` | Skips to the next track |
| `set volume to 50` / `volume 75` | Sets volume (0-100) |

The voice API automatically finds the best media player: it prefers one that is currently playing, then paused, then falls back to the first available.

```bash
curl -X POST http://<beacon-host>:8099/beacon-action/voice \
  -H 'Content-Type: application/json' \
  -d '{"text": "set volume to 40"}'
```

#### Navigation

| Say | What happens |
|-----|-------------|
| `show <view>` / `open <view>` / `go to <view>` | Navigates the Beacon UI |

Valid views: `dashboard`, `calendar`, `grocery`, `chores`, `music`, `photos`, `settings`.

```bash
curl -X POST http://<beacon-host>:8099/beacon-action/voice \
  -H 'Content-Type: application/json' \
  -d '{"text": "show the calendar"}'
```

#### Information queries

| Say | What happens |
|-----|-------------|
| `what's on today` / `today's schedule` | Fetches today's calendar events |
| `what's the weather` / `weather today` | Returns current weather |

```bash
curl -X POST http://<beacon-host>:8099/beacon-action/voice \
  -H 'Content-Type: application/json' \
  -d '{"text": "what'\''s on my calendar"}'
```

### How it works

The voice API uses regex-based intent matching against the input text. No LLM, no cloud service, and no latency beyond the HA API call. The matching is case-insensitive and handles common phrasings for each intent.

When a list or media player command is recognized, Beacon resolves the entity by fuzzy-matching the friendly name or entity ID against all available HA entities.

---

## MCP Server

The MCP (Model Context Protocol) server exposes Beacon's features as structured tools that LLM agents (Claude Code, Claude Desktop, etc.) can call directly. This is the best approach for AI-powered automation where the LLM decides which actions to take.

### Setup

Add the Beacon MCP server to your client's configuration. For Claude Code:

```bash
claude mcp add beacon -- node /path/to/beacon/mcp-server.cjs
```

Or add it to your MCP config file (`mcp-config.json`):

```json
{
  "mcpServers": {
    "beacon": {
      "command": "node",
      "args": ["beacon/mcp-server.cjs"],
      "env": {
        "SUPERVISOR_TOKEN": "your-long-lived-access-token",
        "HA_URL": "http://supervisor/core"
      }
    }
  }
}
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPERVISOR_TOKEN` | (none) | **Required.** A Home Assistant long-lived access token |
| `HA_URL` | `http://supervisor/core` | HA base URL. Change this if running outside the add-on container |
| `DATA_DIR` | `/data` | Path to Beacon's persistent data directory (for chore data) |

To create a long-lived access token: open your HA profile page (click your name in the sidebar), scroll to "Long-lived access tokens", and create one.

### Available tools

The MCP server exposes 10 tools. All tool names are prefixed with `beacon_`.

#### List tools

**`beacon_add_list_item`** -- Add an item to a todo list.

```json
{ "list_name": "grocery", "item": "milk" }
```

**`beacon_get_list_items`** -- Get all items from a todo list.

```json
{ "list_name": "grocery" }
```

**`beacon_check_item`** -- Mark a list item as completed.

```json
{ "list_name": "grocery", "item": "milk" }
```

**`beacon_uncheck_item`** -- Mark a list item as needs_action (uncomplete it).

```json
{ "list_name": "grocery", "item": "milk" }
```

List names are resolved by fuzzy match. You can pass a friendly name (`"grocery"`) or an entity ID (`"todo.shopping_list"`).

#### Calendar tools

**`beacon_get_calendar`** -- Get events for today and optionally upcoming days.

```json
{ "days_ahead": 3 }
```

`days_ahead` defaults to 0 (today only). Events from all calendars are returned.

**`beacon_create_event`** -- Create a calendar event.

```json
{
  "calendar": "family",
  "summary": "Dentist appointment",
  "start": "2026-04-01T10:00:00",
  "end": "2026-04-01T11:00:00"
}
```

For all-day events, use date strings and set `all_day: true`:

```json
{
  "calendar": "family",
  "summary": "School holiday",
  "start": "2026-04-07",
  "end": "2026-04-08",
  "all_day": true
}
```

#### Media tools

**`beacon_get_media_players`** -- List all media players and their current state.

```json
{}
```

Returns entity IDs, playback state, current track info, volume level, and source for each player.

**`beacon_media_control`** -- Control a media player.

```json
{ "entity_id": "media_player.living_room", "action": "play" }
```

Supported actions: `play`, `pause`, `next`, `previous`, `volume`. For volume, include `volume_level` (0.0 to 1.0):

```json
{ "entity_id": "media_player.living_room", "action": "volume", "volume_level": 0.5 }
```

#### Weather tools

**`beacon_get_weather`** -- Get current weather conditions.

```json
{ "entity_id": "weather.home" }
```

`entity_id` defaults to `weather.home`. Returns temperature, humidity, wind speed, pressure, and forecast.

#### Chore tools

**`beacon_manage_chore`** -- Complete or uncomplete a chore for a family member.

```json
{ "action": "complete", "chore_name": "dishes", "member_name": "Alex" }
```

Reads/writes Beacon's local chore data files (`beacon_chores.json`, `beacon_family_members.json`, `beacon_completions.json` in the data directory).

### Protocol details

The MCP server communicates over stdio using JSON-RPC 2.0. It implements the MCP `2024-11-05` protocol version and supports `initialize`, `tools/list`, `tools/call`, and `ping` methods.

---

## HA Custom Sentences

Beacon ships with custom sentence and intent handler files for [Home Assistant Assist](https://www.home-assistant.io/voice_control/). Once installed, you can use natural voice commands through any HA Assist-enabled device (smart speakers, the HA app, etc.).

### Available intents

| Intent | Example phrases |
|--------|----------------|
| **BeaconAddItem** | "Add milk to the grocery list", "Put eggs on the shopping list" |
| **BeaconCompleteChore** | "Mark dishes as done", "I finished vacuuming" |
| **BeaconCompleteChoreByPerson** | "Alex finished vacuuming", "Sam did the laundry" |
| **BeaconCalendarToday** | "What's on the calendar today", "Any events today" |
| **BeaconCalendarTomorrow** | "What's on the calendar tomorrow" |
| **BeaconShowView** | "Show the dashboard", "Switch to the grocery view" |
| **BeaconSetTimer** | "Set a timer for 5 minutes", "Start a 10 minute timer" |
| **BeaconGroceryList** | "What's on the grocery list", "What do we need from the store" |
| **BeaconChoreStatus** | "What chores are left", "What needs to be done" |

### Installation

Run the included install script on your HA machine:

```bash
# Auto-detect HA config directory
beacon/scripts/install-voice-intents.sh

# Or specify it explicitly
beacon/scripts/install-voice-intents.sh /config
```

This copies two files into your HA config:
- `custom_sentences/en/beacon.yaml` -- sentence patterns that HA Assist will recognize
- `custom_intents/beacon.yaml` -- intent handlers that call HA services in response

After installing, reload the Conversation integration:
**Developer Tools > YAML configuration reloading > Conversation**

### Prerequisites

The intent handlers reference these entities by default:

| Entity | Purpose | How to create |
|--------|---------|---------------|
| `todo.grocery` | Grocery list | Any HA todo integration (Shopping List, Todoist, etc.) |
| `todo.chores` | Chore tracking list | Same as above |
| `calendar.family` | Family calendar | Google Calendar, CalDAV, or Local Calendar integration |
| `timer.beacon_voice` | Voice timer | **Settings > Helpers > + Create Helper > Timer**, name it "Beacon Voice" |

If your entities have different names, edit the installed files in your HA config directory.

### Customizing sentence patterns

The sentence files use HA's [custom sentence syntax](https://www.home-assistant.io/voice_control/custom_sentences/). Key features:

- `[the]` -- optional word (matches with or without "the")
- `{item}` -- captures a text slot
- Multiple sentence patterns per intent

To add your own phrasings, edit `/config/custom_sentences/en/beacon.yaml`. For example, to add a Spanish translation, create `/config/custom_sentences/es/beacon.yaml` with the same intent names but Spanish sentence patterns.

### How intent handlers work

Each intent in `custom_intents/beacon.yaml` maps to a Home Assistant service call. For example, `BeaconAddItem` calls `todo.add_item` with the captured `item` and `list_name` slots. Calendar intents use `calendar.get_events` and return a Jinja-templated spoken response summarizing the events.

The `BeaconShowView` intent fires a `beacon_navigate` custom event that the Beacon SPA listens for via the HA WebSocket, allowing voice-driven UI navigation.
