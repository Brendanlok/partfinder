// Runnable self-check for cleanListingTitle.
// Run: node --experimental-strip-types supabase/functions/search/title.test.ts

import assert from "node:assert";
import { cleanListingTitle, looksLikeModelCar } from "./title.ts";

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

// looksLikeModelCar: the live 03.09 junk results.
assert.strictEqual(looksLikeModelCar("VW Golf 1 GTI 1977 Marsrot Solido 1:18 in schönem Zustand"), true);
assert.strictEqual(looksLikeModelCar("Modellauto Volkswagen Golf GTI 1978 rot 1:43"), true);
assert.strictEqual(looksLikeModelCar("VW Golf III GTI Golf 3 Minichamps 1:43 Rot , 1008 Stk."), true);
// Real ads must pass through untouched.
assert.strictEqual(looksLikeModelCar("VW Golf 7 MK7 GTI 2.Hand DSG Maxton Vogtland Pano Kamera Digital"), false);
assert.strictEqual(looksLikeModelCar("Volkswagen Golf 2.0 TSI DSG GTI MK7,5"), false);
assert.strictEqual(looksLikeModelCar("BMW 320d 1:1 Tausch möglich"), false); // 1:1 is not a scale

console.log("title.test.ts: all checks passed");
