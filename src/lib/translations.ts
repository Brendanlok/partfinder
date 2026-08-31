// Full i18n pass: main search screen + results cards + listing detail modal (condition
// check, build panel, financing) + compare view. Plain dictionary, not a library - this
// app has exactly two languages and no plurals logic beyond a simple count interpolation,
// doesn't need i18next/etc. The seller-facing negotiation message is always German
// (negotiation.ts) regardless of this toggle - the seller is in Germany either way.

export type Lang = "en" | "de";

export const LANG_KEY = "partfinder:lang";

type VerdictKey = "buy" | "maybe" | "skip";
type DifficultyKey = "diy" | "garage";
type SortKey = "relevance" | "price_asc" | "price_desc" | "year_desc" | "mileage_asc";

type Dict = {
  subtitle: string;
  backToSearch: string;
  saved: (n: number) => string;
  compareSelected: (n: number) => string;
  clear: string;
  searchPlaceholder: string;
  stopVoiceInput: string;
  speakYourSearch: string;
  search: string;
  searching: string;
  exampleSearches: readonly string[];
  recentSearches: string;
  statusMessages: readonly string[];
  noSavedListings: string;
  noMatchingListings: string;
  sortLabels: Record<SortKey, string>;
  minPricePlaceholder: string;
  maxPricePlaceholder: string;
  partsBuildCost: string;
  partsBuildCostTitle: string;
  hideDuplicates: string;
  hideDuplicatesTitle: string;
  shareSearch: string;
  shareListing: string;
  copied: string;
  noResultsFilters: string;
  clearFilters: string;
  showingOf: (shown: number, total: number) => string;
  priceRange: (low: string, high: string, typical: string) => string;
  lastChecked: (days: number) => string;

  // Error messages shown in the UI (the Edge Functions only return English, so the
  // client shows its own translated copy instead of surfacing the raw server string)
  searchError: string;
  conditionError: string;
  conditionUnavailableMobile: string;
  partsError: string;
  stepsError: string;

  // Voice input language tag for the Web Speech API
  speechLang: string;

  // Results cards
  matchSuffix: string; // "% match" / "% Treffer"
  priceBelow: string;
  priceAbove: string;
  priceBadgeTitle: string;
  priceDropSince: (amount: string, since: string) => string;
  priceRiseSince: (amount: string, since: string) => string;
  priceChangeTitle: string;
  sinceDays: (n: number) => string;
  perYearSuffix: string; // " km/yr" / " km/Jahr"
  kmPerYearTitle: string;
  saveListing: string;
  removeFromSaved: string;
  compare: string;
  alsoOn: string; // "Also on" / "Auch auf"
  alsoOnFor: string; // connective in "Also on X for €12,500"
  alsoOnMore: (n: number) => string; // "+2 more" / "+2 weitere"

  // Detail modal
  close: string;
  prevListing: string;
  nextListing: string;
  alsoListedOn: string;
  checkCondition: string;
  readingPhotos: string;
  verdictLabels: Record<VerdictKey, string>;
  difficultyLabels: Record<DifficultyKey, string>;
  dealLabels: Record<"great" | "fair" | "risky", string>;
  issuesFound: (n: number) => string;
  details: string;
  hide: string;
  howToFix: string;
  writingSteps: string;
  photosDisclaimer: (n: number) => string;
  findPartsNeeded: string;
  buildYourCar: string;
  lookingUpParts: string;
  bestDealFound: string;
  shopThisPart: string;
  partsSourcesNote: string;
  addPartPlaceholder: string;
  partPricePlaceholder: string;
  add: string;
  yourBuild: string;
  buildParenthetical: (n: number) => string;
  suggestedOffer: (offer: string, partsCost: string) => string;
  draftMessage: string;
  copyMessage: string;
  financingEstimate: string;
  downPaymentPlaceholder: string;
  aprPlaceholder: string;
  termPlaceholder: string;
  perMonth: (amount: string) => string;
  downPaymentTooHigh: string;
  financingDisclaimer: string;
  copySummary: string;
  summaryConditionLine: (label: string, summary: string) => string;
  summaryCheckedParts: string;
  summaryBuildTotal: (total: string) => string;
  summaryOffer: (offer: string) => string;

  // Compare view
  compareListings: string;
  colPrice: string;
  colYear: string;
  colMileage: string;
  colFuel: string;
  colSource: string;
  colMatch: string;
  colCondition: string;
  colBuildTotal: string;
  notChecked: string;
  openDetails: string;

  // Map view
  map: {
    showMap: string;
    showList: string;
    geocoding: string;
    noneOnMap: (n: number) => string;
    openListing: string;
  };

  // Cross-device sync (optional sign-in)
  account: {
    sync: string;
    syncTitle: string;
    signedInAs: (email: string) => string;
    signOut: string;
    heading: string;
    blurb: string;
    emailPlaceholder: string;
    sendCode: string;
    codePlaceholder: string;
    verify: string;
    sending: string;
    verifying: string;
    codeSent: (email: string) => string;
    badEmail: string;
    badCode: string;
    genericError: string;
    rateLimited: string;
    close: string;
  };
};

export const translations: Record<Lang, Dict> = {
  en: {
    subtitle: "Describe the car you want. We search mobile.de, AutoScout24, and Kleinanzeigen for matches.",
    backToSearch: "← Back to search",
    saved: (n) => `★ Saved (${n})`,
    compareSelected: (n) => `Compare selected (${n})`,
    clear: "Clear",
    searchPlaceholder: "e.g. BMW E46 M3, manual, under 20k, good condition",
    stopVoiceInput: "Stop voice input",
    speakYourSearch: "Speak your search",
    search: "Search",
    searching: "Searching…",
    exampleSearches: [
      "BMW E46 M3, manual, under 20k",
      "VW Golf GTI Mk7, under 80k km",
      "Diesel estate, good condition, under 15k",
    ],
    recentSearches: "Recent",
    statusMessages: [
      "Searching mobile.de, AutoScout24 & Kleinanzeigen…",
      "Reading listings…",
      "Almost there…",
    ],
    noSavedListings: "No saved listings yet. Tap ☆ on any listing to save it here.",
    noMatchingListings: "No matching listings found. Try a broader description.",
    sortLabels: {
      relevance: "Best match",
      price_asc: "Price: low to high",
      price_desc: "Price: high to low",
      year_desc: "Newest year",
      mileage_asc: "Lowest mileage",
    },
    minPricePlaceholder: "Min price €",
    maxPricePlaceholder: "Max price €",
    partsBuildCost: "+ Parts & build cost",
    partsBuildCostTitle: "Ad price only, or also look up parts to fix up the car and build a shopping list",
    hideDuplicates: "Hide duplicates",
    hideDuplicatesTitle: "Show one card per car, not one per site it's cross-posted on",
    shareSearch: "🔗 Share search",
    shareListing: "🔗 Share this car",
    copied: "Copied!",
    noResultsFilters: "No results match these filters.",
    clearFilters: "Clear filters",
    showingOf: (shown, total) => `Showing ${shown} of ${total} listings`,
    priceRange: (low, high, typical) => `${low}–${high} · typical ${typical}`,
    lastChecked: (days) => `Prices last checked ${days === 1 ? "yesterday" : `${days} days ago`}`,

    searchError: "Search failed. Try again in a moment.",
    conditionError: "Couldn't check this listing. Try again.",
    conditionUnavailableMobile:
      "mobile.de blocks automated access, so photo condition checks aren't available for its listings yet.",
    partsError: "Couldn't estimate parts cost. Try again.",
    stepsError: "Couldn't load repair steps. Try again.",

    speechLang: "en-US",

    matchSuffix: "% match",
    priceBelow: "Below others found",
    priceAbove: "Above others found",
    priceBadgeTitle: "Compared to other results in this search, not full market data",
    priceDropSince: (amount, since) => `▼ ${amount} cheaper (${since})`,
    priceRiseSince: (amount, since) => `▲ ${amount} dearer (${since})`,
    priceChangeTitle: "Change vs the price this listing showed the last time your search returned it",
    sinceDays: (n) => (n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`),
    perYearSuffix: " km/yr",
    kmPerYearTitle: "Average distance per year - the German TÜV benchmark is about 15,000 km/yr",
    saveListing: "Save listing",
    removeFromSaved: "Remove from saved",
    compare: "Compare",
    alsoOn: "Also on",
    alsoOnFor: "for",
    alsoOnMore: (n) => `+${n} more`,

    close: "Close",
    prevListing: "Previous listing",
    nextListing: "Next listing",
    alsoListedOn: "Also listed on",
    checkCondition: "Check condition from photos",
    readingPhotos: "Reading photos…",
    verdictLabels: {
      buy: "Looks good",
      maybe: "Worth a closer look",
      skip: "Proceed with caution",
    },
    difficultyLabels: {
      diy: "DIY",
      garage: "Garage job",
    },
    dealLabels: {
      great: "Great deal",
      fair: "Fair deal",
      risky: "Risky",
    },
    issuesFound: (n) => `· ${n} issue${n === 1 ? "" : "s"} found`,
    details: "Details ▼",
    hide: "Hide ▲",
    howToFix: "How to fix",
    writingSteps: "Writing up steps…",
    photosDisclaimer: (n) =>
      `From ${n} listing photo${n === 1 ? "" : "s"} - not a substitute for an in-person inspection.`,
    findPartsNeeded: "Find parts needed",
    buildYourCar: "Build your car",
    lookingUpParts: "Looking up parts…",
    bestDealFound: "best deal found",
    shopThisPart: "shop this part",
    partsSourcesNote:
      "Parts from kfzteile24.de and daparto.de (a price-comparison site) - daparto.de results usually show a real price, kfzteile24.de usually needs your exact model/engine picked on-site so those links go to the right part category rather than a priced listing.",
    addPartPlaceholder: "Add a part (e.g. Exhaust tips)",
    partPricePlaceholder: "€ (optional)",
    add: "Add",
    yourBuild: "Your build",
    buildParenthetical: (n) => `(car + ${n} checked part${n === 1 ? "" : "s"})`,
    suggestedOffer: (offer, partsCost) =>
      `💬 Suggested opening offer: €${offer} (asking price minus ~€${partsCost} in known parts costs - a starting point, not gospel)`,
    draftMessage: "✉️ Draft message to seller",
    copyMessage: "📋 Copy message",
    financingEstimate: "Financing estimate",
    downPaymentPlaceholder: "Down payment €",
    aprPlaceholder: "APR %",
    termPlaceholder: "Term (months)",
    perMonth: (amount) => `≈ €${amount}/mo`,
    downPaymentTooHigh: "Enter a down payment less than the build total",
    financingDisclaimer: "Rough math only, not a loan offer - your bank's actual rate and fees will differ.",
    copySummary: "📋 Copy summary",
    summaryConditionLine: (label, summary) => `Condition: ${label} — ${summary}`,
    summaryCheckedParts: "Checked parts:",
    summaryBuildTotal: (total) => `Build total: €${total}`,
    summaryOffer: (offer) => `Suggested opening offer: €${offer}`,

    compareListings: "Compare listings",
    colPrice: "Price",
    colYear: "Year",
    colMileage: "Mileage",
    colFuel: "Fuel",
    colSource: "Source",
    colMatch: "Match",
    colCondition: "Condition",
    colBuildTotal: "Build total",
    notChecked: "Not checked",
    openDetails: "Open details",
    map: {
      showMap: "Map",
      showList: "List",
      geocoding: "Placing cars on the map…",
      noneOnMap: (n) => `${n} ${n === 1 ? "car" : "cars"} not shown — no usable location`,
      openListing: "Open listing",
    },
    account: {
      sync: "Sync",
      syncTitle: "Sync your saved cars across devices",
      signedInAs: (email) => `Synced · ${email}`,
      signOut: "Sign out",
      heading: "Sync saved cars across devices",
      blurb: "Your saved cars stay on this device. Sign in with your email to see the same list on your phone and laptop. No password — we email you a code.",
      emailPlaceholder: "you@email.com",
      sendCode: "Email me a code",
      codePlaceholder: "6-digit code",
      verify: "Verify & sync",
      sending: "Sending…",
      verifying: "Verifying…",
      codeSent: (email) => `Code sent to ${email}. Check your inbox.`,
      badEmail: "Enter a valid email address.",
      badCode: "That code didn't work. Check it and try again.",
      genericError: "Something went wrong. Try again.",
      rateLimited: "Too many code requests. Wait a minute and try again.",
      close: "Close",
    },
  },
  de: {
    subtitle: "Beschreibe das Auto, das du suchst. Wir durchsuchen mobile.de, AutoScout24 und Kleinanzeigen nach passenden Angeboten.",
    backToSearch: "← Zurück zur Suche",
    saved: (n) => `★ Gemerkt (${n})`,
    compareSelected: (n) => `${n} vergleichen`,
    clear: "Löschen",
    searchPlaceholder: "z. B. BMW E46 M3, Schaltgetriebe, unter 20.000 €, guter Zustand",
    stopVoiceInput: "Spracheingabe stoppen",
    speakYourSearch: "Suche per Sprache eingeben",
    search: "Suchen",
    searching: "Suche läuft…",
    exampleSearches: [
      "BMW E46 M3, Schaltgetriebe, unter 20.000 €",
      "VW Golf GTI Mk7, unter 80.000 km",
      "Diesel-Kombi, guter Zustand, unter 15.000 €",
    ],
    recentSearches: "Zuletzt gesucht",
    statusMessages: [
      "Durchsuche mobile.de, AutoScout24 & Kleinanzeigen…",
      "Lese Anzeigen…",
      "Gleich fertig…",
    ],
    noSavedListings: "Noch keine gemerkten Anzeigen. Tippe auf ☆ bei einer Anzeige, um sie zu merken.",
    noMatchingListings: "Keine passenden Anzeigen gefunden. Versuch eine allgemeinere Beschreibung.",
    sortLabels: {
      relevance: "Beste Treffer",
      price_asc: "Preis: aufsteigend",
      price_desc: "Preis: absteigend",
      year_desc: "Neuestes Baujahr",
      mileage_asc: "Geringste Laufleistung",
    },
    minPricePlaceholder: "Preis von €",
    maxPricePlaceholder: "Preis bis €",
    partsBuildCost: "+ Teile & Ausbaukosten",
    partsBuildCostTitle: "Nur Anzeigenpreis, oder zusätzlich Ersatzteile für Reparaturen nachschlagen und eine Einkaufsliste erstellen",
    hideDuplicates: "Duplikate ausblenden",
    hideDuplicatesTitle: "Nur eine Karte pro Auto zeigen, nicht eine pro Seite, auf der es doppelt inseriert ist",
    shareSearch: "🔗 Suche teilen",
    shareListing: "🔗 Dieses Auto teilen",
    copied: "Kopiert!",
    noResultsFilters: "Keine Ergebnisse mit diesen Filtern.",
    clearFilters: "Filter zurücksetzen",
    showingOf: (shown, total) => `${shown} von ${total} Anzeigen`,
    priceRange: (low, high, typical) => `${low}–${high} · üblich ${typical}`,
    lastChecked: (days) => `Preise zuletzt ${days === 1 ? "gestern" : `vor ${days} Tagen`} geprüft`,

    searchError: "Suche fehlgeschlagen. Bitte gleich noch einmal versuchen.",
    conditionError: "Anzeige konnte nicht geprüft werden. Bitte erneut versuchen.",
    conditionUnavailableMobile:
      "mobile.de sperrt automatische Zugriffe, daher sind Zustandsprüfungen anhand der Fotos für mobile.de-Anzeigen noch nicht verfügbar.",
    partsError: "Teilekosten konnten nicht geschätzt werden. Bitte erneut versuchen.",
    stepsError: "Reparaturschritte konnten nicht geladen werden. Bitte erneut versuchen.",

    speechLang: "de-DE",

    matchSuffix: "% Treffer",
    priceBelow: "Günstiger als andere",
    priceAbove: "Teurer als andere",
    priceBadgeTitle: "Im Vergleich zu anderen Ergebnissen dieser Suche, keine vollständigen Marktdaten",
    priceDropSince: (amount, since) => `▼ ${amount} günstiger (${since})`,
    priceRiseSince: (amount, since) => `▲ ${amount} teurer (${since})`,
    priceChangeTitle: "Änderung gegenüber dem Preis, den diese Anzeige bei deiner letzten Suche hatte",
    sinceDays: (n) => (n <= 0 ? "heute" : n === 1 ? "gestern" : `vor ${n} Tagen`),
    perYearSuffix: " km/Jahr",
    kmPerYearTitle: "Durchschnittliche Fahrleistung pro Jahr - der TÜV-Richtwert liegt bei etwa 15.000 km/Jahr",
    saveListing: "Anzeige merken",
    removeFromSaved: "Aus Merkliste entfernen",
    compare: "Vergleichen",
    alsoOn: "Auch auf",
    alsoOnFor: "für",
    alsoOnMore: (n) => `+${n} weitere`,

    close: "Schließen",
    prevListing: "Vorheriges Angebot",
    nextListing: "Nächstes Angebot",
    alsoListedOn: "Auch inseriert auf",
    checkCondition: "Zustand anhand der Fotos prüfen",
    readingPhotos: "Fotos werden ausgewertet…",
    verdictLabels: {
      buy: "Sieht gut aus",
      maybe: "Genauer ansehen",
      skip: "Mit Vorsicht genießen",
    },
    difficultyLabels: {
      diy: "Selbst machbar",
      garage: "Werkstatt nötig",
    },
    dealLabels: {
      great: "Top-Angebot",
      fair: "Faires Angebot",
      risky: "Riskant",
    },
    issuesFound: (n) => `· ${n} ${n === 1 ? "Problem" : "Probleme"} gefunden`,
    details: "Details ▼",
    hide: "Ausblenden ▲",
    howToFix: "Anleitung",
    writingSteps: "Schritte werden erstellt…",
    photosDisclaimer: (n) =>
      `Aus ${n} ${n === 1 ? "Anzeigenfoto" : "Anzeigenfotos"} - ersetzt keine Besichtigung vor Ort.`,
    findPartsNeeded: "Benötigte Teile finden",
    buildYourCar: "Auto zusammenstellen",
    lookingUpParts: "Teile werden gesucht…",
    bestDealFound: "bestes gefundenes Angebot",
    shopThisPart: "Teil ansehen",
    partsSourcesNote:
      "Teile von kfzteile24.de und daparto.de (Preisvergleichsseite) - daparto.de zeigt meist einen echten Preis, kfzteile24.de braucht meist dein genaues Modell/Motor vor Ort, daher führen diese Links zur passenden Teilekategorie statt zu einem Angebot mit Preis.",
    addPartPlaceholder: "Teil hinzufügen (z. B. Endrohre)",
    partPricePlaceholder: "€ (optional)",
    add: "Hinzufügen",
    yourBuild: "Deine Zusammenstellung",
    buildParenthetical: (n) => `(Auto + ${n} ${n === 1 ? "ausgewähltes Teil" : "ausgewählte Teile"})`,
    suggestedOffer: (offer, partsCost) =>
      `💬 Vorgeschlagenes Startangebot: ${offer} € (Anzeigenpreis minus ~${partsCost} € bekannte Teilekosten - ein Ausgangspunkt, keine feste Größe)`,
    draftMessage: "✉️ Nachricht an Verkäufer verfassen",
    copyMessage: "📋 Nachricht kopieren",
    financingEstimate: "Finanzierungsschätzung",
    downPaymentPlaceholder: "Anzahlung €",
    aprPlaceholder: "Zinssatz %",
    termPlaceholder: "Laufzeit (Monate)",
    perMonth: (amount) => `≈ ${amount} €/Mon.`,
    downPaymentTooHigh: "Gib eine Anzahlung unter der Gesamtsumme ein",
    financingDisclaimer: "Nur grobe Rechnung, kein Kreditangebot - der tatsächliche Zinssatz und die Gebühren deiner Bank weichen ab.",
    copySummary: "📋 Zusammenfassung kopieren",
    summaryConditionLine: (label, summary) => `Zustand: ${label} — ${summary}`,
    summaryCheckedParts: "Ausgewählte Teile:",
    summaryBuildTotal: (total) => `Gesamtsumme: ${total} €`,
    summaryOffer: (offer) => `Vorgeschlagenes Startangebot: ${offer} €`,

    compareListings: "Anzeigen vergleichen",
    colPrice: "Preis",
    colYear: "Baujahr",
    colMileage: "Laufleistung",
    colFuel: "Kraftstoff",
    colSource: "Quelle",
    colMatch: "Treffer",
    colCondition: "Zustand",
    colBuildTotal: "Gesamtsumme",
    notChecked: "Nicht geprüft",
    openDetails: "Details öffnen",
    map: {
      showMap: "Karte",
      showList: "Liste",
      geocoding: "Autos werden auf der Karte platziert…",
      noneOnMap: (n) => `${n} ${n === 1 ? "Auto" : "Autos"} nicht angezeigt — kein verwertbarer Ort`,
      openListing: "Anzeige öffnen",
    },
    account: {
      sync: "Sync",
      syncTitle: "Gespeicherte Autos geräteübergreifend synchronisieren",
      signedInAs: (email) => `Synchronisiert · ${email}`,
      signOut: "Abmelden",
      heading: "Gespeicherte Autos geräteübergreifend synchronisieren",
      blurb: "Deine gespeicherten Autos bleiben auf diesem Gerät. Melde dich mit deiner E-Mail an, um dieselbe Liste auf Handy und Laptop zu sehen. Kein Passwort — wir schicken dir einen Code per E-Mail.",
      emailPlaceholder: "du@email.de",
      sendCode: "Code per E-Mail senden",
      codePlaceholder: "6-stelliger Code",
      verify: "Bestätigen & synchronisieren",
      sending: "Wird gesendet…",
      verifying: "Wird geprüft…",
      codeSent: (email) => `Code an ${email} gesendet. Schau in dein Postfach.`,
      badEmail: "Gib eine gültige E-Mail-Adresse ein.",
      badCode: "Der Code hat nicht funktioniert. Bitte prüfen und erneut versuchen.",
      genericError: "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
      rateLimited: "Zu viele Code-Anfragen. Warte eine Minute und versuche es erneut.",
      close: "Schließen",
    },
  },
};
