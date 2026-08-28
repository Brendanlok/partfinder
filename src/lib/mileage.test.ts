// Runnable self-check for the mileage parser.
// Run: node --experimental-strip-types src/lib/mileage.test.ts

import assert from "node:assert";
import { parseMileage } from "./mileage.ts";

// New listings: bare digits.
assert.strictEqual(parseMileage("85000"), 85000);
assert.strictEqual(parseMileage("0"), 0);

// Pre-format-change saved listings: German grouping + unit.
assert.strictEqual(parseMileage("85.000 km"), 85000);
assert.strictEqual(parseMileage("120.300 KM"), 120300);
assert.strictEqual(parseMileage("1.234.567"), 1234567);

// Junk / empty.
assert.strictEqual(parseMileage(""), null);
assert.strictEqual(parseMileage(undefined), null);
assert.strictEqual(parseMileage("Keine Angabe"), null);

console.log("mileage.test.ts: all checks passed");
