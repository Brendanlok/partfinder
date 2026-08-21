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
};

type Verdict = {
  issues: string[];
  condition_summary: string;
  verdict: "buy" | "maybe" | "skip";
  photos_checked: number;
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

export default function Home() {
  const [want, setWant] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, VerdictState>>({});
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    if (!loading) return;
    setStatusIndex(0);
    const id = setInterval(
      () => setStatusIndex((i) => Math.min(i + 1, SEARCH_STATUS_MESSAGES.length - 1)),
      8000
    );
    return () => clearInterval(id);
  }, [loading]);

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

  async function search() {
    if (!want.trim()) return;
    setLoading(true);
    setError("");
    setListings(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
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
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            onClick={search}
            disabled={loading || !want.trim()}
            className="rounded-lg bg-black px-5 py-3 text-base font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
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
          <ul className="mt-6 flex flex-col gap-3">
            {listings.map((l) => (
              <li
                key={l.url}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-black hover:underline dark:text-zinc-50"
                >
                  {l.title}
                </a>
                <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {l.price && <span>{l.price}</span>}
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
                        {verdicts[l.url]!.data!.issues.map((issue, i) => (
                          <li key={i}>{issue}</li>
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
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
