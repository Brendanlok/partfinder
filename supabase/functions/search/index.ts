// Runs server-side on Supabase Edge Functions (Deno). Keeps TAVILY_API_KEY / GEMINI_API_KEY
// secret - only the anon/publishable key (safe to expose) reaches the static frontend.
const LISTING_SITES = ["mobile.de", "autoscout24.de", "kleinanzeigen.de"];

// Per-site shape of a single-ad permalink vs. a category/search-results page - Gemini
// sometimes invents specific title/price/mileage from a category page's snippet and
// passes it off as one listing, so reject those by URL shape before they reach it.
function isSingleListingUrl(url: string): boolean {
  const u = new URL(url);
  if (u.hostname.endsWith("kleinanzeigen.de")) return u.pathname.includes("/s-anzeige/");
  if (u.hostname.endsWith("autoscout24.de")) return u.pathname.startsWith("/angebote/");
  if (u.hostname.endsWith("mobile.de")) return u.pathname.endsWith("/details.html") && u.searchParams.has("id");
  return false;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Tavily's domain-restricted car search usually surfaces category/hub pages rather than
// single-ad permalinks (verified directly: for common queries almost every result is a
// hub page). Both real ad sites embed genuine ad links in a hub page's HTML - kleinanzeigen
// as plain hrefs, autoscout24 as quoted JSON paths - so crawl those instead of giving up.
// mobile.de blocks all automated fetches (see verdict/index.ts), so it can't be crawled.
const AD_PATH_PATTERN: Record<string, RegExp> = {
  "kleinanzeigen.de": /"(\/s-anzeige\/[^"]+)"/g,
  "autoscout24.de": /"(\/angebote\/[^"]+)"/g,
};

async function crawlForListingUrls(hubUrl: string): Promise<string[]> {
  const site = Object.keys(AD_PATH_PATTERN).find((s) => new URL(hubUrl).hostname.endsWith(s));
  if (!site) return [];
  try {
    const res = await fetch(hubUrl, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const html = await res.text();
    const paths = [...html.matchAll(AD_PATH_PATTERN[site])].map((m) => m[1]);
    return [...new Set(paths)].map((p) => new URL(p, hubUrl).href).slice(0, 5);
  } catch {
    return [];
  }
}

// Real title/description straight from the ad page's meta tags, not an LLM guess -
// keeps the crawl fallback as fabrication-proof as the direct-hit path.
async function fetchListingSnippet(url: string): Promise<{ title: string; content: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const title = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/)?.[1];
    const content = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/)?.[1] ?? "";
    return title ? { title, content } : null;
  } catch {
    return null;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400, headers: corsHeaders });
  }
  const { want } = body;
  if (!want || typeof want !== "string") {
    return Response.json({ error: "Describe the car you want." }, { status: 400, headers: corsHeaders });
  }

  const tavilyRes = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: Deno.env.get("TAVILY_API_KEY"),
      query: `${want} gebraucht kaufen Germany used car listing`,
      include_domains: LISTING_SITES,
      // ponytail: "basic" depth is ~1 Tavily credit and single-pass vs "advanced"'s
      // multi-pass rerank (~2 credits, most of the old 30-50s). Queries here are
      // already narrow (include_domains + a specific car ask), so basic's recall
      // is plenty - bump back to advanced if match quality regresses.
      search_depth: "basic",
      max_results: 10,
    }),
  });
  if (!tavilyRes.ok) {
    return Response.json({ error: "Search failed, try again." }, { status: 502, headers: corsHeaders });
  }
  const tavilyData = await tavilyRes.json();
  // ponytail: Tavily's include_domains isn't a hard filter in practice, so enforce it ourselves
  const onListingSite = (r: { url: string }) => LISTING_SITES.some((site) => new URL(r.url).hostname.endsWith(site));
  const directResults = (tavilyData.results ?? []).filter(
    (r: { url: string }) => onListingSite(r) && isSingleListingUrl(r.url)
  );

  // ponytail: always run the crawl fallback too, not only when direct hits are zero (root
  // cause of the P1 empty-results bug, confirmed via debug endpoints this session: Tavily's
  // direct single-listing hits can be stale/sold-out with thin content, so Gemini correctly
  // judges them as no real match and returns zero - even though the crawl fallback would have
  // found fresh listings from the same hub pages). Merging both (deduped by URL) costs no
  // extra Tavily/Gemini calls, just a few extra plain fetches to the listing sites.
  const hubUrls = (tavilyData.results ?? []).filter(onListingSite).slice(0, 3).map((r: { url: string }) => r.url);
  const crawledUrls = [...new Set((await Promise.all(hubUrls.map(crawlForListingUrls))).flat())].slice(0, 8);
  const snippets = await Promise.all(crawledUrls.map(fetchListingSnippet));
  const crawledResults = crawledUrls
    .map((url, i) => (snippets[i] ? { title: snippets[i]!.title, url, content: snippets[i]!.content } : null))
    .filter((r: unknown): r is { title: string; url: string; content: string } => !!r);

  const seenUrls = new Set<string>();
  const rawResults = [...directResults, ...crawledResults].filter((r: { url: string }) => {
    if (seenUrls.has(r.url)) return false;
    seenUrls.add(r.url);
    return true;
  });

  if (rawResults.length === 0) {
    return Response.json({ listings: [] }, { headers: corsHeaders });
  }

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${Deno.env.get("GEMINI_API_KEY")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `A user wants this car in Germany: "${want}"\n\nHere are raw search results from German car marketplaces (mobile.de, autoscout24.de, kleinanzeigen.de), already filtered to single-listing pages:\n${JSON.stringify(
                  rawResults.map((r: { title: string; url: string; content: string }) => ({
                    title: r.title,
                    url: r.url,
                    snippet: r.content,
                  }))
                )}\n\nPull out every distinct real car mentioned that plausibly matches what the user wants (skip generic articles/guides with no specific car for sale). One entry per car, even if several share the same source URL - that's fine, the URL is just where to click through and find it. Extract what's visible: title, price (a EUR amount - never a distance - or null if not shown), year, mileage_km (a km distance as digits only, no "km" suffix and never a price - or null if not shown), location, source site. Also rate match_score 0-100 for how well this specific listing fits what the user asked for, based only on what's in the title/snippet (spec match, price fit if a budget was mentioned, condition wording) - be honest, don't default to a high score. Give match_tags: 1-4 short tags (2-3 words each) naming the specific reasons, e.g. "Manual gearbox", "Under budget", "High mileage", "Right generation" - whatever is actually true of this listing, positive or negative. Return JSON only.`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              listings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    price: { type: "string" },
                    year: { type: "string" },
                    mileage_km: { type: "string" },
                    location: { type: "string" },
                    source: { type: "string" },
                    match_score: { type: "number" },
                    match_tags: { type: "array", items: { type: "string" } },
                  },
                  required: ["title", "url", "source", "match_score"],
                },
              },
            },
            required: ["listings"],
          },
        },
      }),
    }
  );
  if (!geminiRes.ok) {
    return Response.json({ error: "Couldn't read the results, try again." }, { status: 502, headers: corsHeaders });
  }
  const geminiData = await geminiRes.json();
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  let parsed: { listings?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    // ponytail: Gemini occasionally returns malformed/truncated JSON despite schema mode -
    // fail with the same friendly-error shape as every other path here, not an uncaught 500.
    return Response.json({ error: "Couldn't read the results, try again." }, { status: 502, headers: corsHeaders });
  }

  // ponytail: Gemini occasionally echoes a schema field's own name back as its value
  // (e.g. year: "year"), or defaults price/mileage to "0" when it's actually unknown -
  // neither is a real value, so strip both before they hit the UI.
  const OPTIONAL_FIELDS = ["price", "year", "mileage_km", "location"];
  const listings = (parsed.listings ?? []).map((l: Record<string, unknown>) => {
    const clean = { ...l };
    for (const key of OPTIONAL_FIELDS) {
      const v = typeof clean[key] === "string" ? (clean[key] as string).trim().toLowerCase() : null;
      const isZero = (key === "price" || key === "mileage_km") && v === "0";
      if (v !== null && (v === key || isZero)) delete clean[key];
    }
    // clamp in case Gemini strays outside the 0-100 range it was asked for
    if (typeof clean.match_score === "number") {
      clean.match_score = Math.max(0, Math.min(100, Math.round(clean.match_score)));
    }
    return clean;
  });

  return Response.json({ listings }, { headers: corsHeaders });
});
