// Marketplace <title> tags (which Tavily indexes and returns as a result's title) carry
// SEO chrome after pipe separators - e.g. kleinanzeigen serves
// "VW Golf 7 GTI Facelift in Bayern - Großheirath | VW Golf Gebrauchtwagen kaufen | kleinanzeigen.de".
// Confirmed live: that whole string showed as a result card's title. Drop only the trailing
// chrome segments (a bare domain, or a "… kaufen" category phrase) so a real seller headline
// that happens to contain " | " (e.g. "BMW 320d | M-Paket") is left intact.
export function cleanListingTitle(title: string): string {
  const parts = title.split(" | ");
  while (parts.length > 1 && /(?:\.de|kaufen)$/i.test(parts[parts.length - 1].trim())) {
    parts.pop();
  }
  return parts.join(" | ").trim() || title;
}

// kleinanzeigen's car category is full of 1:18/1:43 scale models and toys that share
// every make/model keyword with a real ad ("VW Golf 1 GTI 1977 Marsrot Solido 1:18").
// Gemini filters these on the ranked path, but the Gemini-timeout fallback returns raw
// results unjudged - so a scan for scale ("1:43") or a known model-car brand in the
// title drops them before either path (confirmed live 03.09: 3 of 12 fallback results
// were scale models). Pure string check, no API cost.
const MODEL_CAR =
  /\b1\s?:\s?\d{2,3}\b|modellauto|modellbau|spielzeug|miniatur|\b(solido|minichamps|maxichamps|norev|schuco|herpa|wiking|welly|bburago|burago|maisto|kyosho|autoart|ixo|corgi)\b/i;

export const looksLikeModelCar = (title: string): boolean => MODEL_CAR.test(title);
