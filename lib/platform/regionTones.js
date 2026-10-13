// Ένα ήρεμο χρώμα ανά περιοχή, για τη διαθεσιμότητα: ίδια οικογένεια με την
// παλέτα της εφαρμογής (χαμηλός κορεσμός), ώστε το ημερολόγιο να ξεχωρίζει
// περιόδους χωρίς να γίνεται πολύχρωμο. Περίοδος με πολλές περιοχές: ουδέτερο.
import { colors } from "./theme";

const PALETTE = {
  "\u0399\u03cc\u03bd\u03b9\u03bf": "#3E8C84", // πρασινογάλαζο
  "\u039a\u03c5\u03ba\u03bb\u03ac\u03b4\u03b5\u03c2": "#4C6FB0", // μπλε
  "\u03a3\u03b1\u03c1\u03c9\u03bd\u03b9\u03ba\u03cc\u03c2": "#B8955A", // άμμος
  "\u0394\u03c9\u03b4\u03b5\u03ba\u03ac\u03bd\u03b7\u03c3\u03b1": "#B5694F", // τερακότα
  "\u03a3\u03c0\u03bf\u03c1\u03ac\u03b4\u03b5\u03c2": "#7A8F4E", // ελιά
  "\u039a\u03c1\u03ae\u03c4\u03b7": "#8E6488", // δαμασκηνί
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
