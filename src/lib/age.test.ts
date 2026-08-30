// Runnable self-check for daysAgo.
// Run: node --experimental-strip-types src/lib/age.test.ts

import assert from "node:assert";
import { daysAgo } from "./age.ts";

const now = Date.parse("2026-08-31T12:00:00Z");

// Under a day -> null.
assert.strictEqual(daysAgo("2026-08-31T00:00:01Z", now), null);
assert.strictEqual(daysAgo("2026-08-30T13:00:00Z", now), null);

// Whole days, floored.
assert.strictEqual(daysAgo("2026-08-30T11:00:00Z", now), 1);
assert.strictEqual(daysAgo("2026-08-28T12:00:00Z", now), 3);
assert.strictEqual(daysAgo("2026-08-01T12:00:00Z", now), 30);

// Garbage / future -> null.
assert.strictEqual(daysAgo("not-a-date", now), null);
assert.strictEqual(daysAgo("", now), null);
assert.strictEqual(daysAgo("2026-09-05T12:00:00Z", now), null);

console.log("age.test.ts: all checks passed");
