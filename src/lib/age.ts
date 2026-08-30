// Whole-days-ago for an ISO timestamp, used for the "prices last checked N days ago"
// hint on a restored search. Returns null under 1 day (not worth showing right after
// a fresh search) or for an unparseable/future value.
export function daysAgo(iso: string, now: number = Date.now()): number | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const days = Math.floor((now - then) / 86_400_000);
  return days >= 1 ? days : null;
}
