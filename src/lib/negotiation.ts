// Drafts a German message to the seller referencing the condition-check issues found
// and the suggested opening offer already computed elsewhere (buildTotal/partsTotal in
// page.tsx). Plain template, not a Gemini call - zero ongoing API cost, unlike a
// generated version would be. Pure so it's unit-testable like duplicates.ts/finance.ts.

export function draftNegotiationMessage(opts: {
  title: string;
  askingPrice: number;
  offer: number;
  issues: string[];
}): string {
  const { title, askingPrice, offer, issues } = opts;

  const issueLines =
    issues.length > 0
      ? `Bei einer Zustandsprüfung sind mir folgende Punkte aufgefallen: ${issues.join(", ")}. `
      : "";

  // Same number twice would read oddly - only mention the discount framing if the offer
  // is actually below asking.
  const offerLine =
    offer < askingPrice
      ? `Basierend darauf würde ich Ihnen ${offer.toLocaleString("de-DE")} € anbieten (statt der genannten ${askingPrice.toLocaleString("de-DE")} €). Wäre das für Sie machbar?`
      : `Wäre ${offer.toLocaleString("de-DE")} € für Sie machbar?`;

  return `Hallo,\n\nich interessiere mich für Ihr Fahrzeug (${title}). ${issueLines}${offerLine}\n\nViele Grüße`;
}
