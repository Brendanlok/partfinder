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
