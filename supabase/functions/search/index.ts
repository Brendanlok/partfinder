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

  const { want } = await req.json();
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
  let rawResults = (tavilyData.results ?? []).filter((r: { url: string }) => onListingSite(r) && isSingleListingUrl(r.url));

  if (rawResults.length === 0) {
    const hubUrls = (tavilyData.results ?? []).filter(onListingSite).slice(0, 3).map((r: { url: string }) => r.url);
    const crawledUrls = [...new Set((await Promise.all(hubUrls.map(crawlForListingUrls))).flat())].slice(0, 8);
    const snippets = await Promise.all(crawledUrls.map(fetchListingSnippet));
    rawResults = crawledUrls
      .map((url, i) => (snippets[i] ? { title: snippets[i]!.title, url, content: snippets[i]!.content } : null))
      .filter((r: unknown): r is { title: string; url: string; content: string } => !!r);
  }

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
                )}\n\nPull out every distinct real car mentioned that plausibly matches what the user wants (skip generic articles/guides with no specific car for sale). One entry per car, even if several share the same source URL - that's fine, the URL is just where to click through and find it. Extract what's visible: title, price (a EUR amount - never a distance - or null if not shown), year, mileage_km (a km distance as digits only, no "km" suffix and never a price - or null if not shown), location, source site. Return JSON only.`,
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
                  },
                  required: ["title", "url", "source"],
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
  const parsed = JSON.parse(text);

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
    return clean;
  });

  return Response.json({ listings }, { headers: corsHeaders });
});
