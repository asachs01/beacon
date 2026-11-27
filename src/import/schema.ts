/**
 * Strict shape for a Home Assistant conversation-agent reply.
 * Unknown keys and wrong types are rejected so a chatty answer falls
 * back to the local parser instead of being trusted.
 */
import { isCalendarKey } from './calendar';
import type { ParsedEvent, ParsedImport, ParsedItem } from './parse';

const ROOT_KEYS = new Set(['events', 'items']);
const EVENT_KEYS = new Set(['title', 'date', 'allDay', 'start', 'end', 'location', 'notes']);
const ITEM_KEYS = new Set(['title', 'list']);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function nullableText(value: unknown, max: number): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) return undefined;
  return trimmed;
}

function timeOrNull(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!TIME_RE.test(trimmed)) return undefined;
  return trimmed;
}

function eventFrom(value: unknown): ParsedEvent | null {
  if (!isRecord(value) || !onlyKeys(value, EVENT_KEYS)) return null;
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 200) return null;
  if (typeof value.date !== 'string' || !isCalendarKey(value.date)) return null;
  if (typeof value.allDay !== 'boolean') return null;
  const start = timeOrNull(value.start);
  const end = timeOrNull(value.end);
  const location = nullableText(value.location, 120);
  const notes = nullableText(value.notes, 500);
  if (start === undefined || end === undefined || location === undefined || notes === undefined) return null;
  if (value.allDay && (start != null || end != null)) return null;
  if (!value.allDay && start == null) return null;
  return {
    title: value.title.trim(),
    date: value.date,
    allDay: value.allDay,
    startTime: start,
    endTime: end,
    location,
    notes,
  };
}

function itemFrom(value: unknown): ParsedItem | null {
  if (!isRecord(value) || !onlyKeys(value, ITEM_KEYS)) return null;
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 200) return null;
  if (value.list !== 'grocery' && value.list !== 'todo') return null;
  return { title: value.title.trim(), list: value.list };
}

/** Returns the parsed import, or null when the value does not match the schema. */
export function validateMagicImport(value: unknown): ParsedImport | null {
  if (!isRecord(value) || !onlyKeys(value, ROOT_KEYS)) return null;
  if (!Array.isArray(value.events) || !Array.isArray(value.items)) return null;
  const events: ParsedEvent[] = [];
  for (const entry of value.events) {
    const event = eventFrom(entry);
    if (!event) return null;
    events.push(event);
  }
  const items: ParsedItem[] = [];
  for (const entry of value.items) {
    const item = itemFrom(entry);
    if (!item) return null;
    items.push(item);
  }
  return { events, items };
}

/** Pull a JSON object out of an agent reply, including a fenced block. */
export function jsonFromAgentText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : trimmed).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
