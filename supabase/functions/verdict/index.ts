// Runs server-side on Supabase Edge Functions (Deno). Fetches a listing page, pulls its
// photos + description, and asks Gemini for a rough visual condition read. GEMINI_API_KEY
// stays a function secret - never reaches the static frontend.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractMetaTags(html: string): string[] {
  return [...html.matchAll(/<meta[^>]+>/g)].map((m) => m[0]);
}

function getMetaContent(tags: string[], attr: string, value: string): string | null {
  const tag = tags.find((t) => t.includes(`${attr}="${value}"`));
  const m = tag?.match(/content="([^"]*)"/);
  return m ? m[1] : null;
}

function extractImages(html: string, hostname: string): string[] {
  const tags = extractMetaTags(html);
  const images = tags
    .filter((t) => t.includes('property="og:image"'))
    .map((t) => t.match(/content="([^"]*)"/)?.[1])
    .filter((u): u is string => !!u);

  // ponytail: kleinanzeigen only exposes one og:image, but its gallery images follow a
  // predictable id-based URL - pull a few more so Gemini sees more than the thumbnail.
  if (hostname.endsWith("kleinanzeigen.de")) {
    const ids = [
      ...new Set([...html.matchAll(/prod-ads\/images\/[0-9a-f]{2}\/([0-9a-f-]{36})/g)].map((m) => m[1])),
    ];
    for (const id of ids.slice(0, 5)) {
      const url = `https://img.kleinanzeigen.de/api/v1/prod-ads/images/${id.slice(0, 2)}/${id}?rule=$_35`;
      if (!images.includes(url)) images.push(url);
    }
  }

  return [...new Set(images)].slice(0, 5);
}

function extractDescription(html: string): string {
  const tags = extractMetaTags(html);
  return (
    getMetaContent(tags, "property", "og:description") ||
    getMetaContent(tags, "name", "description") ||
    ""
  );
}

async function toInlineImage(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return { mimeType, data: btoa(binary) };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { url, want } = await req.json();
  if (!url || typeof url !== "string") {
    return Response.json({ error: "Missing listing URL." }, { status: 400, headers: corsHeaders });
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return Response.json({ error: "Invalid listing URL." }, { status: 400, headers: corsHeaders });
  }

  if (hostname.endsWith("mobile.de")) {
    return Response.json(
      { error: "mobile.de blocks automated access, so condition reads aren't available for these listings yet." },
      { status: 422, headers: corsHeaders }
    );
  }

  const pageRes = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9,en;q=0.8" },
  });
  if (!pageRes.ok) {
    return Response.json({ error: "Couldn't load that listing page." }, { status: 502, headers: corsHeaders });
  }
  const html = await pageRes.text();

  const images = extractImages(html, hostname);
  if (images.length === 0) {
    return Response.json({ error: "Couldn't find photos on this listing." }, { status: 422, headers: corsHeaders });
  }

  const description = extractDescription(html);
  const imageParts = (await Promise.all(images.map(toInlineImage)))
    .filter((img): img is { mimeType: string; data: string } => !!img)
    .map((img) => ({ inlineData: img }));

  if (imageParts.length === 0) {
    return Response.json({ error: "Couldn't load this listing's photos." }, { status: 502, headers: corsHeaders });
  }

  const prompt = `A buyer wants this car: "${want || "a used car"}"\n\nListing description: "${description}"\n\nLook closely at the attached photos of this specific vehicle for anything visible that matters to a buyer - rust, dents, panel gaps/mismatched paint, worn or damaged interior, tyre wear, dashboard warning lights, missing parts, modification signs. Give a short, honest, ballpark read. Note this is a visual check only from listing photos, not a substitute for an in-person inspection or vehicle history check.\n\nReturn JSON only.`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${Deno.env.get("GEMINI_API_KEY")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...imageParts] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              issues: { type: "array", items: { type: "string" } },
              condition_summary: { type: "string" },
              verdict: { type: "string", enum: ["buy", "maybe", "skip"] },
            },
            required: ["issues", "condition_summary", "verdict"],
          },
        },
      }),
    }
  );
  if (!geminiRes.ok) {
    return Response.json({ error: "Couldn't read the photos, try again." }, { status: 502, headers: corsHeaders });
  }
  const geminiData = await geminiRes.json();
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const parsed = JSON.parse(text);

  return Response.json({ ...parsed, photos_checked: imageParts.length }, { headers: corsHeaders });
});
