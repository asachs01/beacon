import { startOfDay, startOfWeek } from 'date-fns';
import type { Chore, ChoreCompletion } from '../types/family';
import { loadDataSync } from './beacon-store';

/**
 * A chore's current round: a daily chore is done for the day it's ticked, a
 * weekly one until the week ends, a one-off for good. Every chore used to
 * count as daily, so weekly and one-off chores came undone each night (and
 * the Google Tasks sync un-ticked finished one-off tasks).
 */
export function choreRoundStart(frequency: Chore['frequency'] | undefined, weekStartsOn: 0 | 1, now = new Date()): Date {
  if (frequency === 'once') return new Date(0);
  if (frequency === 'weekly') return startOfWeek(now, { weekStartsOn });
  return startOfDay(now);
}

/** Whether `completion` counts for `chore`'s current round. */
export function completesCurrentRound(completion: ChoreCompletion, chore: Chore, weekStartsOn: 0 | 1, now = new Date()): boolean {
  return Date.parse(completion.completed_at) >= choreRoundStart(chore.frequency, weekStartsOn, now).getTime();
}

/** Settings > "Week starts on", from this device's copy of the settings. */
export function weekStartsOnSetting(): 0 | 1 {
  return loadDataSync<{ weekStartsOn?: number } | null>('beacon-settings', null)?.weekStartsOn === 1 ? 1 : 0;
}
