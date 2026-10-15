// Κίνηση σε όλη την εφαρμογή (docs/DESIGN.md «Κίνηση»): καμία απότομη μετακίνηση. Κάθε scroll περνά από εδώ,
// ώστε να είναι πάντα ήπιο, να φέρνει το στοιχείο στο ΚΕΝΤΡΟ της οθόνης και να σέβεται το «λιγότερη κίνηση» του
// συστήματος. Τα CSS tokens (--sf-motion-ms, --sf-ease) ζουν στο PlatformShell.
export const MOTION_MS = 240;
export const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Ήπιο scroll, εκτός αν ο χρήστης έχει ζητήσει λιγότερη κίνηση (τότε αλλαγή χωρίς κίνηση).
export const scrollBehavior = () => (prefersReducedMotion() ? "auto" : "smooth");

// Φέρνει το στοιχείο στο κέντρο της οθόνης. Αν είναι ψηλότερο από το 80% της οθόνης δεν χωράει στο κέντρο·
// τότε φέρνεται η κορυφή του, κάτω από την κεφαλίδα (offset).
export function scrollToElement(el, { offset = 72 } = {}) {
  if (!el || typeof window === "undefined") return;
  const tall = el.getBoundingClientRect().height > window.innerHeight * 0.8;
  if (tall) el.style.scrollMarginTop = `${offset}px`;
  el.scrollIntoView({ behavior: scrollBehavior(), block: tall ? "start" : "center" });
}

export function scrollToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}
