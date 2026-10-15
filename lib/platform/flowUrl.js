// Η ροή «Αναζήτηση πληρώματος» ζει σε δικό της URL: ?flow=1&s=<βήμα>. Έτσι η ανανέωση ΜΕΣΑ στη ροή μένει στο ίδιο βήμα,
// ενώ μια νέα είσοδος στο root (link, bookmark) είναι άλλο URL και ανοίγει πάντα την αρχική. Το βήμα μένει στο URL
// (όχι στο history.state): το Next.js ξαναγράφει το state μετά από ανανέωση και θα το έχανε.
export const flowSearch = (step) => `?flow=1&s=${step}`;

export function inFlowUrl() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("flow");
}

export function flowStepFromUrl() {
  if (typeof window === "undefined") return null;
  const n = Number(new URLSearchParams(window.location.search).get("s"));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// Ανανέωση ή «πίσω/μπροστά» του browser (όχι νέα είσοδος)· το state της ιστορίας μπορεί να έχει χαθεί.
export function isRestoredNavigation() {
  try {
    const t = performance.getEntriesByType("navigation")[0]?.type;
    return t === "reload" || t === "back_forward";
  } catch {
    return false;
  }
}
