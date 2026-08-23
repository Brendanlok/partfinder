"use client";

import { useEffect, useRef, useState } from "react";

// Minimal shape of the Web Speech API's SpeechRecognition - not in TS's default DOM
// lib (still non-standard/prefixed in some browsers), so type it loosely ourselves.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

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
  image?: string;
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

type PartEstimate = {
  issue: string;
  part_name: string;
  price?: string;
  url?: string;
  source_title?: string;
};

type PartsState = {
  loading?: boolean;
  error?: string;
  data?: PartEstimate[];
};

// Sums whatever priced parts came back - unpriced ones (no result found) are excluded,
// not treated as €0, so the total never understates cost by silently dropping a part.
function partsTotal(parts: PartEstimate[]): number {
  return parts.reduce((sum, p) => sum + (parsePrice(p.price) ?? 0), 0);
}

// "Build your car": only parts the user actually checked count toward the total - an
// auto-suggested part they haven't opted into shouldn't inflate what they'd pay.
function buildTotal(carPrice: number | null, checkedItems: PartEstimate[]): number {
  return (carPrice ?? 0) + partsTotal(checkedItems);
}

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
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [expandedVerdicts, setExpandedVerdicts] = useState<Set<string>>(new Set());
  const [showPartsCost, setShowPartsCost] = useState(false);
  const [parts, setParts] = useState<Record<string, PartsState>>({});
  const [checkedParts, setCheckedParts] = useState<Set<string>>(new Set());
  const [customParts, setCustomParts] = useState<Record<string, PartEstimate[]>>({});
  const [newPartName, setNewPartName] = useState("");
  const [newPartPrice, setNewPartPrice] = useState("");
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  // Escape closes the detail modal, same as clicking the backdrop or the × button.
  useEffect(() => {
    if (!selectedUrl) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedUrl(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedUrl]);

  function addCustomPart(listingUrl: string) {
    if (!newPartName.trim()) return;
    const part: PartEstimate = { issue: "custom", part_name: newPartName.trim() };
    if (newPartPrice.trim()) part.price = newPartPrice.trim();
    setCustomParts((prev) => ({ ...prev, [listingUrl]: [...(prev[listingUrl] ?? []), part] }));
    // Added parts are what the user is actively building with, so include them by default.
    setCheckedParts((prev) => new Set(prev).add(`${listingUrl}::${part.part_name}::custom`));
    setNewPartName("");
    setNewPartPrice("");
  }

  function removeCustomPart(listingUrl: string, index: number) {
    setCustomParts((prev) => ({
      ...prev,
      [listingUrl]: (prev[listingUrl] ?? []).filter((_, i) => i !== index),
    }));
  }

  function toggleVerdictExpanded(url: string) {
    setExpandedVerdicts((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function togglePartChecked(key: string) {
    setCheckedParts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

  // Checked in an effect (not inline in render) so the server-rendered static export
  // and the client's first render match - window/SpeechRecognition don't exist at build time.
  useEffect(() => {
    const w = window as SpeechRecognitionWindow;
    setSpeechSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => recognitionRef.current?.stop();
  }, []);

  function toggleListen() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const w = window as SpeechRecognitionWindow;
    const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript;
      if (transcript) setWant(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
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

  // One click estimates all of a listing's DIY issues at once (capped server-side) rather
  // than one call per issue - keeps this to a bounded, user-initiated Tavily/Gemini cost.
  async function fetchParts(listingUrl: string, issues: string[]) {
    setParts((p) => ({ ...p, [listingUrl]: { loading: true } }));
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_PARTS_FUNCTION_URL as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ issues, want }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't estimate parts cost.");
      setParts((p) => ({ ...p, [listingUrl]: { data: data.parts } }));
    } catch (e) {
      setParts((p) => ({
        ...p,
        [listingUrl]: { error: e instanceof Error ? e.message : "Couldn't estimate parts cost." },
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

  const selectedListing = listings?.find((l) => l.url === selectedUrl) ?? null;
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
      <main className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Partfinder
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Describe the car you want. We search mobile.de, AutoScout24, and
          Kleinanzeigen for matches.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              value={want}
              onChange={(e) => setWant(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="e.g. BMW E46 M3, manual, under 20k, good condition"
              className={`w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 ${speechSupported ? "pr-11" : ""}`}
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListen}
                aria-label={listening ? "Stop voice input" : "Speak your search"}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${listening ? "text-red-500" : "text-zinc-400 hover:text-black dark:text-zinc-500 dark:hover:text-zinc-50"}`}
              >
                {listening ? "⏹" : "🎤"}
              </button>
            )}
          </div>
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
              <label
                className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400"
                title="Ad price only, or also look up parts to fix up the car and build a shopping list"
              >
                <input
                  type="checkbox"
                  checked={showPartsCost}
                  onChange={(e) => setShowPartsCost(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                />
                + Parts &amp; build cost
              </label>
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

          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedListings.map((l) => {
              const price = parsePrice(l.price);
              const badge = median && price ? priceBadge(price, median) : null;
              return (
              <li key={l.url}>
                <button
                  type="button"
                  onClick={() => setSelectedUrl(l.url)}
                  className="block w-full overflow-hidden rounded-lg border border-zinc-200 bg-white text-left dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-800">
                    {l.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl text-zinc-300 dark:text-zinc-700">
                        🚗
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate font-medium text-black dark:text-zinc-50">{l.title}</p>
                    {typeof l.match_score === "number" && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${matchColor(l.match_score)}`}>
                          {l.match_score}% match
                        </span>
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {l.price && <span>{l.price}</span>}
                      {badge && (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                          {badge}
                        </span>
                      )}
                      {l.year && <span>{l.year}</span>}
                      {l.mileage_km && <span>{l.mileage_km} km</span>}
                      <span className="text-zinc-400 dark:text-zinc-600">{l.source}</span>
                    </div>
                  </div>
                </button>
              </li>
              );
            })}
          </ul>
          </>
        )}

        {selectedListing && (() => {
          const l = selectedListing;
          const price = parsePrice(l.price);
          const badge = median && price ? priceBadge(price, median) : null;
          const diyIssues = (verdicts[l.url]?.data?.issues ?? [])
            .filter((i) => i.difficulty === "diy")
            .map((i) => i.issue);
          const partsResult = parts[l.url];
          const allParts = [...(partsResult?.data ?? []), ...(customParts[l.url] ?? [])];
          const partKey = (p: PartEstimate, isCustom: boolean) =>
            `${l.url}::${p.part_name}${isCustom ? "::custom" : ""}`;
          const checkedItems = allParts.filter((p, i) =>
            checkedParts.has(partKey(p, i >= (partsResult?.data?.length ?? 0)))
          );
          return (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10 sm:items-center"
            onClick={() => setSelectedUrl(null)}
          >
            <div
              className="w-full max-w-2xl overflow-hidden rounded-lg bg-white dark:bg-zinc-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative aspect-[16/9] w-full bg-zinc-100 dark:bg-zinc-800">
                {l.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-5xl text-zinc-300 dark:text-zinc-700">
                    🚗
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedUrl(null)}
                  aria-label="Close"
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  ✕
                </button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-6">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-black hover:underline dark:text-zinc-50"
                >
                  {l.title} ↗
                </a>
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
                  {l.price && (
                    <span>
                      {l.price}
                    </span>
                  )}
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

                {verdicts[l.url]?.data && (() => {
                  const data = verdicts[l.url]!.data!;
                  const expanded = expandedVerdicts.has(l.url);
                  return (
                  <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
                    <button
                      onClick={() => toggleVerdictExpanded(l.url)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span>
                        <span className="font-medium text-black dark:text-zinc-50">{VERDICT_LABEL[data.verdict]}</span>
                        {data.issues.length > 0 && (
                          <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
                            · {data.issues.length} issue{data.issues.length === 1 ? "" : "s"} found
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-zinc-400 dark:text-zinc-500">{expanded ? "Hide ▲" : "Details ▼"}</span>
                    </button>
                    {expanded && (
                    <>
                    <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                      {data.condition_summary}
                    </p>
                    {data.issues.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-zinc-600 dark:text-zinc-400">
                        {data.issues.map((item, i) => (
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
                      From {data.photos_checked} listing photo
                      {data.photos_checked === 1 ? "" : "s"} - not a
                      substitute for an in-person inspection.
                    </p>

                    {showPartsCost && diyIssues.length > 0 && !partsResult && (
                      <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                        <button
                          onClick={() => fetchParts(l.url, diyIssues)}
                          className="text-xs font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                        >
                          Find parts needed
                        </button>
                      </div>
                    )}
                    </>
                    )}
                  </div>
                  );
                })()}

                {showPartsCost && (
                  <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
                    <p className="font-medium text-black dark:text-zinc-50">Build your car</p>

                    {partsResult?.loading && (
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Looking up parts…</p>
                    )}
                    {partsResult?.error && (
                      <p className="mt-2 text-xs text-red-600 dark:text-red-400">{partsResult.error}</p>
                    )}

                    {allParts.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {allParts.map((p, i) => {
                          const isCustom = i >= (partsResult?.data?.length ?? 0);
                          const key = partKey(p, isCustom);
                          return (
                            <li key={key} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                              <input
                                type="checkbox"
                                checked={checkedParts.has(key)}
                                onChange={() => togglePartChecked(key)}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 dark:border-zinc-700"
                              />
                              <span className="flex-1">
                                {p.part_name}
                                {p.price && <span className="ml-1 font-medium text-black dark:text-zinc-50">{p.price}</span>}
                                {p.url && (
                                  <a
                                    href={p.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-1 underline decoration-zinc-400 underline-offset-2"
                                  >
                                    {p.price ? "best deal found" : "shop this part"}
                                  </a>
                                )}
                              </span>
                              {isCustom && (
                                <button
                                  onClick={() => removeCustomPart(l.url, i - (partsResult?.data?.length ?? 0))}
                                  aria-label="Remove"
                                  className="shrink-0 text-zinc-400 hover:text-red-600 dark:text-zinc-500"
                                >
                                  ✕
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {allParts.some((p) => p.url) && (
                      <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-600">
                        Parts from kfzteile24.de - most need your exact model/engine picked on-site to show a
                        price, so links usually go to the right part category rather than a priced listing.
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={newPartName}
                        onChange={(e) => setNewPartName(e.target.value)}
                        placeholder="Add a part (e.g. Exhaust tips)"
                        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                      />
                      <input
                        value={newPartPrice}
                        onChange={(e) => setNewPartPrice(e.target.value)}
                        placeholder="€ (optional)"
                        className="w-24 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                      />
                      <button
                        onClick={() => addCustomPart(l.url)}
                        disabled={!newPartName.trim()}
                        className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
                      >
                        Add
                      </button>
                    </div>

                    <p className="mt-3 text-sm font-medium text-black dark:text-zinc-50">
                      Your build: €{buildTotal(price, checkedItems).toLocaleString()}
                      {checkedItems.length > 0 && (
                        <span className="font-normal text-zinc-500 dark:text-zinc-400">
                          {" "}
                          (car + {checkedItems.length} checked part{checkedItems.length === 1 ? "" : "s"})
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })()}
      </main>
    </div>
  );
}
