// Runnable self-check for the recent-searches list.
// Run: node --experimental-strip-types src/lib/recentSearches.test.ts

import assert from "node:assert";
import { pushRecentSearch, MAX_RECENT_SEARCHES } from "./recentSearches.ts";

// Newest first.
assert.deepStrictEqual(pushRecentSearch(["a"], "b"), ["b", "a"]);

// Case-insensitive de-dupe, moved to front.
assert.deepStrictEqual(pushRecentSearch(["BMW M3", "Golf"], "bmw m3"), ["bmw m3", "Golf"]);

// Trimmed; blank is a no-op.
assert.deepStrictEqual(pushRecentSearch(["a"], "  b  "), ["b", "a"]);
assert.deepStrictEqual(pushRecentSearch(["a"], "   "), ["a"]);

// Capped at MAX_RECENT_SEARCHES.
const many = pushRecentSearch(["1", "2", "3", "4", "5"], "6");
assert.strictEqual(many.length, MAX_RECENT_SEARCHES);
assert.deepStrictEqual(many, ["6", "1", "2", "3", "4"]);

console.log("recentSearches.test.ts: all checks passed");
