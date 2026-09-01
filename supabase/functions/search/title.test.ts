// Runnable self-check for cleanListingTitle.
// Run: node --experimental-strip-types supabase/functions/search/title.test.ts

import assert from "node:assert";
import { cleanListingTitle } from "./title.ts";

// The live failure: strip both trailing chrome segments.
assert.strictEqual(
  cleanListingTitle("VW Golf 7 GTI Facelift in Bayern - Großheirath | VW Golf Gebrauchtwagen kaufen | kleinanzeigen.de"),
  "VW Golf 7 GTI Facelift in Bayern - Großheirath",
);

// Single trailing domain.
assert.strictEqual(cleanListingTitle("Audi A4 Avant 2.0 TDI | kleinanzeigen.de"), "Audi A4 Avant 2.0 TDI");

// A real headline with a pipe but no chrome tail is untouched.
assert.strictEqual(cleanListingTitle("BMW 320d | M-Paket"), "BMW 320d | M-Paket");

// No pipe at all - unchanged.
assert.strictEqual(cleanListingTitle("Volkswagen Golf GTI Limousine in Weiß"), "Volkswagen Golf GTI Limousine in Weiß");

// Degenerate "chrome only" title - fall back to the original rather than an empty string.
assert.strictEqual(cleanListingTitle(" | kleinanzeigen.de"), " | kleinanzeigen.de");

console.log("title.test.ts: all checks passed");
