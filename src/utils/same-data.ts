/**
 * `next`, or `prev` when it holds the same data: a reload that found nothing
 * new then doesn't re-render (or make re-fetch) everything that depends on
 * it. Displays reload whenever something changes on another display (see
 * data-changes.ts), and a new members list, say, has App fetch every
 * calendar again for the member colors.
 */
export function unlessUnchanged<T>(prev: T, next: T): T {
  return prev === next || JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}
