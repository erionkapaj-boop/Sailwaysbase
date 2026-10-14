// Γεωγραφική γνώση της εφαρμογής: από συντεταγμένες σε μέρος, και από μέρος σε
// συντεταγμένες. Δεν ξέρει τίποτα για τον χάρτη (οθόνη)· τον χρησιμοποιεί το
// MapView και, αργότερα, ό,τι χτιστεί πάνω στον χάρτη.
//
//   whatIsHere({ lng, lat })   τι είναι εδώ: κοντινότερο γνωστό μέρος, αλλιώς περιοχή
//   whereIs("Λαύριο")          πού είναι: κοντινότερες επιλογές με θέση
//   distanceNm(a, b)           απόσταση σε ναυτικά μίλια (ευθεία)
//   locatePoint("Νάουσα (Πάρος)")  θέση ενός αποθηκευμένου μέρους αιτήματος
//
// Οι θέσεις έρχονται από το gr.coords.js (OpenStreetMap, παράγεται αυτόματα)
// και, όταν υπάρχουν, από διορθώσεις του ιδιοκτήτη (πίνακας place_positions).
import coordsFile from "./countries/gr.coords.js";
import { PLACES } from "./places.js";
import { searchPlaces, phoneticKey } from "./placeSearch.js";
import { REGION_INFO } from "./places.js";

const R_NM = 3440.065; // ακτίνα της Γης σε ναυτικά μίλια

// Κλειδί μέρους: «Νησί – Λιμάνι» για λιμάνι νησιού, αλλιώς το όνομα.
export const placeKey = (p) => (p.parent ? `${p.parent} – ${p.name}` : p.name);

const rad = (d) => (d * Math.PI) / 180;

export function distanceNm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.sqrt(h));
}

// Όλα τα μέρη που έχουν θέση: [{ key, place, lat, lng, review }].
// overrides: { [key]: { lat, lng } } (διορθώσεις του ιδιοκτήτη, υπερισχύουν).
export function positionedPlaces({ coords = coordsFile.places, overrides = {}, places = PLACES } = {}) {
  const out = [];
  for (const p of places) {
    const key = placeKey(p);
    const o = overrides[key];
    const c = o && o.lat != null ? o : coords[key];
    if (!c || c.lat == null || c.lng == null) continue;
    out.push({ key, place: p, lat: Number(c.lat), lng: Number(c.lng), review: Boolean(c.review) && !o });
  }
  return out;
}

// Τι είναι εδώ. Επιστρέφει:
//   { kind: "place",  place, distanceNm, regionName }  αν υπάρχει γνωστό μέρος εντός radiusNm
//   { kind: "region", regionName, nearest, distanceNm } αν όχι, αλλά υπάρχει μέρος εντός regionNm
//   { kind: "none" }                                   αλλιώς (π.χ. στεριά μακριά, άλλη χώρα)
// Προτιμά το «κύριο» μέρος: νησί/πόλη αντί για λιμάνι όταν ισαπέχουν (±0,3 ν.μ.).
export function whatIsHere(point, { radiusNm = 3, regionNm = 60, positioned = positionedPlaces() } = {}) {
  let best = null;
  for (const e of positioned) {
    const d = distanceNm(point, e);
    if (!best || d < best.d - 0.3 || (Math.abs(d - best.d) <= 0.3 && rank(e.place) < rank(best.e.place))) best = { e, d };
  }
  if (!best) return { kind: "none" };
  if (best.d <= radiusNm) return { kind: "place", place: best.e.place, key: best.e.key, distanceNm: best.d, regionName: best.e.place.region };
  if (best.d <= regionNm) return { kind: "region", regionName: best.e.place.region, nearest: best.e.place, distanceNm: best.d };
  return { kind: "none" };
}

// Λιμάνι < πόλη < νησί: όταν ένα νησί και το λιμάνι του ισαπέχουν, φαίνεται το λιμάνι.
function rank(p) {
  return p.kind === "port" ? 0 : p.kind === "town" ? 1 : 2;
}

// Πού είναι. index: το ευρετήριο της αναζήτησης (buildPlaceIndex). Επιστρέφει
// κοντινές επιλογές με θέση, ώστε να κεντραριστεί ο χάρτης. Δεν διαλέγει μόνο του.
export function whereIs(index, query, { limit = 5, positioned = positionedPlaces() } = {}) {
  const byKey = new Map(positioned.map((e) => [e.key, e]));
  const out = [];
  for (const entry of searchPlaces(index, query, limit * 2)) {
    if (entry.type !== "place") continue;
    const hit = byKey.get(entry.parent ? `${entry.parent} – ${entry.name}` : entry.name);
    if (hit) out.push({ entry, lat: hit.lat, lng: hit.lng });
    if (out.length >= limit) break;
  }
  return out;
}

// Όρια ενός συνόλου σημείων: [[minLng, minLat], [maxLng, maxLat]] ή null.
export function boundsOf(points) {
  if (!points.length) return null;
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

// GeoJSON για στρώμα σημείων του MapView.
export function pointsToGeoJSON(items) {
  return {
    type: "FeatureCollection",
    features: items.map((i) => ({ type: "Feature", properties: i.properties || {}, geometry: { type: "Point", coordinates: [i.lng, i.lat] } })),
  };
}

// Θέση ενός μέρους όπως αποθηκεύεται στα αιτήματα: «Λιμάνι (Νησί)», όνομα
// μέρους (και λατινικά/άλλα ονόματα), ή όνομα περιοχής. Μόνο ακριβής αντιστοιχία
// (κατά προφορά)· ό,τι δεν αναγνωρίζεται με βεβαιότητα επιστρέφει null, ώστε ο
// χάρτης να μη δείχνει ποτέ λάθος μέρος.
//   { kind: "place",  key, place, lat, lng }
//   { kind: "region", region, lat, lng, bounds }   (κέντρο της περιοχής)
export function locatePoint(text, { positioned = positionedPlaces() } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const byKey = new Map(positioned.map((e) => [e.key, e]));
  const hit = (e) => (e ? { kind: "place", key: e.key, place: e.place, lat: e.lat, lng: e.lng } : null);

  const withParent = /^(.+) \((.+)\)$/.exec(raw);
  if (withParent) {
    const found = byKey.get(`${withParent[2].trim()} – ${withParent[1].trim()}`);
    if (found) return hit(found);
  }
  if (byKey.has(raw)) return hit(byKey.get(raw));

  const qk = phoneticKey(raw);
  if (!qk) return null;
  const names = (p) => [p.name, p.en, ...(p.aka || [])].filter(Boolean);
  // Πρώτα μέρη χωρίς «γονιό» (νησί, πόλη), μετά λιμάνια· ίσα ονόματα σε άλλη θέση = αμφίσημο.
  const matches = positioned.filter((e) => names(e.place).some((n) => phoneticKey(n) === qk));
  const top = matches.filter((e) => !e.place.parent);
  const pool = top.length ? top : matches;
  if (pool.length === 1) return hit(pool[0]);
  if (pool.length > 1 && pool.every((e) => distanceNm(e, pool[0]) < 5)) return hit(pool[0]);

  for (const [name, info] of Object.entries(REGION_INFO)) {
    if (![name, info.en, ...(info.aka || [])].filter(Boolean).some((n) => phoneticKey(n) === qk)) continue;
    const inRegion = positioned.filter((e) => e.place.region === name);
    if (!inRegion.length) return null;
    const bounds = boundsOf(inRegion);
    return {
      kind: "region",
      region: name,
      lat: (bounds[0][1] + bounds[1][1]) / 2,
      lng: (bounds[0][0] + bounds[1][0]) / 2,
      bounds,
    };
  }
  return null;
}
