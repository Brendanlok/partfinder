"use client";

import { useEffect, useState } from "react";

const SEARCH_STATUS_MESSAGES = [
  "Searching mobile.de, AutoScout24 & Kleinanzeigen…",
  "Reading listings…",
  "Almost there…",
];

type Listing = {
  title: string;
  url: string;
  price?: string;
  year?: string;
  mileage_km?: string;
  location?: string;
  source: string;
  match_score?: number;
  match_tags?: string[];
};

function matchColor(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (score >= 50) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300";
}

type SortOption = "relevance" | "price_asc" | "price_desc" | "year_desc" | "mileage_asc";

const SORT_LABEL: Record<SortOption, string> = {
  relevance: "Best match",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  year_desc: "Newest year",
  mileage_asc: "Lowest mileage",
};

function sortListings(listings: Listing[], sortBy: SortOption): Listing[] {
  const sorted = [...listings];
  switch (sortBy) {
    case "price_asc":
      sorted.sort((a, b) => (parsePrice(a.price) ?? Infinity) - (parsePrice(b.price) ?? Infinity));
      break;
    case "price_desc":
      sorted.sort((a, b) => (parsePrice(b.price) ?? -Infinity) - (parsePrice(a.price) ?? -Infinity));
      break;
    case "year_desc":
      sorted.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
      break;
    case "mileage_asc":
      sorted.sort((a, b) => (Number(a.mileage_km) || Infinity) - (Number(b.mileage_km) || Infinity));
      break;
    default:
      sorted.sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
  }
  return sorted;
}

function parsePrice(price?: string): number | null {
  if (!price) return null;
  const digits = price.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function medianPrice(listings: Listing[]): number | null {
  const prices = listings.map((l) => parsePrice(l.price)).filter((p): p is number => p !== null).sort((a, b) => a - b);
  if (prices.length < 3) return null; // too few results for a comparison to mean anything
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
}

// ponytail: inspired by CarGurus' deal-rating badge, but scoped honestly to what we
// actually have - just this search's own results, not a market-wide price database.
function priceBadge(price: number, median: number): string | null {
  if (price <= median * 0.9) return "Below others found";
  if (price >= median * 1.1) return "Above others found";
  return null; // near-median isn't worth calling out
}

type Issue = {
  issue: string;
  difficulty: "diy" | "garage";
};

type Verdict = {
  issues: Issue[];
  condition_summary: string;
  verdict: "buy" | "maybe" | "skip";
  photos_checked: number;
};

const DIFFICULTY_LABEL: Record<Issue["difficulty"], string> = {
  diy: "DIY",
  garage: "Garage job",
};

type Tutorial = {
  steps: string[];
  video: { title: string; url: string; thumbnail: string } | null;
};

type TutorialState = {
  loading?: boolean;
  error?: string;
  data?: Tutorial;
};

type VerdictState = {
  loading?: boolean;
  error?: string;
  data?: Verdict;
};

const VERDICT_LABEL: Record<Verdict["verdict"], string> = {
  buy: "Looks good",
  maybe: "Worth a closer look",
  skip: "Proceed with caution",
};

const LAST_SEARCH_KEY = "partfinder:lastSearch";

export default function Home() {
  const [want, setWant] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, VerdictState>>({});
  const [tutorials, setTutorials] = useState<Record<string, TutorialState>>({});
  const [statusIndex, setStatusIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
  const [maxPrice, setMaxPrice] = useState("");
  const [speakingUrl, setSpeakingUrl] = useState<string | null>(null);

  // Restore the last successful search on load, so a refresh/back-nav doesn't
  // lose results (and force a re-search that burns another API call).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_SEARCH_KEY);
      if (!saved) return;
      const { want: savedWant, listings: savedListings } = JSON.parse(saved);
      if (savedWant) setWant(savedWant);
      if (Array.isArray(savedListings)) setListings(savedListings);
    } catch {
      // ponytail: corrupt/old-shape localStorage data, ignore and start fresh
    }
  }, []);

  useEffect(() => {
    if (!loading) return;
    setStatusIndex(0);
    const id = setInterval(
      () => setStatusIndex((i) => Math.min(i + 1, SEARCH_STATUS_MESSAGES.length - 1)),
      8000
    );
    return () => clearInterval(id);
  }, [loading]);

  // Stop any in-progress speech if the component unmounts mid-read.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  function toggleSpeak(listing: Listing) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (speakingUrl === listing.url) {
      setSpeakingUrl(null);
      return;
    }
    const parts = [listing.title];
    if (listing.price) parts.push(listing.price);
    if (listing.year) parts.push(listing.year);
    if (listing.mileage_km) parts.push(`${listing.mileage_km} kilometers`);
    if (listing.location) parts.push(listing.location);
    if (listing.match_tags?.length) parts.push(listing.match_tags.join(", "));
    const verdict = verdicts[listing.url]?.data;
    if (verdict) {
      parts.push(VERDICT_LABEL[verdict.verdict]);
      parts.push(verdict.condition_summary);
    }
    const utter = new SpeechSynthesisUtterance(parts.join(". "));
    utter.onend = () => setSpeakingUrl(null);
    utter.onerror = () => setSpeakingUrl(null);
    window.speechSynthesis.speak(utter);
    setSpeakingUrl(listing.url);
  }

  async function checkCondition(listing: Listing) {
    setVerdicts((v) => ({ ...v, [listing.url]: { loading: true } }));
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_VERDICT_FUNCTION_URL as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ url: listing.url, want }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't check this listing.");
      setVerdicts((v) => ({ ...v, [listing.url]: { data } }));
    } catch (e) {
      setVerdicts((v) => ({
        ...v,
        [listing.url]: { error: e instanceof Error ? e.message : "Couldn't check this listing." },
      }));
    }
  }

  // Cache key is listing URL + issue text, not issue text alone - two different cars can
  // surface the same issue wording (seen live: identical Gemini phrasing for unrelated
  // listings), and issue text alone would show one listing's tutorial under another's.
  async function fetchTutorial(listingUrl: string, issue: string) {
    const key = `${listingUrl}::${issue}`;
    setTutorials((t) => ({ ...t, [key]: { loading: true } }));
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_TUTORIAL_FUNCTION_URL as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ issue, want }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load repair steps.");
      setTutorials((t) => ({ ...t, [key]: { data } }));
    } catch (e) {
      setTutorials((t) => ({
        ...t,
        [key]: { error: e instanceof Error ? e.message : "Couldn't load repair steps." },
      }));
    }
  }

  async function search() {
    if (!want.trim()) return;
    setLoading(true);
    setError("");
    setListings(null);
    setSortBy("relevance");
    setSourceFilter(new Set());
    setMaxPrice("");
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_SEARCH_FUNCTION_URL as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ want }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setListings(data.listings);
      try {
        localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify({ want, listings: data.listings }));
      } catch {
        // ponytail: storage full/unavailable, non-critical
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const availableSources = listings ? [...new Set(listings.map((l) => l.source))] : [];
  const filteredListings = listings
    ? listings.filter((l) => {
        if (sourceFilter.has(l.source)) return false;
        if (maxPrice) {
          const p = parsePrice(l.price);
          if (p !== null && p > Number(maxPrice)) return false;
        }
        return true;
      })
    : [];
  const sortedListings = sortListings(filteredListings, sortBy);
  const median = medianPrice(filteredListings);

  // sourceFilter holds EXCLUDED sources (unchecked boxes), not included ones - so "exclude
  // nothing" (show all) and "exclude everything" (show none) are naturally distinct sets,
  // no size-collapsing tricks needed.
  function toggleSource(source: string) {
    setSourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black px-4 py-10 sm:py-16">
      <main className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Partfinder
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Describe the car you want. We search mobile.de, AutoScout24, and
          Kleinanzeigen for matches.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={want}
            onChange={(e) => setWant(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="e.g. BMW E46 M3, manual, under 20k, good condition"
            className="w-full flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            onClick={search}
            disabled={loading || !want.trim()}
            className="w-full rounded-lg bg-black px-5 py-3 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black sm:w-auto"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {loading && (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            {SEARCH_STATUS_MESSAGES[statusIndex]}
          </p>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {listings && listings.length === 0 && !error && (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
            No matching listings found. Try a broader description.
          </p>
        )}

        {listings && listings.length > 0 && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {(Object.keys(SORT_LABEL) as SortOption[]).map((opt) => (
                  <option key={opt} value={opt}>
                    {SORT_LABEL[opt]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="numeric"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Max price €"
                className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              {availableSources.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={!sourceFilter.has(s)}
                    onChange={() => toggleSource(s)}
                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                  />
                  {s}
                </label>
              ))}
            </div>

            {sortedListings.length === 0 && (
              <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
                No results match these filters.
              </p>
            )}

            {sortedListings.length > 0 && sortedListings.length < listings.length && (
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                Showing {sortedListings.length} of {listings.length} listings
              </p>
            )}

          <ul className="mt-4 flex flex-col gap-3">
            {sortedListings.map((l) => {
              const price = parsePrice(l.price);
              const badge = median && price ? priceBadge(price, median) : null;
              return (
              <li
                key={l.url}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-black hover:underline dark:text-zinc-50"
                  >
                    {l.title}
                  </a>
                  <button
                    onClick={() => toggleSpeak(l)}
                    aria-label={speakingUrl === l.url ? "Stop reading" : "Read listing aloud"}
                    className="shrink-0 text-zinc-400 hover:text-black dark:text-zinc-500 dark:hover:text-zinc-50"
                  >
                    {speakingUrl === l.url ? "⏹" : "🔊"}
                  </button>
                </div>
                {typeof l.match_score === "number" && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${matchColor(l.match_score)}`}>
                      {l.match_score}% match
                    </span>
                    {l.match_tags?.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {l.price && <span>{l.price}</span>}
                  {badge && (
                    <span
                      className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                      title="Compared to other results in this search, not full market data"
                    >
                      {badge}
                    </span>
                  )}
                  {l.year && <span>{l.year}</span>}
                  {l.mileage_km && <span>{l.mileage_km} km</span>}
                  {l.location && <span>{l.location}</span>}
                  <span className="text-zinc-400 dark:text-zinc-600">
                    {l.source}
                  </span>
                </div>

                {!verdicts[l.url] && (
                  <button
                    onClick={() => checkCondition(l)}
                    className="mt-3 text-sm font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                  >
                    Check condition from photos
                  </button>
                )}

                {verdicts[l.url]?.loading && (
                  <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                    Reading photos…
                  </p>
                )}

                {verdicts[l.url]?.error && (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                    {verdicts[l.url]?.error}
                  </p>
                )}

                {verdicts[l.url]?.data && (
                  <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
                    <p className="font-medium text-black dark:text-zinc-50">
                      {VERDICT_LABEL[verdicts[l.url]!.data!.verdict]}
                    </p>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                      {verdicts[l.url]!.data!.condition_summary}
                    </p>
                    {verdicts[l.url]!.data!.issues.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-zinc-600 dark:text-zinc-400">
                        {verdicts[l.url]!.data!.issues.map((item, i) => (
                          <li key={i}>
                            {item.issue}{" "}
                            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                              {DIFFICULTY_LABEL[item.difficulty]}
                            </span>
                            {item.difficulty === "diy" && (() => {
                              const tutorialKey = `${l.url}::${item.issue}`;
                              return (
                              <>
                                {!tutorials[tutorialKey] && (
                                  <button
                                    onClick={() => fetchTutorial(l.url, item.issue)}
                                    className="ml-2 text-xs font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                                  >
                                    How to fix
                                  </button>
                                )}
                                {tutorials[tutorialKey]?.loading && (
                                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                                    Writing up steps…
                                  </span>
                                )}
                                {tutorials[tutorialKey]?.error && (
                                  <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                                    {tutorials[tutorialKey]?.error}
                                  </span>
                                )}
                                {tutorials[tutorialKey]?.data && (
                                  <div className="mt-2 rounded-lg bg-white p-2 text-xs dark:bg-zinc-900">
                                    <ol className="list-inside list-decimal text-zinc-600 dark:text-zinc-400">
                                      {tutorials[tutorialKey]!.data!.steps.map((step, si) => (
                                        <li key={si} className="mt-1">
                                          {step}
                                        </li>
                                      ))}
                                    </ol>
                                    {tutorials[tutorialKey]!.data!.video && (
                                      <a
                                        href={tutorials[tutorialKey]!.data!.video!.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-2 flex items-center gap-2 text-black hover:underline dark:text-zinc-50"
                                      >
                                        {tutorials[tutorialKey]!.data!.video!.thumbnail && (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={tutorials[tutorialKey]!.data!.video!.thumbnail}
                                            alt=""
                                            className="h-10 w-16 rounded object-cover"
                                          />
                                        )}
                                        <span>▶ {tutorials[tutorialKey]!.data!.video!.title}</span>
                                      </a>
                                    )}
                                  </div>
                                )}
                              </>
                              );
                            })()}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-600">
                      From {verdicts[l.url]!.data!.photos_checked} listing photo
                      {verdicts[l.url]!.data!.photos_checked === 1 ? "" : "s"} - not a
                      substitute for an in-person inspection.
                    </p>
                  </div>
                )}
              </li>
              );
            })}
          </ul>
          </>
        )}
      </main>
    </div>
  );
}
