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
  const rawResults = (tavilyData.results ?? []).filter(
    (r: { url: string }) =>
      LISTING_SITES.some((site) => new URL(r.url).hostname.endsWith(site)) && isSingleListingUrl(r.url)
  );
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
                )}\n\nPull out every distinct real car mentioned that plausibly matches what the user wants (skip generic articles/guides with no specific car for sale). One entry per car, even if several share the same source URL - that's fine, the URL is just where to click through and find it. Extract what's visible: title, price (EUR, or null if not shown), year, mileage_km (digits only, no "km" suffix), location, source site. Return JSON only.`,
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

  return Response.json({ listings: parsed.listings ?? [] }, { headers: corsHeaders });
});
