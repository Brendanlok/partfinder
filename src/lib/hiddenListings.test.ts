// Runnable self-check for the hidden-listings memory.
// Run: node --experimental-strip-types src/lib/hiddenListings.test.ts

import assert from "node:assert";
import { toggleHidden } from "./hiddenListings.ts";

// toggle adds when absent, removes when present.
assert.deepStrictEqual(toggleHidden(["a"], "b"), ["a", "b"]);
assert.deepStrictEqual(toggleHidden(["a", "b"], "a"), ["b"]);

// blank URL is a no-op.
assert.deepStrictEqual(toggleHidden(["a"], ""), ["a"]);

// FIFO cap: adding past the limit drops the oldest.
const big = Array.from({ length: 1000 }, (_, i) => `u${i}`);
const capped = toggleHidden(big, "newest");
assert.strictEqual(capped.length, 1000);
assert.strictEqual(capped[0], "u1");
assert.strictEqual(capped[999], "newest");

console.log("hiddenListings.test.ts: all checks passed");
