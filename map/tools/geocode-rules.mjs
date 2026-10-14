// Κανόνες επιλογής αποτελέσματος για το geocode.mjs (καθαρές συναρτήσεις, με τεστ:
// tests/unit/geocode.test.mjs). Ένα αποτέλεσμα του Nominatim είναι
// { lat, lng, name, cls: "κατηγορία/τύπος" }.

// Τα αποτελέσματα που δεν είναι «μέρος» για ταξίδι (εκκλησίες, ξενοδοχεία, εστιατόρια,
// μαγαζιά, ταξί, κορυφές, μουσεία, δρόμοι…). Δεν επιλέγονται ποτέ ως πρώτη επιλογή.
export const REJECT = /(^|\/)(place_of_worship|hotel|guest_house|apartment|hostel|motel|restaurant|cafe|bar|bank|school|taxi|parking|peak|volcano|museum|memorial|archaeological_site|monument|ruins|bakery|supermarket|shop|fuel|terminal|secondary|primary|tertiary|residential|unclassified|track|path|service|nature_reserve|fort|castle)($|\/)|^(shop|highway|aeroway|historic|tourism)\//;

// Προτιμήσεις: μαρίνα/λιμάνι/πλοία πρώτα, μετά τόπος (νησί, πόλη, χωριό), μετά ό,τι άλλο.
const PORTISH = /(marina|harbour|harbor|port|ferry_terminal|pier|yes)$/;
const PLACEISH = /^place\//;

export function rank(r) {
  if (REJECT.test(r.cls)) return 9;
  if (/^(leisure\/marina|man_made\/(pier|harbour)|harbour\/|amenity\/ferry_terminal)/.test(r.cls) || PORTISH.test(r.cls)) return 0;
  if (PLACEISH.test(r.cls)) return 1;
  return 2;
}

// Διαλέγει το καλύτερο αποτέλεσμα. Επιστρέφει { pick, rejected } όπου rejected = true
// όταν ΜΟΝΟ απορριπτέα αποτελέσματα υπήρχαν (τότε το αποτέλεσμα πάει για έλεγχο).
export function pickBest(rows) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b));
  const best = sorted[0];
  return { pick: best, rejected: rank(best) >= 9 };
}

// Πλαίσιο αναζήτησης [minLng, minLat, maxLng, maxLat]: γύρω από τη θέση του γονέα
// (νησί) αν υπάρχει, αλλιώς το πλαίσιο της περιοχής.
export function searchBox(parentPos, regionBox, padDeg = 0.3) {
  if (parentPos && parentPos.lat != null) {
    return [parentPos.lng - padDeg, parentPos.lat - padDeg, parentPos.lng + padDeg, parentPos.lat + padDeg];
  }
  return regionBox || null;
}

// Χοντρά όρια περιοχών [minLat, maxLat, minLng, maxLng], με περιθώριο.
export const REGION_BOX = {
  Σαρωνικός: [36.2, 38.5, 22.4, 24.4],
  Κυκλάδες: [36.2, 38.0, 24.1, 26.6],
  Ιόνιο: [36.6, 40.0, 19.2, 21.9],
  Δωδεκάνησα: [35.3, 37.8, 26.1, 29.8],
  Σποράδες: [38.6, 39.6, 22.6, 24.4],
  Κρήτη: [34.7, 35.8, 23.4, 26.4],
  "Βόρειο Αιγαίο": [38.9, 41.3, 21.8, 26.6],
  "Ανατολικό Αιγαίο": [37.4, 40.3, 25.0, 27.4],
};
// Σε μορφή viewbox του Nominatim: minLng,minLat,maxLng,maxLat.
export const regionViewbox = (name) => {
  const b = REGION_BOX[name];
  return b ? [b[2], b[0], b[3], b[1]] : null;
};
