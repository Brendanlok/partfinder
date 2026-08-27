// Runnable self-check for the price parser.
// Run: node --experimental-strip-types src/lib/price.test.ts

import assert from "node:assert";
import { parsePrice } from "./price.ts";

// Car prices: whole euros, "." as thousands separator.
assert.strictEqual(parsePrice("18.500 €"), 18500);
assert.strictEqual(parsePrice("€19,500"), 19500);
assert.strictEqual(parsePrice("1.234.567 €"), 1234567);

// Part prices: cents with "," (German) or "." (English) decimal separator.
assert.strictEqual(parsePrice("129,95 €"), 129.95);
assert.strictEqual(parsePrice("€49.99"), 49.99);
assert.strictEqual(parsePrice("1.299,95 €"), 1299.95);
assert.strictEqual(parsePrice("ca. 89 €"), 89);

// Junk / empty.
assert.strictEqual(parsePrice(""), null);
assert.strictEqual(parsePrice(undefined), null);
assert.strictEqual(parsePrice("Preis auf Anfrage"), null);

console.log("price.test.ts: all checks passed");
