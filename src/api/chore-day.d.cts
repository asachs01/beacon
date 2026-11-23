export function choreDayKey(
  value?: string | number | Date | null,
  timeZone?: string | null,
  resetTime?: string | null,
): string;

export function advanceStreak<T extends {
  current?: number;
  longest?: number;
  last_completed?: string;
  last_chore_day?: string;
}>(
  streak: T,
  now?: string | number | Date | null,
  timeZone?: string | null,
  resetTime?: string | null,
): T;

export function normalizeResetTime(resetTime?: string | null): string;

export function resetTimeFromSettings(settings: unknown): string | null;

export function readStoredResetTime(dataDir: string): Promise<string | null>;

export function resolveResetTime(deps?: {
  resetTime?: string | null;
  readResetTime?: () => Promise<string | null> | string | null;
  dataDir?: string;
}): Promise<string | null>;
