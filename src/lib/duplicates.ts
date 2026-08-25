// Fuzzy-matches listings that are the same car cross-posted across sources
// (mobile.de / AutoScout24 / Kleinanzeigen at different prices). Pure, no
// React/JSX so it can be unit-tested and imported from page.tsx alike.

export type DupListing = {
  url: string;
  title: string;
  source: string;
  price?: string;
  year?: string;
  mileage_km?: string;
};

export type DuplicateMatch = { url: string; source: string; price?: string };

export function parsePrice(price?: string): number | null {
  if (!price) return null;
  const digits = price.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

export function parseMileage(mileage?: string): number | null {
  if (mileage === undefined) return null;
  const n = Number(mileage);
  return Number.isNaN(n) ? null : n;
}

function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\d]+/gu, " ")
      .split(" ")
      .filter((w) => w.length > 2) // drop short filler words (mit/der/km/...)
  );
}

// Overlap coefficient (shared / smaller set), not Jaccard - one source's title is often
// a strict superset of another's (extra trim/spec words), so Jaccard would under-score
// an otherwise-perfect match just for being verbose.
function titleOverlap(a: string, b: string): number {
  const wa = titleWords(a);
  const wb = titleWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

// Same car cross-posted under different wording per site - title alone is too loose
// (every result in a search already shares make/model), so require it agree with at
// least one hard number too before calling two listings "the same car".
export function isProbablySameCar(a: DupListing, b: DupListing): boolean {
  if (a.source === b.source) return false;
  if (titleOverlap(a.title, b.title) < 0.45) return false;

  if (a.year && b.year && a.year !== b.year) return false;

  const am = parseMileage(a.mileage_km);
  const bm = parseMileage(b.mileage_km);
  if (am !== null && bm !== null && Math.abs(am - bm) > Math.max(500, am * 0.04)) return false;

  const ap = parsePrice(a.price);
  const bp = parsePrice(b.price);
  if (ap !== null && bp !== null && Math.abs(ap - bp) / Math.max(ap, bp) > 0.3) return false;

  // Need at least one real number in common, not just similar titles - two different
  // base-model listings of the same car can otherwise look identical by title alone.
  return (a.year != null && b.year != null) || (am !== null && bm !== null);
}

// Cheapest-priced match first (that's the useful one to lead with), unpriced matches
// last since there's nothing to compare.
export function duplicateSummary(matches: DuplicateMatch[]): string {
  const sorted = [...matches].sort((a, b) => (parsePrice(a.price) ?? Infinity) - (parsePrice(b.price) ?? Infinity));
  const [first, ...rest] = sorted;
  const priced = first.price ? ` for ${first.price}` : "";
  return rest.length > 0 ? `${first.source}${priced} +${rest.length} more` : `${first.source}${priced}`;
}

// ponytail: O(n^2) title comparisons - fine at search-result scale (tens of listings,
// not thousands), revisit only if result sets grow far beyond that.
export function findDuplicates(listings: DupListing[]): Record<string, DuplicateMatch[]> {
  const result: Record<string, DuplicateMatch[]> = {};
  for (let i = 0; i < listings.length; i++) {
    for (let j = i + 1; j < listings.length; j++) {
      const a = listings[i];
      const b = listings[j];
      if (!isProbablySameCar(a, b)) continue;
      (result[a.url] ??= []).push({ url: b.url, source: b.source, price: b.price });
      (result[b.url] ??= []).push({ url: a.url, source: a.source, price: a.price });
    }
  }
  return result;
}
