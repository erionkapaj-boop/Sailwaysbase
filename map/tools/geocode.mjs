// Βρίσκει συντεταγμένες για τα μέρη του λεξικού (lib/platform/places.js) από το
// OpenStreetMap (Nominatim), ΜΙΑ φορά, και τις γράφει στο
// lib/platform/countries/gr.coords.js. Δεν τρέχει στην εφαρμογή.
//
// Κανόνες χρήσης του Nominatim: 1 αίτημα το δευτερόλεπτο, ταυτοποιημένο
// User-Agent, χωρίς αυτόματη συμπλήρωση. Τα υπάρχοντα στοιχεία του αρχείου
// ΔΕΝ ξαναζητούνται (οι διορθώσεις του ιδιοκτήτη μένουν)· `--force` τα ξαναβρίσκει.
//
//   node map/tools/geocode.mjs [--force] [--retry] [--limit N]
//     --retry: ξαναδοκιμάζει ΜΟΝΟ όσα λείπουν ή είναι σημειωμένα «προς έλεγχο»
import { writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PLACES } from "../../lib/platform/places.js";
import { pickBest, searchBox, regionViewbox } from "./geocode-rules.mjs";

const OUT = new URL("../../lib/platform/countries/gr.coords.js", import.meta.url).pathname;
const HEADER = `// Συντεταγμένες των μερών του gr.js (κλειδί: «Νησί – Λιμάνι» ή «Μέρος»).
// Παράγεται από το map/tools/geocode.mjs (OpenStreetMap)· οι διορθώσεις του
// ιδιοκτήτη ζουν στη βάση (place_positions) και υπερισχύουν. Μην το αλλάζεις με το χέρι.
`;
const UA = "SkipperFinder-geocoder/1.0 (+https://skipperfinder.gr)";
const GREECE = { minLat: 34.5, maxLat: 42.0, minLng: 19.0, maxLng: 30.0 };
const force = process.argv.includes("--force");
const retry = process.argv.includes("--retry");
const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;

export const keyOf = (p) => (p.parent ? `${p.parent} – ${p.name}` : p.name);

const existing = existsSync(OUT) ? (await import(pathToFileURL(OUT).href)).default : { places: {} };
const places = existing.places || {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const km = (a, b) => {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const inGreece = (r) => r.lat >= GREECE.minLat && r.lat <= GREECE.maxLat && r.lng >= GREECE.minLng && r.lng <= GREECE.maxLng;

async function search(q, box) {
  const view = box ? `&viewbox=${box.map((n) => n.toFixed(4)).join(",")}&bounded=1` : "";
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=gr&accept-language=el${view}&q=${encodeURIComponent(q)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429 || res.status >= 500) { await sleep(5000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Nominatim ${res.status} για «${q}»`);
    const rows = await res.json();
    return rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), name: r.display_name, cls: `${r.category || r.class}/${r.type}` })).filter(inGreece);
  }
  throw new Error(`Nominatim δεν απάντησε για «${q}»`);
}

const queries = (p) => {
  const where = "Ελλάδα";
  if (p.parent) return [`${p.name}, ${p.parent}, ${where}`, `${p.name} ${p.kind === "port" ? "λιμάνι" : ""}, ${where}`];
  if (p.kind === "island") return [`${p.name} νησί, ${where}`, `${p.name}, ${where}`];
  return [`${p.name}, ${where}`, ...(p.en ? [`${p.en}, Greece`] : [])];
};

let done = 0, fresh = 0;
for (const p of PLACES) {
  const key = keyOf(p);
  const have = places[key];
  if (have && !force && !(retry && (have.lat == null || have.review))) continue;
  if (fresh >= limit) break;
  // Πλαίσιο: γύρω από το νησί-γονέα (αν έχει καλή θέση), αλλιώς η περιοχή του μέρους.
  const parent = p.parent ? places[p.parent] : null;
  const goodParent = parent && parent.lat != null && !parent.review ? parent : null;
  const box = searchBox(goodParent, regionViewbox(p.region));
  let found = null;
  for (const bounded of box ? [true, false] : [false]) {
    for (const q of queries(p)) {
      await sleep(1100); // 1 αίτημα/δευτ.
      const rows = await search(q, bounded ? box : null);
      const best = pickBest(rows);
      if (best && !best.rejected) { found = { rows, best, bounded }; break; }
      if (best && !found) found = { rows, best, bounded, weak: true };
    }
    if (found && !found.weak) break;
  }
  if (!found) {
    places[key] = { lat: null, lng: null, review: true, note: "δεν βρέθηκε" };
  } else {
    const a = found.best.pick;
    const second = found.rows.find((r) => r !== a && !found.best.rejected);
    // Ύποπτο: μόνο απορριπτέα αποτελέσματα, ή αναζήτηση έξω από το πλαίσιο, ή δύο μακρινά αποτελέσματα.
    const doubtful = found.best.rejected || !found.bounded || (second && km(a, second) > 25);
    places[key] = { lat: Number(a.lat.toFixed(5)), lng: Number(a.lng.toFixed(5)), review: Boolean(doubtful), note: `${a.cls} · ${a.name}`.slice(0, 160) };
  }
  fresh++; done++;
  if (done % 25 === 0) { console.log(`${done} μέρη…`); persist(); }
}

function persist() {
  const sorted = Object.fromEntries(Object.entries(places).sort(([x], [y]) => x.localeCompare(y, "el")));
  writeFileSync(OUT, HEADER + "export default " + JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: "OpenStreetMap (Nominatim), © OpenStreetMap contributors", places: sorted }, null, 1) + ";\n");
}
persist();
const all = Object.values(places);
console.log(`Έτοιμα: ${all.filter((x) => x.lat != null).length}/${PLACES.length} με θέση · προς έλεγχο: ${all.filter((x) => x.review).length}`);
