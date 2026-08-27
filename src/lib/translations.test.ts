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

// Nested label maps must also match key-for-key between languages.
for (const map of ["sortLabels", "verdictLabels", "difficultyLabels", "dealLabels"] as const) {
  assert.deepStrictEqual(
    Object.keys(translations.de[map]).sort(),
    Object.keys(translations.en[map]).sort(),
    `${map} must have the same keys in both languages`
  );
}

assert.strictEqual(translations.de.suggestedOffer("1", "2").includes("1"), true);
assert.strictEqual(translations.de.issuesFound(1), "· 1 Problem gefunden");
assert.strictEqual(translations.de.issuesFound(2), "· 2 Probleme gefunden");

console.log("translations.test.ts: all checks passed");
