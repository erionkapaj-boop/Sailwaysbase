// Πλοήγηση «τα δικά μου πράγματα» ανά τρέχοντα ρόλο (docs/ROLES.md). Οι καρτέλες ορίζονται στην ΚΕΝΤΡΙΚΗ ρύθμιση lib/platform/roleEnv.js·
// εδώ μόνο η ανάλυσή τους σε σύνδεσμο/εικονίδιο/ενεργή καρτέλα.
// Κινητό: κάτω μπάρα. Υπολογιστής: οι ίδιες καρτέλες στην πάνω μπάρα. Οι τελείες (launcher) έχουν τις ΚΟΙΝΕΣ εφαρμογές και δεν
// ανακατεύονται εδώ. Η καρτέλα «Κρατήσεις» δεν μπαίνει ακόμη (δεν υπάρχουν πληρωμές).
// Μια καρτέλα χωρίς σελίδα (href: null) κρύβεται: δεν εμφανίζεται νεκρός σύνδεσμος.
import { NAV_TAB_DEFS, ROLE_ENV, envFor } from "./roleEnv.js";

export { NAV_TAB_DEFS };
export const NAV_BY_ROLE = Object.fromEntries(Object.entries(ROLE_ENV).map(([r, e]) => [r, e.tabs.map((t) => t.key)]));

// Οι καρτέλες ενός ρόλου, μόνο όσες έχουν σελίδα.
export function navTabsFor(role) {
  return envFor(role).tabs.map((t) => ({ ...NAV_TAB_DEFS[t.key], ...t })).filter((t) => t.href);
}

// Οι καρτέλες που κρύβονται επειδή δεν έχουν σελίδα (για αναφορά και τεστ).
export function hiddenNavTabs() {
  return Object.entries(ROLE_ENV).flatMap(([role, e]) => e.tabs.filter((t) => !{ ...NAV_TAB_DEFS[t.key], ...t }.href).map((t) => ({ role, tab: t.key })));
}

export function isTabActive(pathname, tab) {
  const p = pathname || "/";
  if (tab.exact) return p === tab.href || (p === "/" && tab.href === "/platform");
  if (p === tab.href || p.startsWith(`${tab.href}/`)) return true;
  // also: άλλες διαδρομές που ανήκουν στην ίδια καρτέλα (π.χ. η καρτέλα ενός χρήστη στους «Χρήστες»).
  const also = Array.isArray(tab.also) ? tab.also : tab.also ? [tab.also] : [];
  return also.some((a) => (a.endsWith("/") ? p.startsWith(a) : p === a || p.startsWith(`${a}/`)));
}
