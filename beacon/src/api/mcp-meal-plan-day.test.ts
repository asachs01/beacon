import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { localDayKey as localDayKeyFromTs } from './date-keys';
import { addCalendarDays, localDayKey as localDayKeyFromCjs } from './local-day-key.cjs';

/**
 * 2026-11-20 18:00 in America/Phoenix (UTC-7, no DST) is 2026-11-21 01:00 UTC.
 * 2026-11-20 23:30 in America/New_York (EST, UTC-5) is 2026-11-21 04:30 UTC.
 */
const PHOENIX_EVENING = new Date('2026-11-20T18:00:00-07:00');
const NEW_YORK_LATE = new Date('2026-11-20T23:30:00-05:00');

const dataDir = mkdtempSync(path.join(tmpdir(), 'beacon-mcp-meal-'));
process.env.DATA_DIR = dataDir;

const { handleTool } = await import('../../beacon/mcp-server.cjs');

const MEALS = [
  { date: '2026-11-20', meal_type: 'Dinner', name: 'Tacos' },
  { date: '2026-11-21', meal_type: 'Breakfast', name: 'Oatmeal' },
];

function writeJson(name: string, data: unknown) {
  writeFileSync(path.join(dataDir, name), JSON.stringify(data));
}

describe('beacon_get_meal_plan local day', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    writeJson('beacon_meal_plans.json', MEALS);
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('returns the Phoenix local day at 18:00, not tomorrow UTC', async () => {
    process.env.TZ = 'America/Phoenix';
    vi.setSystemTime(PHOENIX_EVENING);

    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Phoenix');
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-11-21');
    expect(localDayKeyFromTs()).toBe('2026-11-20');
    expect(localDayKeyFromCjs()).toBe(localDayKeyFromTs());

    const result = await handleTool('beacon_get_meal_plan', {});

    expect(result.date).toBe('2026-11-20');
    expect(result.entries).toEqual([
      { date: '2026-11-20', meal_type: 'Dinner', name: 'Tacos' },
    ]);
  });

  it('returns the New York local day at 23:30, not tomorrow UTC', async () => {
    process.env.TZ = 'America/New_York';
    vi.setSystemTime(NEW_YORK_LATE);

    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-11-21');
    expect(localDayKeyFromCjs()).toBe('2026-11-20');

    const result = await handleTool('beacon_get_meal_plan', {});

    expect(result.date).toBe('2026-11-20');
    expect(result.entries).toEqual([
      { date: '2026-11-20', meal_type: 'Dinner', name: 'Tacos' },
    ]);
  });

  it('keeps an explicit YYYY-MM-DD and steps the range in local calendar days', async () => {
    process.env.TZ = 'America/New_York';
    vi.setSystemTime(NEW_YORK_LATE);
    writeJson('beacon_meal_plans.json', [
      { date: '2026-03-08', meal_type: 'Dinner', name: 'Stew' },
      { date: '2026-03-09', meal_type: 'Dinner', name: 'Soup' },
      { date: '2026-03-10', meal_type: 'Dinner', name: 'Chili' },
    ]);

    // US spring-forward is 2026-03-08. UTC-midnight date math repeats that day.
    expect(addCalendarDays('2026-03-08', 1)).toBe('2026-03-09');

    const result = await handleTool('beacon_get_meal_plan', { date: '2026-03-08', days: 3 });

    expect(result.date).toBe('2026-03-08');
    expect(result.entries.map((entry: { date: string }) => entry.date)).toEqual([
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
  });

  it('counts a morning completion as today during a Phoenix evening', async () => {
    process.env.TZ = 'America/Phoenix';
    vi.setSystemTime(PHOENIX_EVENING);
    writeJson('beacon_family_members.json', [{ id: 'm1', name: 'Ada', role: 'child' }]);
    writeJson('beacon_chores.json', [
      {
        id: 'c1',
        name: 'Dishes',
        assigned_to: ['m1'],
        frequency: 'daily',
        max_completions: 1,
      },
    ]);
    // 10:00 America/Phoenix on 2026-11-20. The UTC date is still the 20th,
    // which the old UTC "today" (the 21st) would drop.
    writeJson('beacon_completions.json', [
      { chore_id: 'c1', member_id: 'm1', completed_at: '2026-11-20T17:00:00.000Z' },
    ]);

    const listed = await handleTool('beacon_list_chores', {});
    const dishes = listed.chores.find((chore: { name: string }) => chore.name === 'Dishes');
    expect(dishes.completed_today_by).toEqual(['Ada']);
    expect(dishes.period_completions.Ada).toBe('1/1');

    const again = await handleTool('beacon_manage_chore', {
      action: 'complete',
      chore_name: 'Dishes',
      member_name: 'Ada',
    });
    expect(again.success).toBe(false);
  });

  it('keeps a Sunday-local weekly completion inside the Phoenix week', async () => {
    process.env.TZ = 'America/Phoenix';
    vi.setSystemTime(PHOENIX_EVENING);
    writeJson('beacon_family_members.json', [{ id: 'm1', name: 'Ada', role: 'child' }]);
    writeJson('beacon_chores.json', [
      {
        id: 'c1',
        name: 'Lawn',
        assigned_to: ['m1'],
        frequency: 'weekly',
        max_completions: 1,
      },
    ]);
    // Sunday 2026-11-15 10:00 Phoenix. UTC date is still Sunday, but the old
    // week start was Monday's UTC date (2026-11-16), so this fell out of the week.
    writeJson('beacon_completions.json', [
      { chore_id: 'c1', member_id: 'm1', completed_at: '2026-11-15T17:00:00.000Z' },
    ]);

    const listed = await handleTool('beacon_list_chores', {});
    const lawn = listed.chores.find((chore: { name: string }) => chore.name === 'Lawn');
    expect(lawn.period_completions.Ada).toBe('1/1');
  });
});
