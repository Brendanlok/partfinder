// Runnable self-check for the duplicate-listing matcher.
// Run: node --experimental-strip-types src/lib/duplicates.test.ts

import assert from "node:assert";
import { findDuplicates, duplicateSummary, isProbablySameCar } from "./duplicates.ts";

// Same car, cross-posted with different title wording/casing - should match.
assert.strictEqual(
  isProbablySameCar(
    { url: "a", title: "BMW E46 M3 Coupe Manual", source: "mobile.de", price: "€19,500", year: "2004", mileage_km: "120000" },
    { url: "b", title: "BMW M3 E46 Coupé, Schalter", source: "AutoScout24", price: "€18,900", year: "2004", mileage_km: "121200" }
  ),
  true,
  "cross-posted same car should match"
);

// Same title/year but wildly different mileage - not the same car (different odometer readings).
assert.strictEqual(
  isProbablySameCar(
    { url: "a", title: "BMW E46 M3 Coupe", source: "mobile.de", year: "2004", mileage_km: "50000" },
    { url: "b", title: "BMW E46 M3 Coupe", source: "AutoScout24", year: "2004", mileage_km: "180000" }
  ),
  false,
  "same title but far-apart mileage should not match"
);

// Same source never counts as a duplicate of itself.
assert.strictEqual(
  isProbablySameCar(
    { url: "a", title: "BMW E46 M3", source: "mobile.de", year: "2004", mileage_km: "120000" },
    { url: "b", title: "BMW E46 M3", source: "mobile.de", year: "2004", mileage_km: "120000" }
  ),
  false,
  "same-source listings should never be flagged as duplicates"
);

// Two different base-model cars from the same search (shared make/model tokens) with
// no year/mileage in common at all - must not match on title alone.
assert.strictEqual(
  isProbablySameCar(
    { url: "a", title: "BMW E46 M3 Coupe", source: "mobile.de" },
    { url: "b", title: "BMW E46 M3 Convertible", source: "AutoScout24" }
  ),
  false,
  "title overlap alone (no shared year/mileage) should not match"
);

// findDuplicates wires both directions and dedupe summary picks the cheapest match.
const listings = [
  { url: "a", title: "BMW E46 M3 Coupe", source: "mobile.de", price: "€19,500", year: "2004", mileage_km: "120000" },
  { url: "b", title: "BMW E46 M3 Coupe", source: "AutoScout24", price: "€18,900", year: "2004", mileage_km: "120300" },
  { url: "c", title: "VW Golf GTI", source: "Kleinanzeigen", price: "€12,000", year: "2018", mileage_km: "60000" },
];
const dupes = findDuplicates(listings);
assert.strictEqual(dupes["a"]?.length, 1);
assert.strictEqual(dupes["a"][0].url, "b");
assert.strictEqual(dupes["c"], undefined, "unrelated listing should have no matches");
assert.strictEqual(duplicateSummary(dupes["a"]), "AutoScout24 for €18,900");

console.log("duplicates.test.ts: all checks passed");
