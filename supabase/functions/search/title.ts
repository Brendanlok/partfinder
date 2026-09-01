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
