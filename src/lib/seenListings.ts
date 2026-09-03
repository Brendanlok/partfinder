// Browser-local memory of every listing URL that has ever turned up in a search here.
// Lets a re-run of a search flag which results are genuinely new to this user vs. ones
// they've already seen before. Zero API cost - piggybacks on searches already run.
// Deliberately separate from priceHistory: this tracks every URL (price or not), never
// prunes on a value, and a bug here can't corrupt the price-drop signal.

export const SEEN_LISTINGS_KEY = "partfinder:seenListings";

// ponytail: hard cap so a long-lived browser doesn't grow this unbounded. FIFO - oldest
// URLs fall off first. 1500 ≈ hundreds of searches; a URL that ages out just shows "New"
// once more if it resurfaces, which is harmless.
const MAX_ENTRIES = 1500;

// URLs in `urls` that aren't in `seen` yet. Order preserved.
export function filterNew(seen: string[], urls: string[]): string[] {
  const known = new Set(seen);
  return urls.filter((u) => u && !known.has(u));
}

// `seen` with `urls` appended (deduped), capped to the most-recent MAX_ENTRIES.
export function markSeen(seen: string[], urls: string[]): string[] {
  const merged = [...seen];
  const known = new Set(seen);
  for (const u of urls) {
    if (u && !known.has(u)) {
      merged.push(u);
      known.add(u);
    }
  }
  return merged.length > MAX_ENTRIES ? merged.slice(merged.length - MAX_ENTRIES) : merged;
}
