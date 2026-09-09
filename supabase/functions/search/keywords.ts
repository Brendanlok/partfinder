// Synthesises the keyword string for the always-on kleinanzeigen hub crawl (see
// index.ts). kleinanzeigen's keyword search matches loosely and ANDs terms, so feed
// it only the words a real German ad title carries - make / model / generation -
// and drop prices, years, ranges and buyer-qualifier words.

const KLEIN_STOP = new Set(
  (
    // English qualifiers
    "manual automatic auto petrol gasoline diesel hybrid electric awd 4wd quattro under over below above max min good great excellent mint clean cheap budget around about approx roughly low high mileage miles year years old new from with without and or the near condition " +
    // German qualifiers - kleinanzeigen ANDs every term, so "bis"/"ab"/"gepflegt"
    // etc. only shrink recall; a real ad title never leads with them.
    "bis ab unter ueber über mit ohne und oder ca vb gepflegt scheckheft neu gebraucht unfallfrei jahr jahre baujahr guter zustand nahe"
  ).split(/\s+/)
);

export function kleinKeywords(want: string): string[] {
  return want
    .split(",")[0]
    .split(/\s+/)
    .filter((w) => {
      if (KLEIN_STOP.has(w.toLowerCase())) return false;
      // Keep a bare 1-3 digit token - a generation / series / trim number (Golf "7",
      // BMW "320", Porsche "911"), the word that pins the search to the right car.
      // Confirmed live: dropping it made "VW Golf 7 GTI ..." crawl "VW Golf GTI" and
      // surface Golf 5/6 ads as the only in-budget results. A 4-digit bare number is a
      // model year, not a generation - leave those out.
      if (/^\d{1,3}$/.test(w)) return true;
      // Otherwise require a real word: a letter, more than one char, no price/range
      // shape ("20000", "2.0", "80k").
      return w.length > 1 && /[a-z]/i.test(w) && !/^\d[\d.,k-]*$/i.test(w);
    })
    .slice(0, 4);
}
