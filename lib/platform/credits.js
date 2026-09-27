// Credits (docs/CREDITS.md): ό,τι κοστίζει στην πλατφόρμα μετριέται σε credits.
// Ευρώ εμφανίζονται μόνο στην αγορά πακέτων.
export function formatCredits(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  return `${v} ${abs === 1 ? "credit" : "credits"}`;
}

export const PACKAGES = [
  { key: "starter", name: "Starter" },
  { key: "professional", name: "Professional" },
  { key: "pro", name: "Pro" },
];

// Ρήμα σε αριθμό που συμφωνεί με το πλήθος: «επιστράφηκε 1 credit»,
// «επιστράφηκαν 3 credits».
export function verbFor(n, singular, plural) {
  return Math.abs(Number(n || 0)) === 1 ? singular : plural;
}
