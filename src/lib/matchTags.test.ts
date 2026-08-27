// Runnable self-check for the match-tag cleaner.
// Run: node --experimental-strip-types src/lib/matchTags.test.ts

import assert from "node:assert";
import { cleanMatchTags } from "./matchTags.ts";

// Real observed junk gets dropped.
assert.deepStrictEqual(cleanMatchTags(["Manual gearbox", "GTI unconfirmed", "GTI unmerged"]), [
  "Manual gearbox",
]);

// Clean tags pass through untouched.
assert.deepStrictEqual(cleanMatchTags(["Under budget", "Right generation"]), [
  "Under budget",
  "Right generation",
]);

// All-junk collapses to undefined (so the UI renders nothing).
assert.strictEqual(cleanMatchTags(["Year unknown", "Mileage n/a"]), undefined);

// Non-arrays and empties.
assert.strictEqual(cleanMatchTags(undefined), undefined);
assert.strictEqual(cleanMatchTags("Manual gearbox"), undefined);
assert.strictEqual(cleanMatchTags([" ", ""]), undefined);

console.log("matchTags.test.ts: all checks passed");
