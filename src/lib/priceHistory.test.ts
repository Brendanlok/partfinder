// Runnable self-check for per-listing price history.
// Run: node --experimental-strip-types src/lib/priceHistory.test.ts

import assert from "node:assert";
import { recordPrices, diffPrices, daysBetween } from "./priceHistory.ts";

// First sighting: recorded, no change reported.
{
  const { history, changes } = recordPrices({}, [{ url: "a", price: 10000 }], "2026-08-20");
  assert.deepStrictEqual(history, { a: { price: 10000, since: "2026-08-20" } });
  assert.deepStrictEqual(changes, {});
}

// Price drop: change carries the delta and the ORIGINAL since date; history advances.
{
  const start = { a: { price: 10000, since: "2026-08-20" } };
  const { history, changes } = recordPrices(start, [{ url: "a", price: 9500 }], "2026-08-23");
  assert.deepStrictEqual(changes, { a: { delta: -500, since: "2026-08-20" } });
  assert.deepStrictEqual(history.a, { price: 9500, since: "2026-08-23" });
}

// Unchanged price: no change, since date is left to age.
{
  const start = { a: { price: 10000, since: "2026-08-20" } };
  const { history, changes } = recordPrices(start, [{ url: "a", price: 10000 }], "2026-08-25");
  assert.deepStrictEqual(changes, {});
  assert.strictEqual(history.a.since, "2026-08-20");
}

// Unparseable / missing prices are ignored, not recorded.
{
  const { history } = recordPrices({}, [{ url: "a", price: null }, { url: "", price: 5 }], "2026-08-20");
  assert.deepStrictEqual(history, {});
}

// Prune keeps only the 400 most-recently-seen entries.
{
  const big: Record<string, { price: number; since: string }> = {};
  for (let i = 0; i < 450; i++) {
    const day = String((i % 27) + 1).padStart(2, "0");
    big[`u${i}`] = { price: i, since: `2026-06-${day}` };
  }
  const { history } = recordPrices(big, [{ url: "new", price: 1 }], "2026-08-29");
  assert.strictEqual(Object.keys(history).length, 400);
  assert.ok(history.new, "newest entry survives prune");
}

// diffPrices reports the move but never mutates history (the restore path).
{
  const hist = { a: { price: 10000, since: "2026-08-20" } };
  const changes = diffPrices(hist, [{ url: "a", price: 9500 }, { url: "b", price: 3000 }]);
  assert.deepStrictEqual(changes, { a: { delta: -500, since: "2026-08-20" } });
  assert.deepStrictEqual(hist, { a: { price: 10000, since: "2026-08-20" } });
}

// daysBetween.
assert.strictEqual(daysBetween("2026-08-20", "2026-08-23"), 3);
assert.strictEqual(daysBetween("2026-08-23", "2026-08-23"), 0);

console.log("priceHistory.test.ts: all checks passed");
