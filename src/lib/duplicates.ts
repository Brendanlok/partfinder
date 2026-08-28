// Fuzzy-matches listings that are the same car cross-posted across sources
// (mobile.de / AutoScout24 / Kleinanzeigen at different prices). Pure, no
// React/JSX so it can be unit-tested and imported from page.tsx alike.

// Share the one price parser with page.tsx - a local digits-only copy here
// mis-parsed any car price written with cents ("12.500,00 €" -> 1250000), which
// silently broke the 30%-tolerance same-car check and the cheapest-match sort.
import { parsePrice } from "./price.ts";
import { parseMileage } from "./mileage.ts";

export type DupListing = {
  url: string;
  title: string;
  source: string;
  price?: string;
  year?: string;
  mileage_km?: string;
  match_score?: number;
};

export type DuplicateMatch = { url: string; source: string; price?: string };

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

// Collapses each cross-posted cluster (a-dupes-b-dupes-c, transitively) down to its
// single best listing - highest match_score, ties broken by lowest price, then by
// original order (stable) so re-running with identical inputs never reshuffles output.
// `duplicatesByUrl` is the caller's already-computed findDuplicates() result, not
// recomputed here, so this stays a plain filter with no extra comparisons.
export function pickRepresentatives<T extends DupListing>(
  listings: T[],
  duplicatesByUrl: Record<string, DuplicateMatch[]>
): T[] {
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root); // path compression
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const [url, matches] of Object.entries(duplicatesByUrl)) {
    for (const m of matches) union(url, m.url);
  }

  const byCluster = new Map<string, T[]>();
  for (const l of listings) {
    const root = duplicatesByUrl[l.url] ? find(l.url) : l.url;
    const group = byCluster.get(root);
    if (group) group.push(l);
    else byCluster.set(root, [l]);
  }

  const keepUrls = new Set<string>();
  for (const group of byCluster.values()) {
    let best = group[0];
    for (const candidate of group.slice(1)) {
      const bestScore = best.match_score ?? -1;
      const candidateScore = candidate.match_score ?? -1;
      if (candidateScore > bestScore) {
        best = candidate;
      } else if (candidateScore === bestScore) {
        const bestPrice = parsePrice(best.price) ?? Infinity;
        const candidatePrice = parsePrice(candidate.price) ?? Infinity;
        if (candidatePrice < bestPrice) best = candidate;
      }
    }
    keepUrls.add(best.url);
  }
  return listings.filter((l) => keepUrls.has(l.url));
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
