// Standard loan amortization math for the "monthly payment" estimate next to a build total.

// Returns null when there's nothing left to finance (already fully covered by the down
// payment) or the term is non-positive - a monthly figure wouldn't mean anything there.
export function monthlyPayment(principal: number, aprPercent: number, termMonths: number): number | null {
  if (termMonths <= 0 || principal <= 0) return null;
  const r = aprPercent / 100 / 12;
  if (r === 0) return principal / termMonths;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}
