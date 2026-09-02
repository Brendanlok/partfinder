// Runnable self-check for the match-tag cleaner.
// Run: node --experimental-strip-types src/lib/matchTags.test.ts

import assert from "node:assert";
import { cleanMatchTags, translateTag } from "./matchTags.ts";

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

// translateTag: EN is a passthrough, DE maps known phrases + dynamic patterns,
// unknown phrases fall back to the original.
assert.strictEqual(translateTag("Manual gearbox", "en"), "Manual gearbox");
assert.strictEqual(translateTag("Manual gearbox", "de"), "Schaltgetriebe");
assert.strictEqual(translateTag("Under budget", "de"), "Im Budget");
assert.strictEqual(translateTag("Near Munich", "de"), "In der Nähe von Munich");
assert.strictEqual(translateTag("Far from Munich", "de"), "Weit von Munich entfernt");
assert.strictEqual(translateTag("Not a GTI", "de"), "Kein GTI");
assert.strictEqual(translateTag("Golf 7 generation", "de"), "Golf 7 Generation");
assert.strictEqual(translateTag("Facelift model", "de"), "Facelift Modell");
assert.strictEqual(translateTag("Automatic DSG", "de"), "DSG-Automatik");
assert.strictEqual(translateTag("Automatic Tiptronic", "de"), "Tiptronic-Automatik");
assert.strictEqual(translateTag("Automatic gearbox", "de"), "Automatikgetriebe");
assert.strictEqual(translateTag("Some phrase we never mapped", "de"), "Some phrase we never mapped");

console.log("matchTags.test.ts: all checks passed");
