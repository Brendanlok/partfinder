// Per-listing price memory, browser-local. Every successful search records each listing's
// current price and the date it was first seen at that price; a later search of the same
// listing can then show "down €500 since 3 days ago". Zero extra API calls - it piggybacks
// on searches the user already ran. Not a market tracker: only listings the user has
// actually pulled up before carry any history.

export const PRICE_HISTORY_KEY = "partfinder:priceHistory";

// since = ISO date "yyyy-mm-dd" the listing was first seen at this price.
export type PriceRecord = { price: number; since: string };
export type PriceHistory = Record<string, PriceRecord>;

// delta = current price - previously-seen price (negative = a drop).
export type PriceChange = { delta: number; since: string };

// ponytail: hard cap so a long-lived browser doesn't grow this unbounded. Oldest
// (by last-seen date) entries fall off first. 400 ≈ dozens of searches of history.
const MAX_ENTRIES = 400;

type PricedListing = { url: string; price: number | null };

// Reports which listings moved vs the last price we recorded for them. Read-only -
// use this on a plain restore (no fresh search), so re-opening the app doesn't reset
// the "since" clock and make a real drop disappear.
export function diffPrices(
  history: PriceHistory,
  listings: PricedListing[],
): Record<string, PriceChange> {
  const changes: Record<string, PriceChange> = {};
  for (const { url, price } of listings) {
    if (!url || price === null || !Number.isFinite(price)) continue;
    const prev = history[url];
    if (prev && prev.price !== price) changes[url] = { delta: price - prev.price, since: prev.since };
  }
  return changes;
}

// diffPrices, then folds today's prices back into history. Use this after a fresh
// search. `today` is injected so the caller owns the clock (keeps tests deterministic).
export function recordPrices(
  history: PriceHistory,
  listings: PricedListing[],
  today: string,
): { history: PriceHistory; changes: Record<string, PriceChange> } {
  const changes = diffPrices(history, listings);
  const next: PriceHistory = { ...history };
  for (const { url, price } of listings) {
    if (!url || price === null || !Number.isFinite(price)) continue;
    if (!next[url] || changes[url]) next[url] = { price, since: today };
    // existing entry, price unchanged: leave it, so `since` keeps aging.
  }
  return { history: prune(next), changes };
}

function prune(history: PriceHistory): PriceHistory {
  const entries = Object.entries(history);
  if (entries.length <= MAX_ENTRIES) return history;
  entries.sort((a, b) => b[1].since.localeCompare(a[1].since));
  return Object.fromEntries(entries.slice(0, MAX_ENTRIES));
}

// Whole days from ISO date `a` to ISO date `b` (negative if b is before a).
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
