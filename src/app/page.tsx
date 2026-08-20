"use client";

import { useState } from "react";

type Listing = {
  title: string;
  url: string;
  price?: string;
  year?: string;
  mileage_km?: string;
  location?: string;
  source: string;
};

export default function Home() {
  const [want, setWant] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listings, setListings] = useState<Listing[] | null>(null);

  async function search() {
    if (!want.trim()) return;
    setLoading(true);
    setError("");
    setListings(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
