// Runnable self-check for the client-side listing-title cleaner.
// Run: node --experimental-strip-types src/lib/listingTitle.test.ts

import assert from "node:assert";
import { cleanListingTitle } from "./listingTitle.ts";

// The exact string seen live on a restored kleinanzeigen search.
assert.strictEqual(
  cleanListingTitle(
    "VW Golf 7 GTI Facelift in Bayern - Großheirath | VW Golf Gebrauchtwagen kaufen | kleinanzeigen.de"
  ),
  "VW Golf 7 GTI Facelift in Bayern - Großheirath"
);

// A real seller headline with its own pipe is left intact.
assert.strictEqual(cleanListingTitle("BMW 320d | M-Paket"), "BMW 320d | M-Paket");

// Already-clean titles pass through.
assert.strictEqual(cleanListingTitle("Volkswagen Golf GTI Limousine in Weiß"), "Volkswagen Golf GTI Limousine in Weiß");

// Never returns empty even if every segment looks like chrome.
assert.strictEqual(cleanListingTitle("autoscout24.de"), "autoscout24.de");

console.log("listingTitle.test.ts: all checks passed");
