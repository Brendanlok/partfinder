// Pulls a EUR budget cap out of a free-text search ("BMW E46, manual, under 20k",
// "Kombi bis 15.000 €") so the results grid's max-price box can pre-fill itself
// instead of sitting empty next to a query that clearly stated a ceiling. Pure
// string parsing, no API cost. Deliberately conservative: only a phrase that
// unambiguously means "at most this many euros" counts - a bare number, or one
// trailed by "km", is left alone (that's mileage, not budget).
const LIMIT_RE =
  /(?:under|below|less than|up to|unter|bis(?:\s+zu)?|max\.?|maximal|höchstens|<=?|€|eur)\s*€?\s*(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|tsd|tausend)?\b/i;

export function parsePriceLimit(query: string): number | null {
  const m = query.match(LIMIT_RE);
  if (!m) return null;
  // "under 80k km" / "bis 120.000 km" is a mileage limit - the tail right after the
  // match tells price from distance.
  const tail = query.slice(m.index! + m[0].length).trimStart().toLowerCase();
  if (tail.startsWith("km") || tail.startsWith("kilometer") || tail.startsWith("mile")) return null;

  const digits = m[1];
  // "20.000" / "20,000" are thousands-grouped; "20.5" / "20,5" (with a k suffix) are decimal.
  const grouped = /[.,]\d{3}(?:[.,]\d{3})*$/.test(digits);
  let n = grouped ? Number(digits.replace(/[.,]/g, "")) : Number(digits.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (m[2]) n *= 1000; // explicit "k" / "tsd"
  else if (n < 1000) {
    // A bare 1-3 digit number ("under 20") is too ambiguous to guess a budget from -
    // only act on a value that's already a plausible euro amount or was grouped/k-suffixed.
    return null;
  } else if (!grouped && n >= 1990 && n <= 2035) {
    // "Audi A4 Avant bis 2015" / "3er unter 2020" - a bare 4-digit number in the
    // model-year range after under/bis is far more likely a year filter than a
    // sub-2000 EUR budget. Leave the box empty rather than hiding every priced car.
    return null;
  }

  n = Math.round(n);
  // Outside a plausible used-car asking price - probably matched something else
  // (a model year, an engine size, a postal code).
  return n >= 500 && n <= 500000 ? n : null;
}
