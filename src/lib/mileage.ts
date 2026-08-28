// Parses a freeform odometer string to a number of kilometres.
//
// Two inputs land here: new listings arrive as bare digits ("85000"), but
// listings saved to localStorage before that change stored the German-formatted
// value ("85.000 km"). Number("85.000") is 85, which sorted an 85k-km car as if
// it had 85 km and threw kmPerYear off ~1000x. Strip the unit and grouping
// separators first. Shared by page.tsx (sort / km-per-year) and duplicates.ts
// (same-car mileage check), same as parsePrice is already shared.
export function parseMileage(mileage?: string): number | null {
  if (!mileage) return null;
  const n = Number(mileage.replace(/km/gi, "").replace(/[.,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}
