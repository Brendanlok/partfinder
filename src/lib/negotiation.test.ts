// Runnable self-check for the negotiation-message draft.
// Run: node --experimental-strip-types src/lib/negotiation.test.ts

import assert from "node:assert";
import { draftNegotiationMessage } from "./negotiation.ts";

const withIssues = draftNegotiationMessage({
  title: "BMW 320d",
  askingPrice: 11490,
  offer: 10200,
  issues: ["Bremsen abgenutzt", "Ölwanne feucht"],
});
assert.ok(withIssues.includes("BMW 320d"), "should reference the car title");
assert.ok(withIssues.includes("Bremsen abgenutzt, Ölwanne feucht"), "should list the issues found");
assert.ok(withIssues.includes("10.200"), "should mention the offer");
assert.ok(withIssues.includes("statt der genannten 11.490"), "offer below asking should frame it as a discount");

const noIssues = draftNegotiationMessage({
  title: "VW Golf GTI",
  askingPrice: 15000,
  offer: 15000,
  issues: [],
});
assert.ok(!noIssues.includes("Zustandsprüfung"), "no issues found - shouldn't fabricate a defects line");
assert.ok(!noIssues.includes("statt der genannten"), "offer equal to asking shouldn't frame a discount that isn't real");
assert.ok(noIssues.includes("15.000"), "should still mention the price once");

console.log("negotiation.test.ts: all checks passed");
