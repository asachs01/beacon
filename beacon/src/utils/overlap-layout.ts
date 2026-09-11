/**
 * Side-by-side layout for timed events sharing one day column.
 * Port of FullCalendar v4 TimeGridEventRenderer's overlap algorithm
 * (matches Google Calendar's visual style).
 */

export interface OverlapEvent {
  id: string;
  /** ISO 8601 datetime — lexicographic order matches chronological order */
  start: string;
  end: string;
}

export interface OverlapLayout {
  /** Left edge as a 0–1 fraction of the day column width */
  left: number;
  /** Width as a 0–1 fraction of the day column width */
  width: number;
  /** Column level (0-based); higher = drawn on top */
  level: number;
}

interface Seg {
  id: string;
  top: number; // minutes from midnight
  bottom: number; // minutes from midnight
  level: number;
  forwardSegs: Seg[]; // segs in deeper levels that overlap this one
  forwardPressure: number; // memoised longest forward-chain depth
  backwardCoord: number; // left edge 0–1
  forwardCoord: number; // right edge 0–1
}

// Coords are always 0–1, so NaN marks "not yet computed".
const NOT_COMPUTED = Number.NaN;

function toMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function collides(a: Seg, b: Seg): boolean {
  return a.bottom > b.top && a.top < b.bottom;
}

// Greedy column assignment: place each seg in the first non-colliding level.
function buildLevels(segs: Seg[]): Seg[][] {
  const levels: Seg[][] = [];
  for (const seg of segs) {
    let i = 0;
    while (i < levels.length && levels[i].some((o) => collides(seg, o))) i++;
    if (!levels[i]) levels[i] = [];
    levels[i].push(seg);
    seg.level = i;
  }
  return levels;
}

// For each seg, collect the deeper-level segs that overlap it in time.
function buildForwardSegs(levels: Seg[][]): void {
  for (let i = 0; i < levels.length; i++) {
    for (const seg of levels[i]) {
      seg.forwardSegs = [];
      for (let k = i + 1; k < levels.length; k++) {
        for (const other of levels[k]) {
          if (collides(seg, other)) seg.forwardSegs.push(other);
        }
      }
    }
  }
}

// Longest path length through forwardSegs.
function computePressure(seg: Seg): void {
  if (!Number.isNaN(seg.forwardPressure)) return;
  let max = 0;
  for (const fwd of seg.forwardSegs) {
    computePressure(fwd);
    max = Math.max(max, 1 + fwd.forwardPressure);
  }
  seg.forwardPressure = max;
}

// Recursively compute left/right coords. Consecutive segs with equal pressure
// form a "series" that splits the freed space evenly.
function computeCoords(seg: Seg, seriesBackPressure: number, seriesBackCoord: number): void {
  if (!Number.isNaN(seg.forwardCoord)) return;
  const { forwardSegs } = seg;
  if (forwardSegs.length === 0) {
    seg.forwardCoord = 1;
  } else {
    forwardSegs.sort((a, b) => b.forwardPressure - a.forwardPressure);
    computeCoords(forwardSegs[0], seriesBackPressure + 1, seriesBackCoord);
    seg.forwardCoord = forwardSegs[0].backwardCoord;
  }
  seg.backwardCoord =
    seg.forwardCoord - (seg.forwardCoord - seriesBackCoord) / (seriesBackPressure + 1);
  for (const fwd of forwardSegs) computeCoords(fwd, 0, seg.forwardCoord);
}

export function computeOverlapLayout(events: OverlapEvent[]): Map<string, OverlapLayout> {
  const result = new Map<string, OverlapLayout>();
  if (events.length === 0) return result;

  const segs: Seg[] = events
    .map((e) => ({
      id: e.id,
      top: toMinutes(e.start),
      bottom: toMinutes(e.end),
      level: 0,
      forwardSegs: [] as Seg[],
      forwardPressure: NOT_COMPUTED,
      backwardCoord: 0,
      forwardCoord: NOT_COMPUTED,
    }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  const levels = buildLevels(segs);
  buildForwardSegs(levels);
  for (const seg of levels[0] || []) computePressure(seg);
  for (const seg of levels[0] || []) computeCoords(seg, 0, 0);

  // slotEventOverlap: double each width (clamped to the column edge) so
  // earlier events span behind later ones. Events reaching full width need
  // no layout entry.
  for (const seg of segs) {
    const width = Math.min(1 - seg.backwardCoord, (seg.forwardCoord - seg.backwardCoord) * 2);
    if (width < 1) result.set(seg.id, { left: seg.backwardCoord, width, level: seg.level });
  }

  return result;
}