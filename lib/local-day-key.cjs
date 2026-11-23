'use strict';

/**
 * Calendar day as "YYYY-MM-DD" in the runtime's local time zone.
 *
 * The MCP server is CommonJS and cannot require src/api/date-keys.ts.
 * This file is that same `localDayKey` so both the SPA and the server share
 * one implementation (src/api/local-day-key.cjs and date-keys.ts re-export it).
 *
 * It lives in lib/ because the add-on runtime image copies lib/ and server.js,
 * not src/. The add-on privilege scheduler requires it from here.
 *
 * How the zone is chosen (same resolution as the local-day fix for meals and
 * chores): Beacon has no timezone of its own. Home Assistant's `time_zone` is
 * not copied into add-on config, and there is no settings timezone. The key
 * uses Date#getFullYear / getMonth / getDate, which follow `process.env.TZ`
 * when it is set and otherwise the server's local zone. Never
 * `toISOString().slice(0, 10)` — that is the UTC date, so an evening in
 * America/Phoenix or late night in America/New_York is already the next day.
 *
 * A bare YYYY-MM-DD is returned unchanged. `new Date('YYYY-MM-DD')` parses as
 * UTC midnight and shifts backward in zones west of UTC. Completions stored
 * as full UTC ISO timestamps are reinterpreted onto the local day; nothing
 * is rewritten. An empty or unparseable value returns "".
 */

const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function localDayKey(value) {
  if (value === undefined) value = new Date();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (BARE_DATE.test(trimmed)) return trimmed;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add calendar days to a YYYY-MM-DD key in the local zone.
 * `new Date(key)` plus `toISOString().slice(0, 10)` repeats a day across the
 * US spring-forward (2026-03-08 in America/New_York).
 */
function addCalendarDays(dayKey, days) {
  const match = BARE_DATE.exec(typeof dayKey === 'string' ? dayKey.trim() : '');
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day + days);
  return localDayKey(date);
}

module.exports = { localDayKey, addCalendarDays };
