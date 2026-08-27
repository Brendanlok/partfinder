// Parses a freeform price string to a number of euros.
//
// Two very different inputs land here: car listing prices (whole euros, "." as the
// thousands separator - "18.500 €") and replacement-part prices from German shops,
// which almost always carry cents with "," as the decimal separator ("129,95 €",
// sometimes "1.299,95 €"). The old digits-only strip turned "129,95 €" into 12995,
// inflating every parts/build/offer total ~100x.
export function parsePrice(price?: string): number | null {
  if (!price) return null;
  // Strip everything but digits and separators, plus any separator left stranded at an
  // edge by surrounding words ("ca. 89 €" -> ".89" -> "89").
  const cleaned = price.replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!cleaned) return null;
  // A trailing "<sep><2 digits>" preceded by an integer part is a decimal fraction;
  // the separators inside the integer part are grouping.
  const decimal = cleaned.match(/^(\d[\d.,]*)[.,](\d{2})$/);
  if (decimal) {
    const intPart = decimal[1].replace(/[.,]/g, "");
    return Number(`${intPart || "0"}.${decimal[2]}`);
  }
  const digits = cleaned.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}
