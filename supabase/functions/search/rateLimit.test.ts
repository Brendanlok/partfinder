// Runnable self-check for the search function's per-IP rate limiter.
// Run: node --experimental-strip-types supabase/functions/search/rateLimit.test.ts
//
// rateLimited() and its Map live at module scope in index.ts, and importing index.ts
// starts Deno.serve - so this re-implements the same window logic and asserts the
// boundary. Keep the two in sync if RATE_LIMIT / RATE_WINDOW_MS change.

import assert from "node:assert";

const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function limited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

// First 12 in the same second are allowed, the 13th is blocked.
const t0 = 1_000_000;
for (let i = 1; i <= 12; i++) assert.strictEqual(limited("1.1.1.1", t0), false, `hit ${i} should pass`);
assert.strictEqual(limited("1.1.1.1", t0), true, "13th hit should be limited");

// A different IP is unaffected.
assert.strictEqual(limited("2.2.2.2", t0), false, "other IP should pass");

// After the window slides past, the same IP is allowed again.
assert.strictEqual(limited("1.1.1.1", t0 + RATE_WINDOW_MS + 1), false, "should pass once window clears");

console.log("rateLimit.test.ts OK");
