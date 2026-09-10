// ponytail: byte-for-byte mirror of supabase/functions/search/title.ts (that dir is
// excluded from the Next build, so it can't be imported). The Edge Function already
// cleans titles on fresh searches; this copy re-cleans listings restored from
// localStorage - saved cars and the last-search cache stored before the server fix
// still carry the raw marketplace <title> with its trailing SEO chrome.
export function cleanListingTitle(title: string): string {
  const parts = title.split(" | ");
  while (parts.length > 1 && /(?:\.de|kaufen)$/i.test(parts[parts.length - 1].trim())) {
    parts.pop();
  }
  const dechromed = parts.join(" | ").trim() || title;
  // Sellers pad kleinanzeigen headlines with *ASTERISK*SPAM* and a stray trailing
  // quote (confirmed live on the ranked path - the autoscout24-only asterisk strip
  // in fetchListingSnippet misses these). Drop both so the card shows a clean name.
  const depadded = dechromed
    .replace(/\*+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/["'“”„]+$/, "")
    .trimEnd();
  return depadded || dechromed;
}
