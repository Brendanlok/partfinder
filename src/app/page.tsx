"use client";

import { useEffect, useRef, useState } from "react";
import { findDuplicates, duplicateSummary, pickRepresentatives, type DuplicateMatch } from "@/lib/duplicates";
import { monthlyPayment } from "@/lib/finance";
import { draftNegotiationMessage } from "@/lib/negotiation";
import { translations, LANG_KEY, type Lang } from "@/lib/translations";
import { parsePrice } from "@/lib/price";
import { cleanMatchTags } from "@/lib/matchTags";

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

type Listing = {
  title: string;
  url: string;
  price?: string;
  year?: string;
  mileage_km?: string;
  fuel?: string;
  location?: string;
  source: string;
  match_score?: number;
  match_tags?: string[];
  image?: string;
  // The search text that produced this listing - saved listings persist across searches
  // (see `saved` state), so by the time a user opens an old saved listing the live `want`
  // input can already describe a completely different car. Tagged once at search time so
  // condition-check/tutorial/parts calls describe the right car, not whatever's in the box.
  want?: string;
};

function matchColor(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (score >= 50) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300";
}

type SortOption = "relevance" | "price_asc" | "price_desc" | "year_desc" | "mileage_asc";

const SORT_OPTIONS: SortOption[] = ["relevance", "price_asc", "price_desc", "year_desc", "mileage_asc"];

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
      // `|| Infinity` would treat a genuine 0 km listing (brand-new/demo car) as
      // "unknown" and sort it last instead of first - only fall back on NaN/missing.
      sorted.sort((a, b) => (parseMileage(a.mileage_km) ?? Infinity) - (parseMileage(b.mileage_km) ?? Infinity));
      break;
    default:
      sorted.sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
  }
  return sorted;
}

function parseMileage(mileage?: string): number | null {
  if (mileage === undefined) return null;
  const n = Number(mileage);
  return Number.isNaN(n) ? null : n;
}

// German buyers benchmark a used car against the ~15,000 km/year TÜV average: well
// below can mean it sat unused for long stretches (or a wound-back odometer), well
// above means hard use. Pure calc from year + mileage we already have - shown only
// when both are known and the car is at least a year old.
function kmPerYear(year?: string, mileage?: string): number | null {
  const y = Number(year);
  const km = parseMileage(mileage);
  if (!Number.isInteger(y) || y < 1950 || km === null || km < 0) return null;
  const age = new Date().getFullYear() - y;
  if (age < 1) return null;
  return Math.round(km / age);
}

function medianPrice(listings: Listing[]): number | null {
  const prices = listings.map((l) => parsePrice(l.price)).filter((p): p is number => p !== null).sort((a, b) => a - b);
  if (prices.length < 3) return null; // too few results for a comparison to mean anything
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
}

// ponytail: inspired by CarGurus' deal-rating badge, but scoped honestly to what we
// actually have - just this search's own results, not a market-wide price database.
type PriceBadge = "below" | "above";
function priceBadge(price: number, median: number): PriceBadge | null {
  if (price <= median * 0.9) return "below";
  if (price >= median * 1.1) return "above";
  return null; // near-median isn't worth calling out
}

// Combines the three signals a user otherwise has to weigh separately (match %, price
// vs. others, condition verdict) into one at-a-glance badge. Only meaningful once a
// condition check has run - callers gate on that.
type DealKey = "great" | "fair" | "risky";
function dealScore(
  matchScore: number | undefined,
  badge: PriceBadge | null,
  verdict: Verdict["verdict"]
): { key: DealKey; color: string } {
  let points = 0;
  if (typeof matchScore === "number") {
    if (matchScore >= 80) points += 1;
    else if (matchScore < 50) points -= 1;
  }
  if (badge === "below") points += 1;
  else if (badge === "above") points -= 1;
  if (verdict === "buy") points += 1;
  else if (verdict === "skip") points -= 1;

  if (points >= 2) return { key: "great", color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" };
  if (points <= -2) return { key: "risky", color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" };
  return { key: "fair", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" };
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

// Custom (user-added) parts get a stable id at creation - keying by part_name alone
// let two identically-named custom parts (or two Gemini-returned parts that happen to
// share a name) collide in the checkedParts Set, so checking one silently checked both.
type CustomPart = PartEstimate & { id: string };

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

const LAST_SEARCH_KEY = "partfinder:lastSearch";
const SAVED_KEY = "partfinder:saved";
const MAX_COMPARE = 3;

export default function Home() {
  // Lighter first-pass translation (main search screen only) - defaults to English,
  // sticks to whatever the user last picked via the EN/DE toggle.
  const [lang, setLang] = useState<Lang>("en");
  const t = translations[lang];
  // Every nf() call is a euro amount shown to the user - round to whole euros so a
  // part price with cents (129,95 €) doesn't drag decimals into the build/offer totals.
  const nf = (n: number) => Math.round(n).toLocaleString(lang === "de" ? "de-DE" : "en-US");
  // The search function now hands back mileage as bare digits ("85000"). Show it with
  // thousands separators so a 6-digit odometer reads at a glance. Older cached listings
  // stored it pre-formatted ("85.000") - leave any non-all-digits value untouched.
  const fmtKm = (km: string) =>
    /^\d+$/.test(km) ? Number(km).toLocaleString(lang === "de" ? "de-DE" : "en-US") : km;
  // Gemini hands back the price field inconsistently - sometimes "29.500 €", sometimes a
  // bare "29500". When it's just a number (optionally with € / separators) render a clean
  // "29.500 €" in the user's locale; anything with other words ("VB 5.000", "5.000 € VB")
  // passes through untouched so no real info is lost.
  const fmtPrice = (price: string) => {
    const n = parsePrice(price);
    return n !== null && /^[\s€.,\d]+$/.test(price) ? `${nf(n)} €` : price;
  };
  const [want, setWant] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, VerdictState>>({});
  const [tutorials, setTutorials] = useState<Record<string, TutorialState>>({});
  const [statusIndex, setStatusIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
  // Same excluded-values pattern as sourceFilter - buyers filter hard on fuel type.
  // Only shown when the current results actually carry a fuel value (autoscout24 snippets do).
  const [fuelFilter, setFuelFilter] = useState<Set<string>>(new Set());
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  // Off by default - collapsing cross-posted listings is a judgment call (which listing
  // "wins") that not every user wants made for them, so it's an opt-in view, not the default.
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [expandedVerdicts, setExpandedVerdicts] = useState<Set<string>>(new Set());
  const [showPartsCost, setShowPartsCost] = useState(false);
  const [parts, setParts] = useState<Record<string, PartsState>>({});
  const [checkedParts, setCheckedParts] = useState<Set<string>>(new Set());
  const [customParts, setCustomParts] = useState<Record<string, CustomPart[]>>({});
  const [newPartName, setNewPartName] = useState("");
  const [newPartPrice, setNewPartPrice] = useState("");
  const [financeDown, setFinanceDown] = useState("");
  const [financeApr, setFinanceApr] = useState("6.9");
  const [financeTerm, setFinanceTerm] = useState("48");
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  // A scraped og:image can 404 or hotlink-block by the time the browser (not our
  // server) loads it - track failures so those listings fall back to the 🚗
  // placeholder instead of showing a broken-image icon.
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  // Saved listings persist across searches (unlike LAST_SEARCH_KEY, which only remembers
  // the most recent one) - keyed by url so toggling is O(1) and re-saving is a no-op.
  const [saved, setSaved] = useState<Record<string, Listing>>({});
  const [showSaved, setShowSaved] = useState(false);
  // Compare only makes sense within the curated Saved list, not live search results -
  // capped at 3 so the comparison strip stays readable on a phone screen.
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  // Brief "Copied!" confirmation after sharing a search link - resets itself, no click away needed.
  const [copied, setCopied] = useState(false);
  // Same pattern for the build-report "Copy summary" button in the detail modal.
  const [summaryCopied, setSummaryCopied] = useState(false);
  // Negotiation draft is per-listing (which one's expanded) - Set, not a single bool,
  // same reasoning as expandedVerdicts.
  const [draftOpen, setDraftOpen] = useState<Set<string>>(new Set());
  const [draftCopied, setDraftCopied] = useState(false);

  // Escape closes the detail modal, same as clicking the backdrop or the × button.
  useEffect(() => {
    if (!selectedUrl) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedUrl(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedUrl]);

  // The "add a part" draft fields are global state, not per-listing - without this, a
  // half-typed part name/price for one car's modal would still be sitting in the inputs
  // when a different listing's modal opens next.
  useEffect(() => {
    setNewPartName("");
    setNewPartPrice("");
    setFinanceDown("");
    setFinanceApr("6.9");
    setFinanceTerm("48");
  }, [selectedUrl]);

  function addCustomPart(listingUrl: string) {
    if (!newPartName.trim()) return;
    const part: CustomPart = { issue: "custom", part_name: newPartName.trim(), id: crypto.randomUUID() };
    if (newPartPrice.trim()) part.price = newPartPrice.trim();
    setCustomParts((prev) => ({ ...prev, [listingUrl]: [...(prev[listingUrl] ?? []), part] }));
    // Added parts are what the user is actively building with, so include them by default.
    setCheckedParts((prev) => new Set(prev).add(`${listingUrl}::custom::${part.id}`));
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

  function toggleCompare(url: string) {
    setCompareSet((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else if (next.size < MAX_COMPARE) next.add(url);
      return next;
    });
  }

  // The parts the user actually ticked for a listing (fetched + custom), keyed the same
  // way everywhere - so the modal's "Your build" and the compare view's "Build total"
  // never disagree on the same car.
  function checkedItemsFor(url: string): (PartEstimate | CustomPart)[] {
    const dataParts = parts[url]?.data ?? [];
    const all: (PartEstimate | CustomPart)[] = [...dataParts, ...(customParts[url] ?? [])];
    return all.filter((p, i) =>
      checkedParts.has(
        i < dataParts.length ? `${url}::data::${i}` : `${url}::custom::${(p as CustomPart).id}`
      )
    );
  }

  // Puts the current search text in the URL (?q=...) and copies it - a link a friend
  // opens loads straight into the search box (see the load-restore effect above),
  // no server round-trip or saved-search state needed for that to work.
  async function shareSearch() {
    const url = new URL(window.location.href);
    url.search = want.trim() ? `?q=${encodeURIComponent(want.trim())}` : "";
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ponytail: clipboard blocked/unavailable (e.g. no HTTPS, permission denied), non-critical
    }
  }

  async function copyBuildSummary(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 2000);
    } catch {
      // ponytail: clipboard blocked/unavailable, non-critical
    }
  }

  function toggleDraftOpen(url: string) {
    setDraftOpen((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  async function copyDraft(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setDraftCopied(true);
      setTimeout(() => setDraftCopied(false), 2000);
    } catch {
      // ponytail: clipboard blocked/unavailable, non-critical
    }
  }

  function toggleSaved(listing: Listing) {
    setSaved((prev) => {
      const next = { ...prev };
      if (next[listing.url]) delete next[listing.url];
      else next[listing.url] = listing;
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      } catch {
        // ponytail: storage full/unavailable, non-critical
      }
      return next;
    });
  }

  // Restore the last successful search on load, so a refresh/back-nav doesn't
  // lose results (and force a re-search that burns another API call). A shared
  // search link (?q=...) takes priority over that - it's an explicit request to
  // load a different search, not a return visit to keep browsing the last one.
  useEffect(() => {
    try {
      const storedLang = localStorage.getItem(LANG_KEY);
      if (storedLang === "en" || storedLang === "de") setLang(storedLang);
    } catch {
      // ponytail: localStorage unavailable, just stays on the "en" default
    }
  }, []);

  function toggleLang() {
    setLang((prev) => {
      const next = prev === "en" ? "de" : "en";
      try {
        localStorage.setItem(LANG_KEY, next);
      } catch {
        // ponytail: localStorage unavailable, non-critical - just won't stick on reload
      }
      return next;
    });
  }

  useEffect(() => {
    const sharedWant = new URLSearchParams(window.location.search).get("q");
    if (sharedWant) {
      setWant(sharedWant);
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      try {
        const saved = localStorage.getItem(LAST_SEARCH_KEY);
        if (saved) {
          const { want: savedWant, listings: savedListings } = JSON.parse(saved);
          if (savedWant) setWant(savedWant);
          if (Array.isArray(savedListings))
            setListings(
              savedListings.map((l: Listing) => ({ ...l, match_tags: cleanMatchTags(l.match_tags) }))
            );
        }
      } catch {
        // ponytail: corrupt/old-shape localStorage data, ignore and start fresh
      }
    }
    try {
      const rawSaved = localStorage.getItem(SAVED_KEY);
      if (rawSaved) setSaved(JSON.parse(rawSaved));
    } catch {
      // ponytail: corrupt/old-shape localStorage data, ignore and start fresh
    }
  }, []);

  useEffect(() => {
    if (!loading) return;
    setStatusIndex(0);
    const id = setInterval(
      () => setStatusIndex((i) => Math.min(i + 1, t.statusMessages.length - 1)),
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
    // Follow the EN/DE toggle, not navigator.language - a German user on an
    // English-set phone still describes the car in German.
    recognition.lang = t.speechLang;
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
        body: JSON.stringify({ url: listing.url, want: listing.want ?? want }),
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
  async function fetchTutorial(listingUrl: string, issue: string, wantContext: string) {
    const key = `${listingUrl}::${issue}`;
    setTutorials((t) => ({ ...t, [key]: { loading: true } }));
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_TUTORIAL_FUNCTION_URL as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ issue, want: wantContext }),
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
  async function fetchParts(listingUrl: string, issues: string[], wantContext: string) {
    setParts((p) => ({ ...p, [listingUrl]: { loading: true } }));
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_PARTS_FUNCTION_URL as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ issues, want: wantContext }),
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
    // The Search button is `disabled` while loading, but Enter-to-search bypasses
    // that guard - without this, a fast double-Enter fires two concurrent Tavily
    // searches, burning quota that's genuinely scarce (1,000/month, shared with real users).
    if (loading || !want.trim()) return;
    setLoading(true);
    setError("");
    setListings(null);
    setSortBy("relevance");
    setSourceFilter(new Set());
    setFuelFilter(new Set());
    setMinPrice("");
    setMaxPrice("");
    setHideDuplicates(false);
    setShowSaved(false);
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
      const taggedListings = Array.isArray(data.listings)
        ? data.listings.map((l: Listing) => ({ ...l, want, match_tags: cleanMatchTags(l.match_tags) }))
        : data.listings;
      setListings(taggedListings);
      try {
        localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify({ want, listings: taggedListings }));
      } catch {
        // ponytail: storage full/unavailable, non-critical
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const savedCount = Object.keys(saved).length;
  // Saved view replaces search results entirely (its own list, spanning past searches) -
  // everything below (sort/filter/median/modal lookup) reads from this instead of `listings`.
  const displayedListings: Listing[] | null = showSaved ? Object.values(saved) : listings;
  const selectedListing =
    listings?.find((l) => l.url === selectedUrl) ?? (selectedUrl ? saved[selectedUrl] : undefined) ?? null;
  const availableSources = displayedListings ? [...new Set(displayedListings.map((l) => l.source))] : [];
  const availableFuels = displayedListings
    ? [...new Set(displayedListings.map((l) => l.fuel).filter((f): f is string => !!f))]
    : [];
  // Only offer a sort the current results can actually act on - listings often come back
  // with no year/mileage (autoscout24 snippets are thin), and an option that silently
  // does nothing when picked just looks broken.
  const availableSortOptions = SORT_OPTIONS.filter((opt) => {
    const ls = displayedListings ?? [];
    if (opt === "price_asc" || opt === "price_desc") return ls.some((l) => parsePrice(l.price) !== null);
    if (opt === "year_desc") return ls.some((l) => /^(19|20)\d{2}$/.test((l.year ?? "").trim()));
    if (opt === "mileage_asc") return ls.some((l) => parseMileage(l.mileage_km) !== null);
    return true; // relevance
  });
  const effectiveSort = availableSortOptions.includes(sortBy) ? sortBy : "relevance";
  const filteredListings = displayedListings
    ? displayedListings.filter((l) => {
        if (sourceFilter.has(l.source)) return false;
        if (l.fuel && fuelFilter.has(l.fuel)) return false;
        if (minPrice || maxPrice) {
          const p = parsePrice(l.price);
          if (p !== null && minPrice && p < Number(minPrice)) return false;
          if (p !== null && maxPrice && p > Number(maxPrice)) return false;
        }
        return true;
      })
    : [];
  const sortedAndFilteredListings = sortListings(filteredListings, effectiveSort);
  // Median (for the below/above-market badge) is over the full result set, not the
  // price-filtered view - the badge means "cheap for this kind of car", so a min/max
  // price filter shouldn't recalibrate it (a €5k car under a €5-8k filter is still a
  // below-market car). Same principle as the duplicates note below.
  const median = medianPrice(displayedListings ?? []);
  // Duplicates are computed over everything fetched/saved, not just the filtered/sorted
  // view - a source hidden by the filter checkboxes can still be the cheaper match worth
  // surfacing on the listing that IS shown.
  const duplicates = displayedListings ? findDuplicates(displayedListings) : {};
  // Applied last, after sort/filter - collapses each cross-posted cluster down to its one
  // best-match_score listing (see pickRepresentatives), so "Also on X" still tells the user
  // about the sibling even though its own card no longer takes up a grid slot.
  const sortedListings = hideDuplicates
    ? pickRepresentatives(sortedAndFilteredListings, duplicates)
    : sortedAndFilteredListings;

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

  function toggleFuel(fuel: string) {
    setFuelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(fuel)) next.delete(fuel);
      else next.add(fuel);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black px-4 py-10 sm:py-16">
      <main className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Partfinder
          </h1>
          <button
            type="button"
            onClick={toggleLang}
            className="shrink-0 rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-500 hover:text-black dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
          >
            {lang === "en" ? "DE" : "EN"}
          </button>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t.subtitle}
          </p>
          {(savedCount > 0 || showSaved) && (
            <button
              type="button"
              onClick={() => {
                // Saved is a separate curated list, not a continuation of the search -
                // filters left over from a search (e.g. one source unchecked) could
                // otherwise hide a saved listing with a confusing "no results" message.
                setSourceFilter(new Set());
                setFuelFilter(new Set());
                setMinPrice("");
                setMaxPrice("");
                setCompareSet(new Set());
                setShowCompare(false);
                setShowSaved((s) => !s);
              }}
              className="shrink-0 text-sm font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
            >
              {showSaved ? t.backToSearch : t.saved(savedCount)}
            </button>
          )}
        </div>

        {showSaved && compareSet.size >= 2 && (
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCompare(true)}
              className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black"
            >
              {t.compareSelected(compareSet.size)}
            </button>
            <button
              type="button"
              onClick={() => setCompareSet(new Set())}
              className="text-xs text-zinc-500 underline decoration-zinc-400 underline-offset-2 dark:text-zinc-400"
            >
              {t.clear}
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              value={want}
              onChange={(e) => setWant(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder={t.searchPlaceholder}
              className={`w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 ${speechSupported ? "pr-11" : ""}`}
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListen}
                aria-label={listening ? t.stopVoiceInput : t.speakYourSearch}
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
            {loading ? t.searching : t.search}
          </button>
        </div>

        {!showSaved && !displayedListings && !loading && (
          // First-load empty state only (never searched yet) - lowers the barrier for a
          // first-time visitor. Fills the box rather than auto-searching, so a stray tap
          // doesn't spend a real Tavily search - same reasoning as the shared-search-link restore.
          <div className="mt-4 flex flex-wrap gap-2">
            {t.exampleSearches.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setWant(ex)}
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-500 hover:text-black dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {loading && !showSaved && (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            {t.statusMessages[statusIndex]}
          </p>
        )}

        {error && !showSaved && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {displayedListings && displayedListings.length === 0 && !error && (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
            {showSaved ? t.noSavedListings : t.noMatchingListings}
          </p>
        )}

        {displayedListings && displayedListings.length > 0 && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <select
                value={effectiveSort}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {availableSortOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {t.sortLabels[opt]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="numeric"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder={t.minPricePlaceholder}
                className="w-28 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <input
                type="number"
                inputMode="numeric"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder={t.maxPricePlaceholder}
                className="w-28 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
              {availableFuels.map((f) => (
                <label key={f} className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={!fuelFilter.has(f)}
                    onChange={() => toggleFuel(f)}
                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                  />
                  {f}
                </label>
              ))}
              <label
                className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400"
                title={t.partsBuildCostTitle}
              >
                <input
                  type="checkbox"
                  checked={showPartsCost}
                  onChange={(e) => setShowPartsCost(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                />
                {t.partsBuildCost}
              </label>
              {Object.keys(duplicates).length > 0 && (
                <label
                  className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400"
                  title={t.hideDuplicatesTitle}
                >
                  <input
                    type="checkbox"
                    checked={hideDuplicates}
                    onChange={(e) => setHideDuplicates(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                  />
                  {t.hideDuplicates}
                </label>
              )}
              {!showSaved && (
                <button
                  type="button"
                  onClick={shareSearch}
                  className="text-sm font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                >
                  {copied ? t.copied : t.shareSearch}
                </button>
              )}
            </div>

            {sortedListings.length === 0 && (
              <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
                {t.noResultsFilters}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setSourceFilter(new Set());
                    setFuelFilter(new Set());
                    setMinPrice("");
                    setMaxPrice("");
                  }}
                  className="font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                >
                  {t.clearFilters}
                </button>
              </p>
            )}

            {sortedListings.length > 0 && sortedListings.length < displayedListings.length && (
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                {t.showingOf(sortedListings.length, displayedListings.length)}
              </p>
            )}

          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedListings.map((l) => {
              const price = parsePrice(l.price);
              const badge = median && price ? priceBadge(price, median) : null;
              return (
              <li key={l.url} className="relative">
                {showSaved && (
                  // Sibling of the modal-open button below, not nested inside it - an
                  // <input> inside a <button> is invalid HTML and would also trigger
                  // the modal to open on every click.
                  <label className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
                    <input
                      type="checkbox"
                      checked={compareSet.has(l.url)}
                      onChange={() => toggleCompare(l.url)}
                      disabled={!compareSet.has(l.url) && compareSet.size >= MAX_COMPARE}
                      className="h-3.5 w-3.5 rounded"
                    />
                    {t.compare}
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => toggleSaved(l)}
                  aria-label={saved[l.url] ? t.removeFromSaved : t.saveListing}
                  className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-base leading-none text-white hover:bg-black/70"
                >
                  {saved[l.url] ? "★" : "☆"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUrl(l.url)}
                  className="block w-full overflow-hidden rounded-lg border border-zinc-200 bg-white text-left dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-800">
                    {l.image && !brokenImages.has(l.url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.image}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={() => setBrokenImages((prev) => new Set(prev).add(l.url))}
                      />
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
                          {l.match_score}{t.matchSuffix}
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
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {l.price && <span>{fmtPrice(l.price)}</span>}
                      {badge && (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                          {badge === "below" ? t.priceBelow : t.priceAbove}
                        </span>
                      )}
                      {l.year && <span>{l.year}</span>}
                      {l.mileage_km && <span>{fmtKm(l.mileage_km)} km</span>}
                      {l.fuel && <span>{l.fuel}</span>}
                      {(() => {
                        const kpy = kmPerYear(l.year, l.mileage_km);
                        return kpy !== null ? (
                          <span className="text-zinc-400 dark:text-zinc-600" title={t.kmPerYearTitle}>
                            {nf(kpy)}{t.perYearSuffix}
                          </span>
                        ) : null;
                      })()}
                      <span className="text-zinc-400 dark:text-zinc-600">{l.source}</span>
                    </div>
                    {duplicates[l.url] && (
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {t.alsoOn} {duplicateSummary(duplicates[l.url])}
                      </p>
                    )}
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
          const dataParts = partsResult?.data ?? [];
          const allParts: (PartEstimate | CustomPart)[] = [...dataParts, ...(customParts[l.url] ?? [])];
          // Data parts are keyed by their (stable, never-reordered) index; custom parts by
          // their own id - part_name alone isn't unique (two parts can share a name).
          const partKey = (p: PartEstimate | CustomPart, i: number) =>
            i < dataParts.length ? `${l.url}::data::${i}` : `${l.url}::custom::${(p as CustomPart).id}`;
          const checkedItems = checkedItemsFor(l.url);
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
                {l.image && !brokenImages.has(l.url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.image}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setBrokenImages((prev) => new Set(prev).add(l.url))}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-5xl text-zinc-300 dark:text-zinc-700">
                    🚗
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => toggleSaved(l)}
                  aria-label={saved[l.url] ? t.removeFromSaved : t.saveListing}
                  className="absolute right-14 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-lg leading-none text-white hover:bg-black/80"
                >
                  {saved[l.url] ? "★" : "☆"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUrl(null)}
                  aria-label={t.close}
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
                      {l.match_score}{t.matchSuffix}
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
                      {fmtPrice(l.price)}
                    </span>
                  )}
                  {badge && (
                    <span
                      className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                      title={t.priceBadgeTitle}
                    >
                      {badge === "below" ? t.priceBelow : t.priceAbove}
                    </span>
                  )}
                  {l.year && <span>{l.year}</span>}
                  {l.mileage_km && <span>{fmtKm(l.mileage_km)} km</span>}
                  {l.fuel && <span>{l.fuel}</span>}
                  {(() => {
                    const kpy = kmPerYear(l.year, l.mileage_km);
                    return kpy !== null ? (
                      <span title={t.kmPerYearTitle}>{nf(kpy)}{t.perYearSuffix}</span>
                    ) : null;
                  })()}
                  {l.location && <span>{l.location}</span>}
                  <span className="text-zinc-400 dark:text-zinc-600">
                    {l.source}
                  </span>
                </div>

                {duplicates[l.url] && (
                  <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {t.alsoListedOn}{" "}
                    {duplicates[l.url].map((m, i) => (
                      <span key={m.url}>
                        {i > 0 && ", "}
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-zinc-400 underline-offset-2"
                        >
                          {m.source}{m.price ? ` (${fmtPrice(m.price)})` : ""}
                        </a>
                      </span>
                    ))}
                  </p>
                )}

                {!verdicts[l.url] && (
                  <button
                    onClick={() => checkCondition(l)}
                    className="mt-3 text-sm font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                  >
                    {t.checkCondition}
                  </button>
                )}

                {verdicts[l.url]?.loading && (
                  <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                    {t.readingPhotos}
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
                  const deal = dealScore(l.match_score, badge, data.verdict);
                  return (
                  <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
                    <button
                      onClick={() => toggleVerdictExpanded(l.url)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span>
                        <span className={`mr-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${deal.color}`}>
                          {t.dealLabels[deal.key]}
                        </span>
                        <span className="font-medium text-black dark:text-zinc-50">{t.verdictLabels[data.verdict]}</span>
                        {data.issues.length > 0 && (
                          <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
                            {" "}{t.issuesFound(data.issues.length)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-zinc-400 dark:text-zinc-500">{expanded ? t.hide : t.details}</span>
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
                              {t.difficultyLabels[item.difficulty]}
                            </span>
                            {item.difficulty === "diy" && (() => {
                              const tutorialKey = `${l.url}::${item.issue}`;
                              return (
                              <>
                                {!tutorials[tutorialKey] && (
                                  <button
                                    onClick={() => fetchTutorial(l.url, item.issue, l.want ?? want)}
                                    className="ml-2 text-xs font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                                  >
                                    {t.howToFix}
                                  </button>
                                )}
                                {tutorials[tutorialKey]?.loading && (
                                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                                    {t.writingSteps}
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
                      {t.photosDisclaimer(data.photos_checked)}
                    </p>

                    {showPartsCost && diyIssues.length > 0 && !partsResult && (
                      <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                        <button
                          onClick={() => fetchParts(l.url, diyIssues, l.want ?? want)}
                          className="text-xs font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                        >
                          {t.findPartsNeeded}
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
                    <p className="font-medium text-black dark:text-zinc-50">{t.buildYourCar}</p>

                    {partsResult?.loading && (
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{t.lookingUpParts}</p>
                    )}
                    {partsResult?.error && (
                      <p className="mt-2 text-xs text-red-600 dark:text-red-400">{partsResult.error}</p>
                    )}

                    {allParts.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {allParts.map((p, i) => {
                          const isCustom = i >= dataParts.length;
                          const key = partKey(p, i);
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
                                    {p.price ? t.bestDealFound : t.shopThisPart}
                                  </a>
                                )}
                              </span>
                              {isCustom && (
                                <button
                                  onClick={() => removeCustomPart(l.url, i - dataParts.length)}
                                  aria-label={t.clear}
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
                        {t.partsSourcesNote}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={newPartName}
                        onChange={(e) => setNewPartName(e.target.value)}
                        placeholder={t.addPartPlaceholder}
                        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                      />
                      <input
                        value={newPartPrice}
                        onChange={(e) => setNewPartPrice(e.target.value)}
                        placeholder={t.partPricePlaceholder}
                        className="w-24 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                      />
                      <button
                        onClick={() => addCustomPart(l.url)}
                        disabled={!newPartName.trim()}
                        className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
                      >
                        {t.add}
                      </button>
                    </div>

                    <p className="mt-3 text-sm font-medium text-black dark:text-zinc-50">
                      {t.yourBuild}: {nf(buildTotal(price, checkedItems))} €
                      {checkedItems.length > 0 && (
                        <span className="font-normal text-zinc-500 dark:text-zinc-400">
                          {" "}
                          {t.buildParenthetical(checkedItems.length)}
                        </span>
                      )}
                    </p>
                    {price !== null && dataParts.some((p) => p.price) && (
                      // Uses the parts data already fetched (no new Tavily/Gemini call) -
                      // asking price minus the found parts' real cost is a defensible
                      // opening number, not a fabricated estimate.
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {t.suggestedOffer(
                          nf(Math.max(0, price - partsTotal(dataParts))),
                          nf(partsTotal(dataParts))
                        )}
                      </p>
                    )}
                    {price !== null && dataParts.some((p) => p.price) && (
                      // Same gate as the offer line above - only worth drafting a message once
                      // there's an actual number to propose. Plain template, not a Gemini call,
                      // so this stays zero ongoing API cost.
                      <div className="mt-1">
                        <button
                          onClick={() => toggleDraftOpen(l.url)}
                          className="text-xs font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                        >
                          {t.draftMessage}
                        </button>
                        {draftOpen.has(l.url) &&
                          (() => {
                            const offer = Math.max(0, price - partsTotal(dataParts));
                            const issues = (verdicts[l.url]?.data?.issues ?? []).map((i) => i.issue);
                            const message = draftNegotiationMessage({ title: l.title, askingPrice: price, offer, issues });
                            return (
                              <div className="mt-2">
                                <textarea
                                  readOnly
                                  value={message}
                                  rows={5}
                                  className="w-full rounded-lg border border-zinc-300 bg-white p-2 text-xs text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                                />
                                <button
                                  onClick={() => copyDraft(message)}
                                  className="mt-1 text-xs font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                                >
                                  {draftCopied ? t.copied : t.copyMessage}
                                </button>
                              </div>
                            );
                          })()}
                      </div>
                    )}

                    {(() => {
                      const total = buildTotal(price, checkedItems);
                      const financed = Math.max(0, total - (Number(financeDown) || 0));
                      const monthly = monthlyPayment(financed, Number(financeApr) || 0, Number(financeTerm) || 0);
                      return (
                        <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                          <p className="text-xs font-medium text-black dark:text-zinc-50">{t.financingEstimate}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={financeDown}
                              onChange={(e) => setFinanceDown(e.target.value)}
                              placeholder={t.downPaymentPlaceholder}
                              className="w-32 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              value={financeApr}
                              onChange={(e) => setFinanceApr(e.target.value)}
                              placeholder={t.aprPlaceholder}
                              className="w-20 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                            />
                            <input
                              type="number"
                              inputMode="numeric"
                              value={financeTerm}
                              onChange={(e) => setFinanceTerm(e.target.value)}
                              placeholder={t.termPlaceholder}
                              className="w-28 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-black outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                            />
                          </div>
                          <p className="mt-2 text-sm font-medium text-black dark:text-zinc-50">
                            {monthly !== null
                              ? t.perMonth(nf(Math.round(monthly)))
                              : t.downPaymentTooHigh}
                          </p>
                          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
                            {t.financingDisclaimer}
                          </p>
                        </div>
                      );
                    })()}

                    {(() => {
                      const data = verdicts[l.url]?.data;
                      const total = buildTotal(price, checkedItems);
                      const lines = [
                        l.title,
                        [l.price ? fmtPrice(l.price) : null, l.year, l.mileage_km ? `${fmtKm(l.mileage_km)} km` : null, l.fuel].filter(Boolean).join(" · "),
                        data ? t.summaryConditionLine(t.verdictLabels[data.verdict], data.condition_summary) : null,
                        checkedItems.length > 0
                          ? `${t.summaryCheckedParts}\n${checkedItems
                              .map((p) => `- ${p.part_name}${p.price ? ` (${p.price})` : ""}`)
                              .join("\n")}`
                          : null,
                        t.summaryBuildTotal(nf(total)),
                        price !== null && dataParts.some((p) => p.price)
                          ? t.summaryOffer(nf(Math.max(0, price - partsTotal(dataParts))))
                          : null,
                        l.url,
                      ].filter(Boolean);
                      return (
                        <button
                          onClick={() => copyBuildSummary(lines.join("\n\n"))}
                          className="mt-3 text-xs font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                        >
                          {summaryCopied ? t.copied : t.copySummary}
                        </button>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })()}

        {showCompare && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10 sm:items-center"
            onClick={() => setShowCompare(false)}
          >
            <div
              className="w-full max-w-4xl rounded-lg bg-white p-4 dark:bg-zinc-900 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-black dark:text-zinc-50">{t.compareListings}</p>
                <button
                  type="button"
                  onClick={() => setShowCompare(false)}
                  aria-label={t.close}
                  className="text-zinc-400 hover:text-black dark:text-zinc-500 dark:hover:text-zinc-50"
                >
                  ✕
                </button>
              </div>
              {/* Horizontal scroll, not a fixed-column table - keeps this usable at 375px
                  without squeezing every cell unreadable. */}
              <div className="mt-4 overflow-x-auto">
                <div className="flex gap-4">
                  {[...compareSet].map((url) => {
                    const l = saved[url];
                    if (!l) return null;
                    const v = verdicts[url]?.data;
                    const cmpPrice = parsePrice(l.price);
                    const cmpChecked = checkedItemsFor(url);
                    // Same number as the detail modal's "Your build" - car price plus only
                    // the parts actually ticked, not every part that came back.
                    const total =
                      cmpPrice === null && cmpChecked.length === 0
                        ? null
                        : buildTotal(cmpPrice, cmpChecked);
                    return (
                      <div
                        key={url}
                        className="w-48 shrink-0 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800 sm:w-56"
                      >
                        <div className="aspect-[4/3] w-full overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                          {l.image && !brokenImages.has(url) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-2xl text-zinc-300 dark:text-zinc-700">
                              🚗
                            </div>
                          )}
                        </div>
                        <p className="mt-2 truncate font-medium text-black dark:text-zinc-50">{l.title}</p>
                        <dl className="mt-1.5 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                          <div className="flex justify-between gap-2">
                            <dt>{t.colPrice}</dt>
                            <dd className="text-right">{l.price ? fmtPrice(l.price) : "—"}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt>{t.colYear}</dt>
                            <dd className="text-right">{l.year ?? "—"}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt>{t.colMileage}</dt>
                            <dd className="text-right">{l.mileage_km ? `${fmtKm(l.mileage_km)} km` : "—"}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt>{t.colFuel}</dt>
                            <dd className="text-right">{l.fuel ?? "—"}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt>{t.colSource}</dt>
                            <dd className="text-right">{l.source}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt>{t.colMatch}</dt>
                            <dd className="text-right">
                              {typeof l.match_score === "number" ? `${l.match_score}%` : "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt>{t.colCondition}</dt>
                            <dd className="text-right">{v ? t.verdictLabels[v.verdict] : t.notChecked}</dd>
                          </div>
                          <div className="flex justify-between gap-2 font-medium text-black dark:text-zinc-50">
                            <dt>{t.colBuildTotal}</dt>
                            <dd className="text-right">{total !== null ? `${nf(total)} €` : "—"}</dd>
                          </div>
                        </dl>
                        <button
                          type="button"
                          onClick={() => {
                            setShowCompare(false);
                            setSelectedUrl(url);
                          }}
                          className="mt-2 text-xs font-medium text-black underline decoration-zinc-400 underline-offset-2 dark:text-zinc-50"
                        >
                          {t.openDetails}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
