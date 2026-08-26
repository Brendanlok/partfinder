// Runnable self-check for the translations dictionary.
// Run: node --experimental-strip-types src/lib/translations.test.ts

import assert from "node:assert";
import { translations } from "./translations.ts";

// Both languages must expose exactly the same keys - a key present in en but missing in
// de (or vice versa) would silently render "undefined" instead of falling back visibly.
const enKeys = Object.keys(translations.en).sort();
const deKeys = Object.keys(translations.de).sort();
assert.deepStrictEqual(deKeys, enKeys, "de dictionary must have the same keys as en");

assert.strictEqual(translations.en.saved(3), "★ Saved (3)");
assert.strictEqual(translations.de.saved(3), "★ Gemerkt (3)");
assert.strictEqual(translations.en.exampleSearches.length, 3);
assert.strictEqual(translations.de.exampleSearches.length, 3);
assert.strictEqual(translations.en.statusMessages.length, translations.de.statusMessages.length);

console.log("translations.test.ts: all checks passed");
