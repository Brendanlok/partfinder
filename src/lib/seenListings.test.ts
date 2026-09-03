// Runnable self-check for the seen-listings memory.
// Run: node --experimental-strip-types src/lib/seenListings.test.ts

import assert from "node:assert";
import { filterNew, markSeen } from "./seenListings.ts";

// filterNew: only URLs not already seen, order preserved.
assert.deepStrictEqual(filterNew(["a", "b"], ["b", "c", "a", "d"]), ["c", "d"]);
assert.deepStrictEqual(filterNew([], ["a", "b"]), ["a", "b"]);
assert.deepStrictEqual(filterNew(["a"], [""]), []); // blank URL ignored

// markSeen: appends new, dedupes, keeps existing.
assert.deepStrictEqual(markSeen(["a"], ["a", "b", "b", "c"]), ["a", "b", "c"]);
assert.deepStrictEqual(markSeen([], []), []);

// markSeen: FIFO cap keeps the most recent.
const big = Array.from({ length: 1500 }, (_, i) => `u${i}`);
const capped = markSeen(big, ["new1", "new2"]);
assert.strictEqual(capped.length, 1500);
assert.strictEqual(capped[0], "u2");
assert.strictEqual(capped[1499], "new2");

console.log("seenListings.test.ts: all checks passed");
