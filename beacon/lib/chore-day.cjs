'use strict';

/**
 * Chore day as "YYYY-MM-DD".
 *
 * The chore day starts at Settings → Chores → Daily Reset Time (`HH:mm` in
 * the household zone). Before that clock time, completions still belong to
 * the previous calendar date. An unset, empty, or invalid reset time is
 * local midnight, which is the same key as `dayKey` / `localDayKey`.
 *
 * Compare the wall clock in the zone to the reset clock, then step the
 * calendar date back when the instant is earlier. Do not subtract the reset
 * duration from the UTC instant: on a spring-forward morning, 04:00 local
 * is not four hours after local midnight.
 *
 * A bare YYYY-MM-DD is returned unchanged. Completions are full UTC ISO
 * timestamps and are only reinterpreted. Nothing is rewritten.
 */

const fs = require('fs/promises');
const path = require('path');
const { localDayKey } = require('./local-day-key.cjs');

const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RESET_TIME = /^(\d{1,2}):(\d{2})$/;
const SETTINGS_FILE = 'beacon-settings.json';

function parseResetMinutes(resetTime) {
  if (typeof resetTime !== 'string') return 0;
  const match = RESET_TIME.exec(resetTime.trim());
  if (!match) return 0;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return 0;
  return hour * 60 + minute;
}

/** `HH:mm`, or `00:00` when the setting is missing or not a clock time. */
function normalizeResetTime(resetTime) {
  const minutes = parseResetMinutes(resetTime);
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

function resetTimeFromSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  return typeof settings.choresResetTime === 'string' ? settings.choresResetTime : null;
}

function calendarDayKey(value, timeZone) {
  if (!timeZone) return localDayKey(value);
  if (value === undefined) value = new Date();
  if (typeof value === 'string' && BARE_DATE.test(value.trim())) return value.trim();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
  } catch {
    return localDayKey(value);
  }
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return localDayKey(value);
  return `${year}-${month}-${day}`;
}

function previousCalendarDate(year, month, day) {
  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  utc.setUTCDate(utc.getUTCDate() - 1);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function wallClock(date, timeZone) {
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  if (timeZone) options.timeZone = timeZone;
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  } catch {
    return null;
  }
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  const year = pick('year');
  const month = pick('month');
  const day = pick('day');
  const hour = pick('hour');
  const minute = pick('minute');
  if (!year || !month || !day || hour == null || minute == null) return null;
  let hourNum = Number(hour);
  if (hourNum === 24) hourNum = 0;
  return { year, month, day, minutes: hourNum * 60 + Number(minute) };
}

function instantOf(value) {
  if (value === undefined) return new Date();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (BARE_DATE.test(trimmed)) return { bare: trimmed };
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * Chore-day key for one instant.
 * `timeZone` is an IANA name. Omit it to use the runtime zone (the device
 * in the browser, the add-on process zone when Home Assistant's zone is
 * unknown). Never the UTC date.
 */
function choreDayKey(value, timeZone, resetTime) {
  if (parseResetMinutes(resetTime) === 0) return calendarDayKey(value, timeZone);
  const instant = instantOf(value);
  if (!instant) return '';
  if (instant.bare) return instant.bare;
  const clock = wallClock(instant, timeZone || undefined);
  if (!clock) return calendarDayKey(value, timeZone);
  const date = `${clock.year}-${clock.month}-${clock.day}`;
  if (clock.minutes >= parseResetMinutes(resetTime)) return date;
  return previousCalendarDate(clock.year, clock.month, clock.day);
}

async function readStoredResetTime(dataDir) {
  try {
    const raw = await fs.readFile(path.join(dataDir, SETTINGS_FILE), 'utf8');
    return resetTimeFromSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Explicit `deps.resetTime` wins, including null. Otherwise call
 * `deps.readResetTime`, otherwise read beacon-settings.json from
 * `deps.dataDir`. A missing file is midnight.
 */
async function resolveResetTime(deps) {
  if (deps && Object.prototype.hasOwnProperty.call(deps, 'resetTime')) return deps.resetTime;
  if (deps && typeof deps.readResetTime === 'function') {
    try {
      return await deps.readResetTime();
    } catch {
      return null;
    }
  }
  if (deps && deps.dataDir) return readStoredResetTime(deps.dataDir);
  return null;
}

module.exports = {
  choreDayKey,
  normalizeResetTime,
  parseResetMinutes,
  resetTimeFromSettings,
  readStoredResetTime,
  resolveResetTime,
};
