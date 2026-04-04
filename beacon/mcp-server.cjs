#!/usr/bin/env node
/**
 * Beacon MCP Server — JSON-RPC 2.0 over stdio (no dependencies).
 *
 * Exposes Beacon / Home Assistant features as MCP tools so an LLM agent
 * can control lists, calendars, media players, weather, and chores.
 *
 * Environment variables:
 *   SUPERVISOR_TOKEN  — HA long-lived access token (required)
 *   HA_URL            — HA base URL (default: http://supervisor/core)
 *   DATA_DIR          — Beacon persistent data dir (default: /data)
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || '';
const HA_URL = (process.env.HA_URL || 'http://supervisor/core').replace(/\/+$/, '');
const DATA_DIR = process.env.DATA_DIR || '/data';

const MCP_SERVER_INFO = {
  name: 'beacon',
  version: '1.0.0',
};

// ---------------------------------------------------------------------------
// Logging (stderr only — stdout is reserved for JSON-RPC)
// ---------------------------------------------------------------------------

function log(...args) {
  process.stderr.write(`[beacon-mcp] ${args.join(' ')}\n`);
}

// ---------------------------------------------------------------------------
// HTTP helper — call the HA REST API
// ---------------------------------------------------------------------------

function haRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${HA_URL}${apiPath}`);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    const bodyBuf = body != null ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    if (bodyBuf) {
      options.headers['Content-Length'] = bodyBuf.length;
    }

    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        if (res.statusCode >= 400) {
          reject(new Error(`HA API ${res.statusCode}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`));
        } else {
          resolve(parsed);
        }
      });
    });

    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Entity ID resolution helpers
// ---------------------------------------------------------------------------

/** Convert a friendly list name like "grocery" or "shopping list" to a todo.* entity_id. */
async function resolveListEntityId(listName) {
  const states = await haRequest('GET', '/api/states');
  const todos = states.filter(
    (s) => s.entity_id.startsWith('todo.') && s.state !== 'unavailable'
  );

  // Try exact entity_id match first
  const exact = todos.find((s) => s.entity_id === listName || s.entity_id === `todo.${listName}`);
  if (exact) return exact.entity_id;

  // Fuzzy match on friendly_name
  const lower = listName.toLowerCase();
  const match = todos.find(
    (s) =>
      (s.attributes.friendly_name || '').toLowerCase().includes(lower) ||
      s.entity_id.toLowerCase().includes(lower.replace(/\s+/g, '_'))
  );
  if (match) return match.entity_id;

  throw new Error(
    `No todo list matching "${listName}". Available: ${todos.map((s) => s.attributes.friendly_name || s.entity_id).join(', ')}`
  );
}

/** Convert a friendly calendar name to a calendar.* entity_id. */
async function resolveCalendarEntityId(calendarName) {
  const calendars = await haRequest('GET', '/api/calendars');

  const exact = calendars.find(
    (c) => c.entity_id === calendarName || c.entity_id === `calendar.${calendarName}`
  );
  if (exact) return exact.entity_id;

  const lower = calendarName.toLowerCase();
  const match = calendars.find(
    (c) =>
      (c.name || '').toLowerCase().includes(lower) ||
      c.entity_id.toLowerCase().includes(lower.replace(/\s+/g, '_'))
  );
  if (match) return match.entity_id;

  throw new Error(
    `No calendar matching "${calendarName}". Available: ${calendars.map((c) => c.name || c.entity_id).join(', ')}`
  );
}

// ---------------------------------------------------------------------------
// Chore data helpers (reads/writes JSON files in DATA_DIR)
// ---------------------------------------------------------------------------

function loadJson(filename) {
  const fp = path.join(DATA_DIR, filename);
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return [];
  }
}

function saveJson(filename, data) {
  const fp = path.join(DATA_DIR, filename);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch { /* ignore */ }
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

/** Calculate a member's balance: total earned from completed chores minus payouts. */
function calculateBalance(memberId) {
  const chores = loadJson('beacon_chores.json');
  const completions = loadJson('beacon_completions.json');
  const payouts = loadJson('beacon_payouts.json');

  const choreMap = new Map(chores.map((c) => [c.id, c]));

  const earned = completions
    .filter((c) => c.member_id === memberId)
    .reduce((sum, c) => {
      const chore = choreMap.get(c.chore_id);
      return sum + (chore ? chore.value_cents || 0 : 0);
    }, 0);

  const paid = payouts
    .filter((p) => p.member_id === memberId)
    .reduce((sum, p) => sum + p.amount_cents, 0);

  return earned - paid;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'beacon_add_list_item',
    description: 'Add an item to a grocery or todo list in Home Assistant.',
    inputSchema: {
      type: 'object',
      properties: {
        list_name: { type: 'string', description: 'Name or entity_id of the todo list (e.g. "grocery", "todo.shopping_list")' },
        item: { type: 'string', description: 'The item text to add' },
      },
      required: ['list_name', 'item'],
    },
  },
  {
    name: 'beacon_get_list_items',
    description: 'Get all items from a grocery or todo list.',
    inputSchema: {
      type: 'object',
      properties: {
        list_name: { type: 'string', description: 'Name or entity_id of the todo list' },
      },
      required: ['list_name'],
    },
  },
  {
    name: 'beacon_check_item',
    description: 'Mark a list item as completed.',
    inputSchema: {
      type: 'object',
      properties: {
        list_name: { type: 'string', description: 'Name or entity_id of the todo list' },
        item: { type: 'string', description: 'The item text to mark as completed' },
      },
      required: ['list_name', 'item'],
    },
  },
  {
    name: 'beacon_uncheck_item',
    description: 'Mark a list item as needs_action (uncomplete it).',
    inputSchema: {
      type: 'object',
      properties: {
        list_name: { type: 'string', description: 'Name or entity_id of the todo list' },
        item: { type: 'string', description: 'The item text to uncheck' },
      },
      required: ['list_name', 'item'],
    },
  },
  {
    name: 'beacon_get_calendar',
    description: "Get calendar events for today (and optionally upcoming days).",
    inputSchema: {
      type: 'object',
      properties: {
        days_ahead: { type: 'number', description: 'Number of days ahead to fetch (default 0 = today only)' },
      },
    },
  },
  {
    name: 'beacon_create_event',
    description: 'Create a calendar event in Home Assistant.',
    inputSchema: {
      type: 'object',
      properties: {
        calendar: { type: 'string', description: 'Calendar name or entity_id' },
        summary: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start time (ISO 8601 datetime or YYYY-MM-DD for all-day)' },
        end: { type: 'string', description: 'End time (ISO 8601 datetime or YYYY-MM-DD for all-day)' },
        all_day: { type: 'boolean', description: 'Whether this is an all-day event' },
      },
      required: ['calendar', 'summary', 'start', 'end'],
    },
  },
  {
    name: 'beacon_get_media_players',
    description: 'List all media players and their current states.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'beacon_media_control',
    description: 'Control a media player (play, pause, next, previous, volume).',
    inputSchema: {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'The media_player.* entity_id' },
        action: {
          type: 'string',
          enum: ['play', 'pause', 'next', 'previous', 'volume'],
          description: 'The control action',
        },
        volume_level: { type: 'number', description: 'Volume level 0.0-1.0 (required when action is "volume")' },
      },
      required: ['entity_id', 'action'],
    },
  },
  {
    name: 'beacon_get_weather',
    description: 'Get current weather from Home Assistant.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'Weather entity (default: weather.home)' },
      },
    },
  },
  {
    name: 'beacon_manage_chore',
    description: 'Complete or uncomplete a chore for a family member. Reads/writes Beacon chore data.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['complete', 'uncomplete'], description: 'complete or uncomplete' },
        chore_name: { type: 'string', description: 'Name of the chore' },
        member_name: { type: 'string', description: 'Name of the family member' },
      },
      required: ['action', 'chore_name', 'member_name'],
    },
  },
  {
    name: 'beacon_create_chore',
    description: 'Create a new chore. Assign it to family members by name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Chore name (e.g. "Make bed", "Feed the dog")' },
        assigned_to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Family member names to assign this chore to',
        },
        frequency: { type: 'string', enum: ['daily', 'weekly', 'once'], description: 'How often (default: daily)' },
        max_completions: { type: 'number', description: 'Max times per frequency period (e.g. 3 = can earn up to 3x/week). Omit or null for unlimited.' },
        value_cents: { type: 'number', description: 'Payout value in cents (default: 0)' },
        icon: { type: 'string', description: 'Emoji icon (default: 🧹)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'beacon_update_chore',
    description: 'Update an existing chore by name or ID.',
    inputSchema: {
      type: 'object',
      properties: {
        chore_name: { type: 'string', description: 'Name (or ID) of the chore to update' },
        name: { type: 'string', description: 'New name' },
        assigned_to: { type: 'array', items: { type: 'string' }, description: 'New assigned member names' },
        frequency: { type: 'string', enum: ['daily', 'weekly', 'once'] },
        max_completions: { type: 'number', description: 'Max times per frequency period. Set to 0 or null to remove limit.' },
        value_cents: { type: 'number' },
        icon: { type: 'string' },
      },
      required: ['chore_name'],
    },
  },
  {
    name: 'beacon_delete_chore',
    description: 'Delete a chore by name or ID.',
    inputSchema: {
      type: 'object',
      properties: {
        chore_name: { type: 'string', description: 'Name (or ID) of the chore to delete' },
      },
      required: ['chore_name'],
    },
  },
  {
    name: 'beacon_list_chores',
    description: 'List all chores with their definitions and today\'s completion status. Includes balance info per child member.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'beacon_get_balances',
    description: 'Get each child family member\'s current chore earnings balance (earned minus payouts).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'beacon_process_payout',
    description: 'Process a payout for a specific child, zeroing their balance and creating a payout record.',
    inputSchema: {
      type: 'object',
      properties: {
        member_name: { type: 'string', description: 'Name of the child to pay out' },
        parent_name: { type: 'string', description: 'Name of the parent processing the payout' },
      },
      required: ['member_name', 'parent_name'],
    },
  },
  {
    name: 'beacon_list_family_members',
    description: 'List all family members (name, role, avatar, calendar).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'beacon_get_meal_plan',
    description: 'Get meal plan entries from the Beacon data store. Returns meals for today by default, or a date range.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date to fetch (YYYY-MM-DD, default: today)' },
        days: { type: 'number', description: 'Number of days to include (default: 1)' },
      },
    },
  },
  {
    name: 'beacon_set_meal_plan',
    description: 'Write meal plan entries to the Beacon data store. Used by sync scripts to populate meal data from AnyList or other sources.',
    inputSchema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              meal_type: { type: 'string', enum: ['Breakfast', 'Lunch', 'Dinner', 'Snack'] },
              name: { type: 'string', description: 'Meal name' },
              recipe_id: { type: 'string', description: 'Optional recipe ID' },
            },
            required: ['date', 'meal_type', 'name'],
          },
          description: 'Array of meal plan entries to store',
        },
      },
      required: ['entries'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleTool(name, args) {
  switch (name) {
    // ---- Lists ----
    case 'beacon_add_list_item': {
      const entityId = await resolveListEntityId(args.list_name);
      await haRequest('POST', '/api/services/todo/add_item', {
        entity_id: entityId,
        item: args.item,
      });
      return { success: true, message: `Added "${args.item}" to ${entityId}` };
    }

    case 'beacon_get_list_items': {
      const entityId = await resolveListEntityId(args.list_name);
      const resp = await haRequest('POST', '/api/services/todo/get_items?return_response', {
        entity_id: entityId,
      });
      const items = resp?.service_response?.[entityId]?.items || [];
      return { entity_id: entityId, items };
    }

    case 'beacon_check_item': {
      const entityId = await resolveListEntityId(args.list_name);
      await haRequest('POST', '/api/services/todo/update_item', {
        entity_id: entityId,
        item: args.item,
        status: 'completed',
      });
      return { success: true, message: `Checked off "${args.item}" in ${entityId}` };
    }

    case 'beacon_uncheck_item': {
      const entityId = await resolveListEntityId(args.list_name);
      await haRequest('POST', '/api/services/todo/update_item', {
        entity_id: entityId,
        item: args.item,
        status: 'needs_action',
      });
      return { success: true, message: `Unchecked "${args.item}" in ${entityId}` };
    }

    // ---- Calendar ----
    case 'beacon_get_calendar': {
      const daysAhead = args.days_ahead ?? 0;
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + daysAhead + 1);

      const startStr = start.toISOString();
      const endStr = end.toISOString();

      const calendars = await haRequest('GET', '/api/calendars');
      const results = {};

      for (const cal of calendars) {
        try {
          const events = await haRequest(
            'GET',
            `/api/calendars/${cal.entity_id}?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`
          );
          if (events && events.length > 0) {
            results[cal.name || cal.entity_id] = events;
          }
        } catch {
          // skip unavailable calendars
        }
      }

      return { start: startStr, end: endStr, calendars: results };
    }

    case 'beacon_create_event': {
      const entityId = await resolveCalendarEntityId(args.calendar);
      const serviceData = {
        entity_id: entityId,
        summary: args.summary,
      };

      if (args.all_day) {
        serviceData.start_date = args.start;
        serviceData.end_date = args.end;
      } else {
        serviceData.start_date_time = args.start;
        serviceData.end_date_time = args.end;
      }

      await haRequest('POST', '/api/services/calendar/create_event', serviceData);
      return { success: true, message: `Created event "${args.summary}" on ${entityId}` };
    }

    // ---- Media Players ----
    case 'beacon_get_media_players': {
      const states = await haRequest('GET', '/api/states');
      const players = states
        .filter((s) => s.entity_id.startsWith('media_player.'))
        .map((s) => ({
          entity_id: s.entity_id,
          state: s.state,
          friendly_name: s.attributes.friendly_name,
          media_title: s.attributes.media_title || null,
          media_artist: s.attributes.media_artist || null,
          volume_level: s.attributes.volume_level ?? null,
          source: s.attributes.source || null,
        }));
      return { players };
    }

    case 'beacon_media_control': {
      const { entity_id, action, volume_level } = args;
      const serviceMap = {
        play: 'media_play',
        pause: 'media_pause',
        next: 'media_next_track',
        previous: 'media_previous_track',
        volume: 'volume_set',
      };

      const service = serviceMap[action];
      if (!service) throw new Error(`Unknown media action: ${action}`);

      const data = { entity_id };
      if (action === 'volume') {
        if (volume_level == null) throw new Error('volume_level is required for volume action');
        data.volume_level = volume_level;
      }

      await haRequest('POST', `/api/services/media_player/${service}`, data);
      return { success: true, message: `${action} on ${entity_id}` };
    }

    // ---- Weather ----
    case 'beacon_get_weather': {
      const entityId = args.entity_id || 'weather.home';
      const states = await haRequest('GET', '/api/states');
      const weather = states.find((s) => s.entity_id === entityId);
      if (!weather) throw new Error(`Weather entity "${entityId}" not found`);
      return {
        entity_id: weather.entity_id,
        state: weather.state,
        temperature: weather.attributes.temperature,
        temperature_unit: weather.attributes.temperature_unit,
        humidity: weather.attributes.humidity,
        wind_speed: weather.attributes.wind_speed,
        wind_bearing: weather.attributes.wind_bearing,
        pressure: weather.attributes.pressure,
        forecast: weather.attributes.forecast || [],
      };
    }

    // ---- Chores ----
    case 'beacon_manage_chore': {
      const { action, chore_name, member_name } = args;
      const chores = loadJson('beacon_chores.json');
      const members = loadJson('beacon_family_members.json');
      let completions = loadJson('beacon_completions.json');

      // Find the chore by name (case-insensitive)
      const chore = chores.find(
        (c) => c.name.toLowerCase() === chore_name.toLowerCase()
      );
      if (!chore) {
        return {
          success: false,
          error: `Chore "${chore_name}" not found. Available: ${chores.map((c) => c.name).join(', ') || '(none)'}`,
        };
      }

      // Find the member by name (case-insensitive)
      const member = members.find(
        (m) => m.name.toLowerCase() === member_name.toLowerCase()
      );
      if (!member) {
        return {
          success: false,
          error: `Member "${member_name}" not found. Available: ${members.map((m) => m.name).join(', ') || '(none)'}`,
        };
      }

      if (action === 'complete') {
        // Enforce max_completions per period
        if (chore.max_completions) {
          const now = new Date();
          let periodStart;
          if (chore.frequency === 'daily') {
            periodStart = now.toISOString().slice(0, 10);
          } else if (chore.frequency === 'weekly') {
            const d = new Date(now);
            d.setDate(d.getDate() - d.getDay());
            periodStart = d.toISOString().slice(0, 10);
          }
          if (periodStart) {
            const periodCount = completions.filter(
              (c) => c.chore_id === chore.id && c.member_id === member.id && c.completed_at.slice(0, 10) >= periodStart
            ).length;
            if (periodCount >= chore.max_completions) {
              return {
                success: false,
                error: `${member.name} has already completed "${chore.name}" ${periodCount}/${chore.max_completions} times this ${chore.frequency === 'daily' ? 'day' : 'week'}`,
              };
            }
          }
        }

        const completion = {
          chore_id: chore.id,
          member_id: member.id,
          completed_at: new Date().toISOString(),
        };
        completions.push(completion);
        saveJson('beacon_completions.json', completions);
        return { success: true, message: `${member.name} completed "${chore.name}"` };
      }

      if (action === 'uncomplete') {
        const before = completions.length;
        completions = completions.filter(
          (c) => !(c.chore_id === chore.id && c.member_id === member.id)
        );
        saveJson('beacon_completions.json', completions);
        return {
          success: true,
          message: `Uncompleted "${chore.name}" for ${member.name}`,
          removed: before - completions.length,
        };
      }

      throw new Error(`Unknown action: ${action}`);
    }

    case 'beacon_create_chore': {
      const chores = loadJson('beacon_chores.json');
      const members = loadJson('beacon_family_members.json');

      // Check for duplicate name
      if (chores.some((c) => c.name.toLowerCase() === args.name.toLowerCase())) {
        return { success: false, error: `Chore "${args.name}" already exists` };
      }

      // Resolve assigned member names to IDs
      const assignedIds = [];
      for (const memberName of (args.assigned_to || [])) {
        const member = members.find(
          (m) => m.name.toLowerCase() === memberName.toLowerCase()
        );
        if (!member) {
          return {
            success: false,
            error: `Member "${memberName}" not found. Available: ${members.map((m) => m.name).join(', ') || '(none)'}`,
          };
        }
        assignedIds.push(member.id);
      }

      const newChore = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: args.name,
        assigned_to: assignedIds,
        frequency: args.frequency || 'daily',
        max_completions: args.max_completions || undefined,
        value_cents: args.value_cents || 0,
        icon: args.icon || '🧹',
      };

      chores.push(newChore);
      saveJson('beacon_chores.json', chores);
      return { success: true, chore: newChore };
    }

    case 'beacon_update_chore': {
      const chores = loadJson('beacon_chores.json');
      const members = loadJson('beacon_family_members.json');
      const idx = chores.findIndex(
        (c) => c.name.toLowerCase() === args.chore_name.toLowerCase() || c.id === args.chore_name
      );
      if (idx === -1) {
        return {
          success: false,
          error: `Chore "${args.chore_name}" not found. Available: ${chores.map((c) => c.name).join(', ') || '(none)'}`,
        };
      }

      if (args.name) chores[idx].name = args.name;
      if (args.frequency) chores[idx].frequency = args.frequency;
      if (args.max_completions !== undefined) {
        chores[idx].max_completions = args.max_completions || undefined; // 0/null removes limit
      }
      if (args.value_cents !== undefined) chores[idx].value_cents = args.value_cents;
      if (args.icon) chores[idx].icon = args.icon;

      if (args.assigned_to) {
        const assignedIds = [];
        for (const memberName of args.assigned_to) {
          const member = members.find(
            (m) => m.name.toLowerCase() === memberName.toLowerCase()
          );
          if (!member) {
            return { success: false, error: `Member "${memberName}" not found` };
          }
          assignedIds.push(member.id);
        }
        chores[idx].assigned_to = assignedIds;
      }

      saveJson('beacon_chores.json', chores);
      return { success: true, chore: chores[idx] };
    }

    case 'beacon_delete_chore': {
      const chores = loadJson('beacon_chores.json');
      const idx = chores.findIndex(
        (c) => c.name.toLowerCase() === args.chore_name.toLowerCase() || c.id === args.chore_name
      );
      if (idx === -1) {
        return {
          success: false,
          error: `Chore "${args.chore_name}" not found. Available: ${chores.map((c) => c.name).join(', ') || '(none)'}`,
        };
      }
      const removed = chores.splice(idx, 1)[0];
      saveJson('beacon_chores.json', chores);

      // Also clean up completions for this chore
      let completions = loadJson('beacon_completions.json');
      completions = completions.filter((c) => c.chore_id !== removed.id);
      saveJson('beacon_completions.json', completions);

      return { success: true, message: `Deleted chore "${removed.name}"` };
    }

    case 'beacon_list_chores': {
      const chores = loadJson('beacon_chores.json');
      const members = loadJson('beacon_family_members.json');
      const completions = loadJson('beacon_completions.json');

      // Filter to today's completions
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayCompletions = completions.filter(
        (c) => c.completed_at && c.completed_at.startsWith(todayStr)
      );

      // Also compute period completions for chores with max_completions
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      const weekStartStr = weekStart.toISOString().slice(0, 10);

      const result = chores.map((chore) => {
        const entry = {
          ...chore,
          assigned_to_names: chore.assigned_to
            .map((id) => members.find((m) => m.id === id)?.name || id),
          completed_today_by: todayCompletions
            .filter((c) => c.chore_id === chore.id)
            .map((c) => members.find((m) => m.id === c.member_id)?.name || c.member_id),
        };
        // Add period completion counts when max_completions is set
        if (chore.max_completions) {
          const periodStart = chore.frequency === 'daily' ? todayStr : weekStartStr;
          const periodCompletions = completions.filter(
            (c) => c.chore_id === chore.id && c.completed_at.slice(0, 10) >= periodStart
          );
          entry.period_completions = {};
          for (const memberId of chore.assigned_to) {
            const name = members.find((m) => m.id === memberId)?.name || memberId;
            const count = periodCompletions.filter((c) => c.member_id === memberId).length;
            entry.period_completions[name] = `${count}/${chore.max_completions}`;
          }
        }
        return entry;
      });

      // Add balance info for child members
      const kidBalances = {};
      for (const member of members) {
        if (member.role === 'child') {
          const bal = calculateBalance(member.id);
          if (bal > 0) {
            kidBalances[member.name] = { balance_cents: bal, balance_display: `$${(bal / 100).toFixed(2)}` };
          }
        }
      }

      return { chores: result, member_balances: kidBalances };
    }

    case 'beacon_get_balances': {
      const members = loadJson('beacon_family_members.json');
      const balances = {};
      for (const member of members) {
        if (member.role === 'child') {
          const bal = calculateBalance(member.id);
          balances[member.name] = { member_id: member.id, balance_cents: bal, balance_display: `$${(bal / 100).toFixed(2)}` };
        }
      }
      return { balances };
    }

    case 'beacon_process_payout': {
      const members = loadJson('beacon_family_members.json');

      const child = members.find(
        (m) => m.name.toLowerCase() === args.member_name.toLowerCase() && m.role === 'child'
      );
      if (!child) {
        return { success: false, error: `Child "${args.member_name}" not found. Available: ${members.filter((m) => m.role === 'child').map((m) => m.name).join(', ') || '(none)'}` };
      }

      const parent = members.find(
        (m) => m.name.toLowerCase() === args.parent_name.toLowerCase() && m.role === 'parent'
      );
      if (!parent) {
        return { success: false, error: `Parent "${args.parent_name}" not found. Available: ${members.filter((m) => m.role === 'parent').map((m) => m.name).join(', ') || '(none)'}` };
      }

      const balance = calculateBalance(child.id);
      if (balance <= 0) {
        return { success: false, error: `${child.name} has no balance to pay out (balance: $${(balance / 100).toFixed(2)})` };
      }

      const payouts = loadJson('beacon_payouts.json');
      const newPayout = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        member_id: child.id,
        amount_cents: balance,
        paid_by: parent.id,
        paid_at: new Date().toISOString(),
      };
      payouts.push(newPayout);
      saveJson('beacon_payouts.json', payouts);

      return { success: true, message: `Paid ${child.name} $${(balance / 100).toFixed(2)}`, payout: newPayout };
    }

    case 'beacon_list_family_members': {
      const members = loadJson('beacon_family_members.json');
      return { members };
    }

    case 'beacon_get_meal_plan': {
      const allEntries = loadJson('beacon_meal_plans.json');
      const targetDate = args.date || new Date().toISOString().slice(0, 10);
      const days = args.days || 1;

      // Build date range
      const dates = new Set();
      for (let i = 0; i < days; i++) {
        const d = new Date(targetDate);
        d.setDate(d.getDate() + i);
        dates.add(d.toISOString().slice(0, 10));
      }

      const filtered = allEntries.filter((e) => dates.has(e.date));
      return { date: targetDate, days, entries: filtered };
    }

    case 'beacon_set_meal_plan': {
      const { entries: newEntries } = args;
      if (!Array.isArray(newEntries)) {
        return { success: false, error: 'entries must be an array' };
      }
      // Replace all entries — caller is responsible for sending the full set
      saveJson('beacon_meal_plans.json', newEntries);
      return { success: true, count: newEntries.length };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC / MCP protocol
// ---------------------------------------------------------------------------

function makeResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function makeError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return makeResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: MCP_SERVER_INFO,
      });

    case 'notifications/initialized':
      // Client acknowledgement — no response needed
      return null;

    case 'tools/list':
      return makeResponse(id, { tools: TOOLS });

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      try {
        const result = await handleTool(toolName, toolArgs);
        return makeResponse(id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        });
      } catch (err) {
        return makeResponse(id, {
          content: [
            {
              type: 'text',
              text: `Error: ${err.message}`,
            },
          ],
          isError: true,
        });
      }
    }

    case 'ping':
      return makeResponse(id, {});

    default:
      // Unknown method — if it has an id, return method-not-found
      if (id != null) {
        return makeError(id, -32601, `Method not found: ${method}`);
      }
      // Notifications without id are silently ignored
      return null;
  }
}

// ---------------------------------------------------------------------------
// stdio transport
// ---------------------------------------------------------------------------

function send(obj) {
  const json = JSON.stringify(obj);
  process.stdout.write(json + '\n');
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

let buffer = '';

rl.on('line', async (line) => {
  buffer += line;

  // Try to parse — MCP messages are one JSON object per line
  let msg;
  try {
    msg = JSON.parse(buffer);
    buffer = '';
  } catch {
    // Incomplete JSON — accumulate more lines
    return;
  }

  try {
    const response = await handleMessage(msg);
    if (response) {
      send(response);
    }
  } catch (err) {
    log('Unhandled error:', err.message);
    if (msg.id != null) {
      send(makeError(msg.id, -32603, `Internal error: ${err.message}`));
    }
  }
});

rl.on('close', () => {
  log('stdin closed, shutting down');
  process.exit(0);
});

// Prevent unhandled rejections from crashing the server
process.on('unhandledRejection', (err) => {
  log('Unhandled rejection:', err?.message || err);
});

log('Beacon MCP server started');
log(`HA URL: ${HA_URL}`);
log(`Token: ${SUPERVISOR_TOKEN ? 'configured' : 'NOT configured'}`);
