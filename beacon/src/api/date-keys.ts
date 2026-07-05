/**
 * The calendar day a timestamp belongs to, in the viewer's LOCAL time zone,
 * formatted as "YYYY-MM-DD".
 *
 * Completions are stored as full UTC ISO timestamps (`new Date().toISOString()`).
 * Bucketing them by local day — rather than the UTC date embedded in the string —
 * makes "today" roll over at local midnight. Without this, an evening completion
 * in a negative-UTC-offset zone (e.g. 7:45pm US Eastern) would land on the next
 * UTC date and appear to reset hours early.
 *
 * Because the stored value is a full timestamp, this is a pure reinterpretation:
 * no data migration is needed — existing records bucket correctly going forward.
 *
 * An empty or unparseable value returns "" (matching the prior `''.slice(0,10)`
 * sentinel used for "never completed").
 */
export function localDayKey(value: string | number | Date = new Date()): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
