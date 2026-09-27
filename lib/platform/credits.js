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
