// Runs server-side on Supabase Edge Functions (Deno). Given the DIY issues from a
// condition check, estimates real replacement-part prices from a German parts retailer
// that allows automated access. autodoc.de blocks bots (403, same as mobile.de - see
// search/index.ts); kfzteile24.de doesn't, so that's the only source for now.
// TAVILY_API_KEY / GEMINI_API_KEY stay function secrets.
const PARTS_SITE = "kfzteile24.de";

// ponytail: caps Tavily calls per click, not per issue - this is a user-initiated,
// repeatable action against the same shared monthly Tavily quota the search function
// uses, so a listing with 5+ DIY issues still only costs 3 searches, not 5+.
const MAX_PARTS = 3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TavilyResult = { title: string; url: string; content: string };

async function searchOne(issue: string, germanQuery: string): Promise<{ issue: string; results: TavilyResult[] }> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: Deno.env.get("TAVILY_API_KEY"),
        query: germanQuery,
        include_domains: [PARTS_SITE],
        search_depth: "basic",
        max_results: 5,
      }),
    });
    if (!res.ok) return { issue, results: [] };
    const data = await res.json();
    return { issue, results: (data.results ?? []).slice(0, 3) };
  } catch {
    return { issue, results: [] };
  }
}

// Condition-check issues come out of verdict/index.ts in English, but kfzteile24.de is a
// German-only retailer - searching it with English part descriptions returns weak/no
// matches. One batched Gemini call up front converts each issue into a short German part
// search phrase before any Tavily call happens, so the searches actually land on-catalog.
async function toGermanPartQueries(issues: string[], want: string): Promise<Record<string, string>> {
  const fallback = Object.fromEntries(issues.map((i) => [i, `${i} ${want} Ersatzteil kaufen`]));
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${Deno.env.get("GEMINI_API_KEY")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `For each of these car issues (car: "${want}"), give a short German search phrase (2-5 words, the kind a German car-parts shop search box expects, e.g. "Bremsbeläge vorne") for the specific replacement part needed - not a translation of the issue sentence, just the part name in German:\n${JSON.stringify(
                    issues
                  )}\n\nReturn JSON only.`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                queries: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { issue: { type: "string" }, german_part_query: { type: "string" } },
                    required: ["issue", "german_part_query"],
                  },
                },
              },
              required: ["queries"],
            },
          },
        }),
      }
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed: { queries?: { issue: string; german_part_query: string }[] } = JSON.parse(text);
    const map = { ...fallback };
    for (const q of parsed.queries ?? []) {
      if (issues.includes(q.issue) && q.german_part_query) map[q.issue] = `${q.german_part_query} ${want} kaufen`;
    }
    return map;
  } catch {
    return fallback;
  }
}

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
  const { issues, want } = body;
  if (!Array.isArray(issues) || issues.length === 0 || !issues.every((i) => typeof i === "string")) {
    return Response.json({ error: "Missing issues." }, { status: 400, headers: corsHeaders });
  }
  const capped = (issues as string[]).slice(0, MAX_PARTS);
  const carDescription = typeof want === "string" && want ? want : "a used car";

  const germanQueries = await toGermanPartQueries(capped, carDescription);
  const searches = await Promise.all(capped.map((issue) => searchOne(issue, germanQueries[issue])));

  // Nothing found for any issue at all - skip the Gemini call, just say so per issue.
  if (searches.every((s) => s.results.length === 0)) {
    return Response.json(
      { parts: capped.map((issue) => ({ issue, part_name: issue })) },
      { headers: corsHeaders }
    );
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
                text: `A used car buyer wants to estimate the cost of fixing these issues on a car (${carDescription}):\n${JSON.stringify(
                  capped
                )}\n\nHere are real search results from a German car parts retailer (kfzteile24.de) for each issue:\n${JSON.stringify(
                  searches
                )}\n\nFor each issue, name the specific replacement part needed (short, e.g. "Front brake pads") and, only if one of that issue's search results genuinely shows a real price, give the best (lowest) price found plus its exact url and page title copied verbatim from that result - never estimate, round, or invent a price, url, or title that isn't directly present in a result. If no result shows a real price for an issue, leave price/url/source_title out entirely for it. Return JSON only.`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              parts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    issue: { type: "string" },
                    part_name: { type: "string" },
                    price: { type: "string" },
                    url: { type: "string" },
                    source_title: { type: "string" },
                  },
                  required: ["issue", "part_name"],
                },
              },
            },
            required: ["parts"],
          },
        },
      }),
    }
  );
  if (!geminiRes.ok) {
    return Response.json({ error: "Couldn't estimate parts cost, try again." }, { status: 502, headers: corsHeaders });
  }
  const geminiData = await geminiRes.json();
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  let parsed: { parts?: Record<string, unknown>[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "Couldn't estimate parts cost, try again." }, { status: 502, headers: corsHeaders });
  }

  // Same fabrication-proof check as search/index.ts's URL validation: a money-adjacent
  // link is worse to get wrong than a listing link, so only trust a url/price/title Gemini
  // returned if that exact url actually came back in this issue's real search results.
  const knownUrls = new Set(searches.flatMap((s) => s.results.map((r) => r.url)));
  const MAX_FIELD_LEN = 60;

  // kfzteile24.de renders its prices client-side via JS (confirmed: fetching a real product
  // page's HTML directly has no price anywhere in it, not even in meta/structured-data tags)
  // - so a real price coming back from Tavily's snippet is rare. Gemini's price/url is a
  // bonus when genuinely present; the shopping link itself always falls back to Tavily's own
  // top real result for that issue (deterministic, never LLM-touched) so the checklist still
  // points somewhere real and useful even on the (usual) no-price case.
  const topResultByIssue = new Map(searches.map((s) => [s.issue, s.results[0] ?? null]));
  const parts = (parsed.parts ?? []).map((p: Record<string, unknown>) => {
    const clean = { ...p };
    if (typeof clean.url !== "string" || !knownUrls.has(clean.url)) {
      delete clean.url;
      delete clean.price;
      delete clean.source_title;
    }
    if (typeof clean.price === "string" && clean.price.length > MAX_FIELD_LEN) delete clean.price;
    if (typeof clean.source_title === "string" && clean.source_title.length > MAX_FIELD_LEN * 2) delete clean.source_title;
    if (!clean.url) {
      const top = typeof clean.issue === "string" ? topResultByIssue.get(clean.issue) : null;
      if (top) {
        clean.url = top.url;
        clean.source_title = top.title;
      }
    }
    return clean;
  });

  return Response.json({ parts }, { headers: corsHeaders });
});
