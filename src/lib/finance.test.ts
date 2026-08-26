// Runnable self-check for the loan-payment calculator.
// Run: node --experimental-strip-types src/lib/finance.test.ts

import assert from "node:assert";
import { monthlyPayment } from "./finance.ts";

// Known amortization result: €20,000 at 6.9% APR over 48 months ≈ €478.00/mo.
assert.ok(
  Math.abs((monthlyPayment(20000, 6.9, 48) ?? 0) - 478.0) < 0.5,
  "48mo @6.9% APR should match known amortization figure"
);

// 0% APR is a straight division, not a divide-by-zero.
assert.strictEqual(monthlyPayment(12000, 0, 12), 1000);

// Nothing left to finance or no term - not a number worth showing.
assert.strictEqual(monthlyPayment(0, 6.9, 48), null);
assert.strictEqual(monthlyPayment(20000, 6.9, 0), null);
assert.strictEqual(monthlyPayment(-500, 6.9, 48), null, "down payment exceeding price shouldn't compute a negative loan");

console.log("finance.test.ts: all checks passed");
