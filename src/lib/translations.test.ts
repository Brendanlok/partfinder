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

assert.strictEqual(translations.en.lastChecked(1), "Prices last checked yesterday");
assert.strictEqual(translations.en.lastChecked(4), "Prices last checked 4 days ago");
assert.strictEqual(translations.de.lastChecked(1), "Preise zuletzt gestern geprüft");

// UI error strings must be non-empty in both languages (shown instead of the
// English-only Edge Function error).
for (const k of ["searchError", "conditionError", "conditionUnavailableMobile", "partsError", "stepsError"] as const) {
  assert.ok(translations.en[k].length > 0 && translations.de[k].length > 0, `${k} must be set in both languages`);
  assert.notStrictEqual(translations.en[k], translations.de[k], `${k} should actually be translated`);
}

console.log("translations.test.ts: all checks passed");
