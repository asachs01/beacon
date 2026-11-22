/**
 * Calendar day as "YYYY-MM-DD" in the runtime's local time zone.
 *
 * Beacon has no separate timezone setting (Home Assistant's `time_zone` is not
 * copied into add-on config). The display's zone — `getFullYear` / `getMonth` /
 * `getDate` — is the zone "today" uses. Do not derive this key with
 * `toISOString().slice(0, 10)` or `Date.UTC`: those follow UTC, so in a zone
 * like America/Phoenix (UTC-7) an evening local time is already the next UTC
 * date.
 *
 * Stored meal plans and all-day events are already `YYYY-MM-DD` calendar keys.
 * A bare date is returned unchanged so existing records keep lining up; parsing
 * `YYYY-MM-DD` with `new Date()` would treat it as UTC midnight and shift it
 * backward in negative-offset zones.
 *
 * Completions and other instants are stored as full UTC ISO timestamps
 * (`new Date().toISOString()`). Bucketing those by local day is a
 * reinterpretation only — no data migration.
 *
 * An empty or unparseable value returns "" (matching the prior `''.slice(0,10)`
 * sentinel used for "never completed").
 *
 * Implemented in `local-day-key.cjs` so the CommonJS MCP server can require the
 * same function. This module re-exports it.
 */
export { localDayKey } from './local-day-key.cjs';
