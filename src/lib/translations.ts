// Lighter first-pass i18n: covers the main search screen only (header, search box,
// filters, sort, empty states) - not the listing detail modal, build panel, or compare
// view yet (Lok's call: expand later if wanted, rather than ship a half-translated app).
// Plain dictionary, not a library - this app has exactly two languages and no plurals
// logic beyond a simple count interpolation, doesn't need i18next/etc.

export type Lang = "en" | "de";

export const LANG_KEY = "partfinder:lang";

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
  statusMessages: readonly string[];
  noSavedListings: string;
  noMatchingListings: string;
  sortLabels: Record<"relevance" | "price_asc" | "price_desc" | "year_desc" | "mileage_asc", string>;
  minPricePlaceholder: string;
  maxPricePlaceholder: string;
  partsBuildCost: string;
  partsBuildCostTitle: string;
  hideDuplicates: string;
  hideDuplicatesTitle: string;
  shareSearch: string;
  copied: string;
  noResultsFilters: string;
  clearFilters: string;
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
    copied: "Copied!",
    noResultsFilters: "No results match these filters.",
    clearFilters: "Clear filters",
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
    copied: "Kopiert!",
    noResultsFilters: "Keine Ergebnisse mit diesen Filtern.",
    clearFilters: "Filter zurücksetzen",
  },
};
