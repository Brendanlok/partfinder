// Most-recent-first, case-insensitively de-duped, capped list of past search queries.
// LAST_SEARCH_KEY only keeps the single latest query+results; this keeps just the
// query text of the last few so a user comparing several cars can re-run one without
// retyping (the UI fills the box, never auto-fires - a stray tap must not spend a
// real Tavily search).
export const MAX_RECENT_SEARCHES = 5;

export function pushRecentSearch(list: string[], query: string): string[] {
  const q = query.trim();
  if (!q) return list;
  const rest = list.filter((s) => s.toLowerCase() !== q.toLowerCase());
  return [q, ...rest].slice(0, MAX_RECENT_SEARCHES);
}
