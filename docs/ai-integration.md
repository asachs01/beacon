# AI and Voice Control Integration

This fork includes the authenticated built-in voice API and Home Assistant Assist sentence files. An older MCP interface is described below for reference, but its separate `mcp-server.cjs` executable is **not shipped by this repository** and cannot be enabled as an add-on or standalone Docker setting.

| Approach | Best for | Requires LLM? | Setup |
|----------|----------|----------------|-------|
| [Voice API](#voice-api) | Authenticated commands | No | Parent session and HA entity allowlist |
| [MCP Server](#mcp-server) | Historical interface (not bundled) | Yes | Not currently installable from this fork |
| [HA Custom Sentences](#ha-custom-sentences) | Home Assistant Assist voice | No | Copy two files |

---

## Voice API

Family's server exposes a REST endpoint for natural-language commands. It uses keyword matching (no LLM required). Access it **only** through authenticated Home Assistant ingress (add-on) or the standalone HTTPS reverse proxy; there is no unauthenticated `:8099` listener. A parent session is required for privileged requests; it expires **10 minutes after PIN entry** and is not renewed by app polling. In Docker mode, first authenticate with HTTP Basic username `beacon` and password `BEACON_PASSWORD`, then unlock the parent session with `BEACON_PARENT_PIN` (re-enter it after expiry). The target HA entities must be listed in `allowed_entities` (add-on) or `BEACON_ALLOWED_ENTITIES` (Docker).

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

Post the JSON payload to `/beacon-action/voice` from a signed-in parent session on Family's **same origin**. Do not embed the HTTP Basic password or parent PIN in a script or browser URL.

#### Media control

| Say | What happens |
|-----|-------------|
| `play` / `play music` / `resume music` | Plays the active media player |
| `pause` / `stop music` / `pause music` | Pauses the active media player |
| `next song` / `skip` / `next track` | Skips to the next track |
| `set volume to 50` / `volume 75` | Sets volume (0-100) |

The voice API automatically finds the best media player: it prefers one that is currently playing, then paused, then falls back to the first available.

Media commands require the target `media_player.*` entity in the configured allowlist.

#### Navigation

| Say | What happens |
|-----|-------------|
| `show <view>` / `open <view>` / `go to <view>` | Navigates the Beacon UI |

Valid views: `dashboard`, `calendar`, `grocery`, `chores`, `music`, `photos`, `settings`.

Navigation commands use the same authenticated endpoint; no direct add-on port is exposed.

#### Information queries

| Say | What happens |
|-----|-------------|
| `what's on today` / `today's schedule` | Fetches today's calendar events |
| `what's the weather` / `weather today` | Returns current weather |

Information queries are also subject to the HA entity allowlist.

### How it works

The voice API uses regex-based intent matching against the input text. No LLM, no cloud service, and no latency beyond the HA API call. The matching is case-insensitive and handles common phrasings for each intent.

When a list or media player command is recognized, Beacon resolves the entity by fuzzy-matching the friendly name or entity ID against all available HA entities.

---

## MCP Server

The MCP description below refers to a **separate, historical process**, not Family's Node web server. This fork does not contain the referenced `mcp-server.cjs`, and neither the source-built add-on nor the published Docker image exposes an MCP port. Do not use the legacy MCP variables as standalone Family credentials.

### Standalone Family configuration (not an MCP setup)

Run the Family web server with server-only `HA_URL` and `HA_TOKEN`, HTTP Basic (`BEACON_PASSWORD`), a separate `BEACON_PARENT_PIN`, and an explicit `BEACON_ALLOWED_ENTITIES` CSV. Set `BEACON_HOST=0.0.0.0` **inside Docker** and publish its host port only on `127.0.0.1`, behind an HTTPS reverse proxy for remote access. `SUPERVISOR_TOKEN` belongs to Supervisor-managed add-ons; it is **not** a standalone Family setting. See [Installation](https://beacon-family-docs.netlify.app/docs/getting-started/installation/) for the supported run commands.

### Historical MCP tool interface (not currently bundled)

The former MCP interface listed 10 `beacon_`-prefixed tools. These descriptions are archival, not a currently deployable server.

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

### Historical protocol details

The earlier MCP design used stdio with JSON-RPC 2.0 and the `2024-11-05` protocol version (`initialize`, `tools/list`, `tools/call`, and `ping`). It is not available as a standalone Family web-server endpoint in this fork.

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

Copy the two files from this repository into your Home Assistant config folder (with the File editor or Samba add-on, or over SSH):

- [`custom_sentences/en/beacon.yaml`](https://github.com/f1f1f1f1f1f1/Family/blob/main/custom_sentences/en/beacon.yaml) to `/config/custom_sentences/en/beacon.yaml` -- sentence patterns that HA Assist will recognize
- [`custom_intents/beacon.yaml`](https://github.com/f1f1f1f1f1f1/Family/blob/main/custom_intents/beacon.yaml) to `/config/custom_intents/beacon.yaml` -- intent handlers that call HA services in response

HA loads `custom_sentences/` by itself, but not the intent handlers: add this line to `/config/configuration.yaml`:

```yaml
intent_script: !include custom_intents/beacon.yaml
```

Then restart Home Assistant (**Settings > System > Restart**).

The add-on doesn't install these for you: it has no access to Home Assistant's config folder.

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
