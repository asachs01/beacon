/**
 * Deterministic fallback for Magic Import.
 *
 * Dates: "Fri Dec 5", "12/5", "tomorrow at 3pm", "next Tuesday".
 * Bullet lines, and a run of short lines, become list items.
 * Nothing here calls a network.
 */
import {
  addCalendarDays,
  isCalendarKey,
  monthFirstLocale,
  resolveMonthDay,
  weekdayOnOrAfter,
  zonedDayKey,
} from './calendar';

export interface ParseContext {
  now: Date;
  timeZone: string;
  locale?: string;
}

export interface ParsedEvent {
  title: string;
  date: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  notes: string | null;
}

export interface ParsedItem {
  title: string;
  list: 'grocery' | 'todo';
}

export interface ParsedImport {
  events: ParsedEvent[];
  items: ParsedItem[];
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const WD = 'sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?';
const MON = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

const DATE_RE = new RegExp(
  [
    `\\b(?:(?<wd1>${WD})\\s*,?\\s+)?(?<mon1>${MON})\\.?\\s+(?<day1>\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s+(?<year1>\\d{4}))?\\b`,
    `\\b(?<day2>\\d{1,2})(?:st|nd|rd|th)?\\s+(?<mon2>${MON})\\.?(?:\\s*,?\\s+(?<year2>\\d{4}))?\\b`,
    `\\b(?<iso>\\d{4}-\\d{2}-\\d{2})\\b`,
    `\\b(?<n1>\\d{1,2})\\/(?<n2>\\d{1,2})(?:\\/(?<n3>\\d{2,4}))?\\b`,
    `\\b(?<rel>today|tomorrow|tonight)\\b`,
    `\\b(?<nth>next|this)\\s+(?<wd2>${WD})\\b`,
    `\\b(?<wd3>${WD})\\b`,
  ].join('|'),
  'gi',
);

const CLOCK = '(\\d{1,2})(?::([0-5]\\d))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?';
const TIME_RE = new RegExp(`\\b(?:from\\s+)?${CLOCK}(?:\\s*(?:-|–|—|to)\\s*${CLOCK})?`, 'gi');
const LOCATION_RE = /\b(?:at|in)\s+((?:(?:the|a|an)\s+)?[A-Za-z][\w'’|-]*(?:\s+[A-Za-z0-9][\w'’|-]*){0,5})/gi;
const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+(.+?)\s*$/;
const GROCERY_RE = /\b(groc\w*|shop\w*|buy|bring|pack|store|milk|eggs?|bread|snacks?|lunch|water)\b/i;
const TODO_RE = /\b(to-?dos?|tasks?|homework|chores?|reminders?)\b/i;

interface DateHit {
  index: number;
  end: number;
  date: string;
}

function lookup(table: Record<string, number>, raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  return table[raw.toLowerCase()];
}

function expandYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (raw.length <= 2) return 2000 + value;
  return value;
}

function dateFromMatch(match: RegExpExecArray, today: string, monthFirst: boolean): string | null {
  const groups = match.groups ?? {};
  if (groups.iso && isCalendarKey(groups.iso)) return groups.iso;
  if (groups.rel) {
    if (groups.rel.toLowerCase() === 'tomorrow') return addCalendarDays(today, 1);
    return today;
  }
  const nthWeekday = lookup(WEEKDAYS, groups.wd2);
  if (groups.nth && nthWeekday != null) {
    return weekdayOnOrAfter(today, nthWeekday, groups.nth.toLowerCase() === 'next');
  }
  const bare = lookup(WEEKDAYS, groups.wd3);
  if (bare != null && !groups.mon1 && !groups.mon2) {
    return weekdayOnOrAfter(today, bare, false);
  }
  const month = lookup(MONTHS, groups.mon1) ?? lookup(MONTHS, groups.mon2);
  const dayRaw = groups.day1 ?? groups.day2;
  if (month && dayRaw) {
    return resolveMonthDay(month, Number(dayRaw), expandYear(groups.year1 ?? groups.year2), today);
  }
  if (groups.n1 && groups.n2) {
    const first = Number(groups.n1);
    const second = Number(groups.n2);
    let monthNum = monthFirst ? first : second;
    let dayNum = monthFirst ? second : first;
    if (monthNum > 12 && dayNum <= 12) {
      monthNum = second;
      dayNum = first;
    } else if (dayNum > 12 && monthNum <= 12 && !monthFirst) {
      monthNum = first;
      dayNum = second;
    }
    return resolveMonthDay(monthNum, dayNum, expandYear(groups.n3), today);
  }
  return null;
}

function findDates(text: string, today: string, monthFirst: boolean): DateHit[] {
  const hits: DateHit[] = [];
  DATE_RE.lastIndex = 0;
  let match = DATE_RE.exec(text);
  while (match) {
    const nextChar = text[match.index + match[0].length];
    const possessive = nextChar === "'" || nextChar === '\u2019';
    const date = possessive ? null : dateFromMatch(match, today, monthFirst);
    if (!date) {
      DATE_RE.lastIndex = match.index + 1;
      match = DATE_RE.exec(text);
      continue;
    }
    hits.push({ index: match.index, end: match.index + match[0].length, date });
    match = DATE_RE.exec(text);
  }
  return hits;
}

function clockToTime(hourRaw: string, minuteRaw: string | undefined, ampmRaw: string | undefined, inherited?: string): string | null {
  let hour = Number(hourRaw);
  const minute = minuteRaw == null || minuteRaw === '' ? 0 : Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return null;
  const meridian = (ampmRaw || inherited || '').replace(/\./g, '').toLowerCase();
  const hasMeridian = meridian === 'am' || meridian === 'pm';
  const hasMinutes = minuteRaw != null && minuteRaw !== '';
  if (!hasMeridian && !hasMinutes) return null;
  if (hasMeridian) {
    if (hour < 1 || hour > 12) return null;
    if (meridian === 'pm' && hour !== 12) hour += 12;
    if (meridian === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function findTime(text: string): { start: string; end: string | null; index: number; length: number } | null {
  TIME_RE.lastIndex = 0;
  let match = TIME_RE.exec(text);
  while (match) {
    const inherited = match[6] || match[3];
    const start = clockToTime(match[1], match[2], match[3], match[3] ? undefined : inherited);
    if (start) {
      const end = match[4] ? clockToTime(match[4], match[5], match[6], match[6] ? undefined : (match[3] || inherited)) : null;
      return { start, end, index: match.index, length: match[0].length };
    }
    match = TIME_RE.exec(text);
  }
  return null;
}

function findLocation(text: string): { value: string; raw: string } | null {
  LOCATION_RE.lastIndex = 0;
  let match = LOCATION_RE.exec(text);
  while (match) {
    const value = match[1].replace(/\s+/g, ' ').trim();
    const first = value.split(/\s+/)[0]?.toLowerCase() ?? '';
    const blocked = first in WEEKDAYS || first in MONTHS || first === 'today' || first === 'tomorrow' || first === 'tonight';
    if (value && !blocked) return { value, raw: match[0] };
    match = LOCATION_RE.exec(text);
  }
  return null;
}

function findNotes(text: string): string | null {
  const match = text.match(/\(([^)]+)\)/);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function cleanTitle(raw: string): string {
  let text = raw.replace(/\([^)]*\)/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:and|plus|then|please|remember|also)\b[\s,:-]*/i, '');
  text = text.replace(/(?:^|\s)(?:on|at|from|this|next|and)$/i, '');
  text = text.replace(/^[\s,.:;!-]+|[\s,.:;!-]+$/g, '').trim();
  if (text.length > 120) text = text.slice(0, 120).trim();
  return text;
}

function eventsFromSentence(sentence: string, today: string, monthFirst: boolean): ParsedEvent[] {
  const hits = findDates(sentence, today, monthFirst);
  const events: ParsedEvent[] = [];
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    const previousEnd = i === 0 ? 0 : hits[i - 1].end;
    const nextStart = hits[i + 1]?.index ?? sentence.length;
    const left = sentence.slice(previousEnd, hit.index);
    const right = sentence.slice(hit.end, nextStart);
    const time = findTime(right);
    const afterTime = time ? right.slice(time.index + time.length) : right;
    const location = findLocation(afterTime);
    const notes = findNotes(`${left} ${right}`);
    const title = cleanTitle(left) || cleanTitle(right
      .replace(time ? right.slice(time.index, time.index + time.length) : '', ' ')
      .replace(location?.raw ?? '', ' ')) || 'Event';
    events.push({
      title,
      date: hit.date,
      allDay: !time,
      startTime: time?.start ?? null,
      endTime: time?.end ?? null,
      location: location?.value ?? null,
      notes,
    });
  }
  return events;
}

function listKind(header: string, item: string): 'grocery' | 'todo' {
  if (GROCERY_RE.test(header)) return 'grocery';
  if (TODO_RE.test(header)) return 'todo';
  if (GROCERY_RE.test(item)) return 'grocery';
  return 'todo';
}

function isShortItem(line: string, today: string, monthFirst: boolean): boolean {
  const trimmed = line.trim();
  if (!trimmed || /[.!?]/.test(trimmed)) return false;
  if (findDates(trimmed, today, monthFirst).length > 0) return false;
  const words = trimmed.split(/\s+/);
  return words.length <= 6 && trimmed.length <= 40;
}

export function parseMagicImportText(text: string, ctx: ParseContext): ParsedImport {
  const today = zonedDayKey(ctx.now, ctx.timeZone);
  const monthFirst = monthFirstLocale(ctx.locale || 'en-US');
  const events: ParsedEvent[] = [];
  const items: ParsedItem[] = [];
  let header = '';
  const prose: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const bullet = line.match(BULLET_RE);
    if (bullet) {
      const title = bullet[1].trim();
      if (title) items.push({ title, list: listKind(header, title) });
      continue;
    }
    if (!line.trim()) continue;
    header = line.trim();
    prose.push(header);
  }

  let run: string[] = [];
  const flushRun = (followingHeader: string) => {
    if (run.length < 2) {
      run = [];
      return;
    }
    const section = followingHeader;
    for (const title of run) items.push({ title, list: listKind(section, title) });
    run = [];
  };

  for (let i = 0; i < prose.length; i += 1) {
    const line = prose[i];
    if (isShortItem(line, today, monthFirst)) {
      run.push(line);
      continue;
    }
    const prior = prose[i - run.length - 1] ?? '';
    flushRun(prior);
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      events.push(...eventsFromSentence(sentence, today, monthFirst));
    }
  }
  flushRun(prose[prose.length - run.length - 1] ?? '');

  return { events, items };
}
