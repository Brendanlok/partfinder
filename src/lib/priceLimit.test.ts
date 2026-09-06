// Runnable self-check for the budget-cap parser.
// Run: node --experimental-strip-types src/lib/priceLimit.test.ts

import assert from "node:assert";
import { parsePriceLimit } from "./priceLimit.ts";

// Common EN phrasings.
assert.strictEqual(parsePriceLimit("BMW E46 M3, manual, under 20k"), 20000);
assert.strictEqual(parsePriceLimit("diesel estate under 15000"), 15000);
assert.strictEqual(parsePriceLimit("something below 18.000"), 18000);
assert.strictEqual(parsePriceLimit("wagon up to 12500 good condition"), 12500);
assert.strictEqual(parsePriceLimit("€9000 hatchback"), 9000);

// German phrasings.
assert.strictEqual(parsePriceLimit("Kombi bis 15.000 €"), 15000);
assert.strictEqual(parsePriceLimit("Golf max 8k"), 8000);
assert.strictEqual(parsePriceLimit("bis zu 25000 EUR"), 25000);

// Mileage limits are NOT a price cap.
assert.strictEqual(parsePriceLimit("VW Golf GTI Mk7, under 80k km"), null);
assert.strictEqual(parsePriceLimit("Passat bis 120.000 km"), null);

// Too ambiguous / not a budget phrase -> no guess.
assert.strictEqual(parsePriceLimit("BMW 320d M-Paket"), null);
assert.strictEqual(parsePriceLimit("under 2.0 TDI"), null);
assert.strictEqual(parsePriceLimit("manual under 20"), null); // bare 2-digit, could be anything
assert.strictEqual(parsePriceLimit("Golf GTI"), null);

// Implausible amounts are rejected.
assert.strictEqual(parsePriceLimit("under 300"), null);
assert.strictEqual(parsePriceLimit("bis 2.000.000"), null);

console.log("priceLimit.test.ts: all assertions passed");
