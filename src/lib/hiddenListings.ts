// Browser-local list of listing URLs the user has explicitly dismissed from search
// results ("not this one"). Filtered out of live results so re-running the same search
// doesn't keep resurfacing cars they've already rejected. Never applied to the Saved
// view — a saved car was an explicit keep. Zero API cost, same shape as seenListings.

export const HIDDEN_LISTINGS_KEY = "partfinder:hiddenListings";

// ponytail: FIFO cap so a long-lived browser doesn't grow this unbounded. A URL that
// ages out just reappears in results once more, which is harmless.
const MAX_ENTRIES = 1000;

// `hidden` with `url` toggled: added if absent, removed if present. Insertion order is
// kept so the FIFO cap drops the oldest dismissals first.
export function toggleHidden(hidden: string[], url: string): string[] {
  if (!url) return hidden;
  if (hidden.includes(url)) return hidden.filter((u) => u !== url);
  const next = [...hidden, url];
  return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
}
