// Runs server-side on Supabase Edge Functions (Deno). Given one issue from a condition
// check, returns short written repair steps plus a matched YouTube tutorial video.
// GEMINI_API_KEY / YOUTUBE_API_KEY stay function secrets - never reach the static frontend.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { issue, want } = await req.json();
  if (!issue || typeof issue !== "string") {
    return Response.json({ error: "Missing issue description." }, { status: 400, headers: corsHeaders });
  }

  const prompt = `A used car buyer found this issue: "${issue}" on a car they're considering (${want || "a used car"}).\n\nGive short, practical DIY-oriented repair steps - a numbered list, 3-6 steps, plain language, assume basic tools and no prior experience. If this issue genuinely isn't a reasonable DIY job, say so in one step instead of forcing a walkthrough. Return JSON only.`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${Deno.env.get("GEMINI_API_KEY")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: { steps: { type: "array", items: { type: "string" } } },
            required: ["steps"],
          },
        },
      }),
    }
  );
  if (!geminiRes.ok) {
    return Response.json({ error: "Couldn't write up repair steps, try again." }, { status: 502, headers: corsHeaders });
  }
  const geminiData = await geminiRes.json();
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  let steps: string[];
  try {
    steps = JSON.parse(text).steps ?? [];
  } catch {
    // ponytail: Gemini occasionally returns malformed/truncated JSON despite schema mode -
    // fail with the same friendly-error shape as every other path here, not an uncaught 500.
    return Response.json({ error: "Couldn't write up repair steps, try again." }, { status: 502, headers: corsHeaders });
  }

  // ponytail: best-effort - a video match failing shouldn't sink the whole response,
  // the written steps alone are still useful.
  let video: { title: string; url: string; thumbnail: string } | null = null;
  try {
    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&type=video&safeSearch=strict&q=${encodeURIComponent(
        `how to fix ${issue} car repair tutorial`
      )}&key=${Deno.env.get("YOUTUBE_API_KEY")}`
    );
    if (ytRes.ok) {
      const ytData = await ytRes.json();
      const item = ytData.items?.[0];
      if (item?.id?.videoId) {
        video = {
          title: item.snippet.title,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "",
        };
      }
    }
  } catch {
    // video stays null
  }

  return Response.json({ steps, video }, { headers: corsHeaders });
});
