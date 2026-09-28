// Ένα ήρεμο χρώμα ανά περιοχή, για τη διαθεσιμότητα: ίδια οικογένεια με την
// παλέτα της εφαρμογής (χαμηλός κορεσμός), ώστε το ημερολόγιο να ξεχωρίζει
// περιόδους χωρίς να γίνεται πολύχρωμο. Περίοδος με πολλές περιοχές: ουδέτερο.
import { colors } from "./theme";

const PALETTE = {
  "Ιόνιο": "#3E8C84", // πρασινογάλαζο
  "Κυκλάδες": "#4C6FB0", // μπλε
  "Σαρωνικός": "#B8955A", // άμμος
  "Δωδεκάνησα": "#B5694F", // τερακότα
  "Σποράδες": "#7A8F4E", // ελιά
  "Κρήτη": "#8E6488", // δαμασκηνί
};
const EXTRA = ["#5F7F7A", "#8C7A55", "#6B6F8F", "#7E6A5E"];
const MULTI = "#6D7F91";

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function regionColor(name, index = 0) {
  return PALETTE[name] || EXTRA[index % EXTRA.length];
}

// Χρώμα για μια περίοδο με αυτές τις περιοχές.
export function periodColor(names = []) {
  if (names.length === 0) return MULTI;
  if (names.length > 1) return MULTI;
  return regionColor(names[0]);
}

// Τόνος για το ημερολόγιο (ίδιο σχήμα με τα TONES του Calendar).
export function toneFor(hex) {
  const [r, g, b] = hexToRgb(hex);
  return { band: `rgba(${r},${g},${b},0.24)`, edge: hex, edgeText: "#fff", text: colors.ink };
}
