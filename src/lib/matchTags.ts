// Gemini occasionally emits status-y fragments as match tags ("GTI unconfirmed",
// "GTI unmerged", "Year unknown") instead of the clean reason phrases the search
// prompt asks for. Drop those client-side — zero API cost, and it also cleans up
// results already cached in localStorage from before the prompt was tightened.

const JUNK_WORD =
  /\b(unconfirmed|unmerged|unknown|unclear|unspecified|unverified|undetermined|not sure|not shown|n\/?a|tbd|pending|maybe|possibly|unavailable|missing)\b/i;

export function cleanMatchTags(tags: unknown): string[] | undefined {
  if (!Array.isArray(tags)) return undefined;
  const cleaned = tags
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !JUNK_WORD.test(t));
  return cleaned.length > 0 ? cleaned : undefined;
}

// The search Edge Function asks Gemini for match_tags as short English phrases, once,
// at search time — they don't know the UI language and don't re-generate when the
// EN/DE toggle flips. Everything around them (price badges, match-score suffix, km/yr)
// follows the toggle, so a German user otherwise sees 1–4 stray English tags per card.
// Translate them at render time. Gemini's phrasing for these concepts is narrow and
// consistent; anything the dictionary + patterns miss falls back to the original tag
// (a lone English word beats a wrong guess), and the EN path is a pure passthrough.

const TAG_DE: Record<string, string> = {
  "manual gearbox": "Schaltgetriebe",
  "manual transmission": "Schaltgetriebe",
  "automatic gearbox": "Automatikgetriebe",
  "automatic transmission": "Automatikgetriebe",
  "under budget": "Im Budget",
  "within budget": "Im Budget",
  "in budget": "Im Budget",
  "over budget": "Über Budget",
  "above budget": "Über Budget",
  "high mileage": "Hohe Laufleistung",
  "low mileage": "Niedrige Laufleistung",
  "right generation": "Richtige Generation",
  "correct generation": "Richtige Generation",
  "wrong generation": "Falsche Generation",
  "diesel engine": "Dieselmotor",
  "petrol engine": "Benzinmotor",
  "gasoline engine": "Benzinmotor",
  "good condition": "Guter Zustand",
  "great condition": "Sehr guter Zustand",
  "poor condition": "Schlechter Zustand",
  "newer model": "Neueres Modell",
  "older model": "Älteres Modell",
  "low price": "Niedriger Preis",
  "fair price": "Fairer Preis",
  "high price": "Hoher Preis",
  "matches spec": "Passt zur Spezifikation",
  "spec match": "Passt zur Spezifikation",
};

export function translateTag(tag: string, lang: "en" | "de"): string {
  if (lang !== "de") return tag;

  const t = tag.trim();
  const mapped = TAG_DE[t.toLowerCase()];
  if (mapped) return mapped;

  // Dynamic phrasings the search prompt explicitly produces — keep the captured
  // place/model name verbatim so "GTI", "BMW", "München" aren't mangled.
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^near (.+)$/i))) return `In der Nähe von ${m[1]}`;
  if ((m = t.match(/^far from (.+)$/i))) return `Weit von ${m[1]} entfernt`;
  if ((m = t.match(/^not an? (.+)$/i))) return `Kein ${m[1]}`;
  if ((m = t.match(/^(.+) generation$/i))) return `${m[1]} Generation`;
  if ((m = t.match(/^(.+) model$/i))) return `${m[1]} Modell`;

  return tag;
}
