// Runnable self-check for the kleinanzeigen keyword synthesiser.
// Run: node --experimental-strip-types supabase/functions/search/keywords.test.ts

import assert from "node:assert";
import { kleinKeywords } from "./keywords.ts";

// The bug this file fixes: the generation number must survive.
assert.deepStrictEqual(
  kleinKeywords("VW Golf 7 GTI manual under 20000"),
  ["VW", "Golf", "7", "GTI"]
);
assert.deepStrictEqual(kleinKeywords("BMW 320d Touring"), ["BMW", "320d", "Touring"]);
assert.deepStrictEqual(kleinKeywords("Porsche 911 997 Carrera"), ["Porsche", "911", "997", "Carrera"]);

// Prices, years, ranges, engine sizes, buyer qualifiers all drop out.
assert.deepStrictEqual(kleinKeywords("Audi A4 Avant bis 2015, diesel"), ["Audi", "A4", "Avant"]);
assert.deepStrictEqual(kleinKeywords("Golf GTI 2.0 TSI under 80k km"), ["Golf", "GTI", "TSI"]);
assert.deepStrictEqual(kleinKeywords("cheap clean manual estate"), ["estate"]);

// A spec figure ("184 PS", "90 kW") is not a generation number - drop both the unit
// and the number it trails, but keep a real generation number ("Golf 7").
assert.deepStrictEqual(kleinKeywords("VW Golf GTI 245 PS"), ["VW", "Golf", "GTI"]);
assert.deepStrictEqual(kleinKeywords("BMW 320d 190 PS Touring"), ["BMW", "320d", "Touring"]);

// Never more than 4 terms.
assert.strictEqual(kleinKeywords("Mercedes C 200 AMG Line Kombi Automatik").length, 4);

// A spaced German class designation keeps its letter ("C 200", not "200").
assert.deepStrictEqual(kleinKeywords("Mercedes C 200 Kombi"), ["Mercedes", "C", "200", "Kombi"]);
assert.deepStrictEqual(kleinKeywords("BMW X 3 xDrive"), ["BMW", "X", "3", "xDrive"]);
// A lone letter with no number after it is still dropped (not a class marker).
assert.deepStrictEqual(kleinKeywords("Audi A6 S line Avant"), ["Audi", "A6", "line", "Avant"]);

// Only the part before the first comma is used.
assert.deepStrictEqual(kleinKeywords("VW Polo 6R, Klima, 1. Hand"), ["VW", "Polo", "6R"]);

console.log("keywords.test.ts: all assertions passed");
