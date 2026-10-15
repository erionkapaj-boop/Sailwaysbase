// Κατάλογος σκαφών για την αυτόματη συμπλήρωση (μάρκα → μοντέλο → πόδια).
// ΕΔΩ προστίθενται εύκολα νέες μάρκες και μοντέλα· κανένας άλλος κώδικας δεν αλλάζει.
//
//   KINDS        τύποι σκαφιού και οι «συνηθισμένες» μάρκες τους (εμφανίζονται ως chips,
//                με τη σειρά που γράφονται).
//   MODELS       μάρκα → μοντέλα. Η σειρά είναι η σειρά δημοφιλίας: τα πρώτα φαίνονται ως
//                chips, όλα βρίσκονται με πληκτρολόγηση. Χωρίς μάρκα στην αρχή του ονόματος
//                (π.χ. «Sun Odyssey 410» της Jeanneau)· όπου η μάρκα είναι μέρος του ονόματος
//                (π.χ. «Lagoon 42») γράφεται ολόκληρο.
// Ό,τι λείπει από τον κατάλογο δεν εμποδίζει κανέναν: ο πελάτης γράφει ελεύθερο κείμενο.

import { BOAT_MODELS, BOAT_ALIASES, BOAT_GROUPS } from "./boatData.js";

// Κλειδί τύπου από το όνομα του τύπου στη βάση (Ιστιοπλοϊκό, Καταμαράν, Μηχανοκίνητο, Gulet).
export function boatKind(name = "") {
  const n = String(name).toLowerCase();
  if (/\u03b9\u03c3\u03c4\u03b9\u03bf|sail/.test(n)) return "sail";
  if (/\u03ba\u03b1\u03c4\u03b1\u03bc|catam/.test(n)) return "cat";
  if (/\u03bc\u03b7\u03c7\u03b1\u03bd|motor/.test(n)) return "motor";
  if (/gulet|\u03b3\u03bf\u03c5\u03bb/.test(n)) return "gulet";
  return "other";
}

export const KINDS = {
  sail: ["Bavaria", "Jeanneau", "Beneteau", "Dufour", "Hanse", "Elan", "Dehler"],
  cat: ["Lagoon", "Bali", "Fountaine Pajot", "Leopard", "Excess", "Nautitech"],
  motor: ["Beneteau", "Jeanneau", "Azimut", "Princess", "Sunseeker"],
  gulet: [],
  other: [],
};

// Μοντέλα ανά τύπο και μάρκα. Τα ιστιοπλοϊκά και τα καταμαράν έρχονται από τον κατάλογο
// charter του ιδιοκτήτη (data/boat-models.csv → lib/platform/boatData.js, βλ.
// scripts/build-boat-data.mjs). Τα μηχανοκίνητα δεν είναι στον κατάλογο αυτό· εδώ μια
// μικρή λίστα με τα συνηθισμένα. Σειρά: πρώτα όσα επιβεβαιώθηκαν στην Ελλάδα, μετά κατά μέγεθος.
const KIND_OF = { sail: "sail", cat: "cat" };
const MOTOR = {
  Beneteau: ["Antares 9", "Antares 8", "Antares 11", "Gran Turismo 36", "Gran Turismo 41", "Gran Turismo 45", "Swift Trawler 41", "Swift Trawler 47", "Swift Trawler 48", "Flyer 8"],
  Jeanneau: ["Cap Camarat 9.0", "NC 33", "NC 37", "NC 11", "Merry Fisher 895", "Merry Fisher 795", "Merry Fisher 1095"],
  Azimut: ["Atlantis 43", "Atlantis 45", "50 Fly", "55 Fly", "60 Fly", "68 Fly"],
  Princess: ["V40", "V50", "F45", "F50", "F55", "Y72"],
  Sunseeker: ["Manhattan 52", "Manhattan 55", "Predator 50", "Predator 55", "Portofino 40"],
};

const sizeOf = (label) => {
  const m = /\d+(?:\.\d+)?/.exec(label);
  return m ? Number(m[0]) : 0;
};

export const MODELS = { sail: {}, cat: {}, motor: MOTOR };
const FULL = new Map(); // κανονικοποιημένο πλήρες όνομα → { kind, brand, label, group }
const BY_LABEL = new Map(); // μάρκα|όνομα στη λίστα → το ίδιο
for (const [kind, brand, label, full, group, gr] of BOAT_MODELS) {
  const k = KIND_OF[kind];
  (MODELS[k][brand] ||= []).push({ label, gr, size: sizeOf(label) });
  const entry = { kind: k, brand, label, group, full };
  FULL.set(normName(full), entry);
  BY_LABEL.set(`${normName(brand)}|${normName(label)}`, entry);
}
for (const k of ["sail", "cat"]) {
  for (const brand of Object.keys(MODELS[k])) {
    MODELS[k][brand] = MODELS[k][brand].sort((x, y) => y.gr - x.gr || x.size - y.size || x.label.localeCompare(y.label)).map((x) => x.label);
  }
}
// Εκδόσεις και παραλλαγές που δείχνουν στο βασικό μοντέλο (π.χ. «Bavaria C42 Style»).
const ALIAS = BOAT_ALIASES.map(([alias, base]) => ({ alias, base }));

function normName(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9.]+/g, " ").trim();
}
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\u03b1-\u03c9.]+/g, " ").trim();

// Όλες οι μάρκες που ξέρουμε (πρώτα του τύπου, μετά οι υπόλοιπες) — για αναζήτηση.
export function allBrands(kind) {
  const own = KINDS[kind] || [];
  const rest = new Set();
  for (const k of Object.keys(MODELS)) for (const b of Object.keys(MODELS[k])) if (!own.includes(b)) rest.add(b);
  return [...own, ...rest];
}

export function searchBrands(query, kind, limit = 6) {
  const q = norm(query);
  if (!q) return [];
  const brands = allBrands(kind);
  const starts = brands.filter((b) => norm(b).startsWith(q));
  const has = brands.filter((b) => !starts.includes(b) && norm(b).includes(q));
  return [...starts, ...has].slice(0, limit);
}

// Μοντέλα μιας μάρκας για τον τύπο· αν ο τύπος δεν την έχει, από οποιονδήποτε άλλο.
export function modelsFor(brand, kind) {
  if (!brand) return [];
  const b = Object.keys(MODELS[kind] || {}).find((x) => norm(x) === norm(brand));
  if (b) return MODELS[kind][b];
  for (const k of Object.keys(MODELS)) {
    const f = Object.keys(MODELS[k]).find((x) => norm(x) === norm(brand));
    if (f) return MODELS[k][f];
  }
  return [];
}

export function searchModels(query, brand, kind, limit = 8) {
  const q = norm(query);
  const pool = brand
    ? modelsFor(brand, kind)
    : Object.values(MODELS[kind] || {}).flat();
  if (!q) return pool.slice(0, limit);
  const compact = (s) => norm(s).replace(/ /g, "");
  const match = (m) => norm(m).includes(q) || compact(m).includes(compact(q));
  const starts = pool.filter((m) => norm(m).startsWith(q) || compact(m).startsWith(compact(q)));
  const has = pool.filter((m) => !starts.includes(m) && match(m));
  // Έκδοση ή παραλλαγή («Bavaria C42 Style») → προτείνεται το βασικό μοντέλο της.
  const viaAlias = [];
  for (const a of ALIAS) {
    if (!match(a.alias)) continue;
    const hit = FULL.get(normName(a.base));
    if (hit && pool.includes(hit.label) && !starts.includes(hit.label) && !has.includes(hit.label) && !viaAlias.includes(hit.label)) viaAlias.push(hit.label);
  }
  return [...starts, ...has, ...viaAlias].slice(0, limit);
}

// Το μοντέλο του καταλόγου που αντιστοιχεί σε μάρκα + μοντέλο ή σε πλήρες όνομα (ή σε έκδοση/alias).
export function findModel(brandOrFullName, model) {
  if (model !== undefined) {
    const byLabel = BY_LABEL.get(`${normName(brandOrFullName)}|${normName(model)}`);
    if (byLabel) return byLabel;
  }
  const full = model === undefined ? String(brandOrFullName || "") : boatName(brandOrFullName, model);
  const key = normName(full);
  if (FULL.has(key)) return FULL.get(key);
  const a = ALIAS.find((x) => normName(x.alias) === key);
  return a ? FULL.get(normName(a.base)) || null : null;
}

export const imageFileOfGroup = (group) => BOAT_GROUPS[group] || null;

// Μάρκα + μοντέλο σε ένα όνομα, χωρίς διπλή μάρκα («Lagoon» + «Lagoon 42» → «Lagoon 42»).
export function boatName(brand, model) {
  const b = String(brand || "").trim();
  const m = String(model || "").trim();
  const known = b && m ? BY_LABEL.get(`${normName(b)}|${normName(m)}`) : null;
  if (known) return known.full; // το επίσημο όνομα του καταλόγου
  if (!b) return m;
  if (!m) return b;
  return norm(m).startsWith(norm(b)) ? m : `${b} ${m}`;
}

// Πόδια που προκύπτουν από το όνομα του μοντέλου («Lagoon 42» → 42, «Bali 4.2» → 42,
// «Oceanis 46.1» → 46, «Dufour 390» → 39, «Sun Odyssey 410» → 41). null αν δεν βγαίνει με ασφάλεια.
export function inferFeet(brand, model) {
  const s = `${model || ""}`;
  const bali = /(?:^|\s)([3-5])\.(\d)(?:\s|$)/.exec(s);
  if (bali && /bali/i.test(`${brand} ${model}`)) return Number(bali[1] + bali[2]);
  const nums = s.match(/\d{2,3}(?:\.\d)?/g);
  if (!nums) return null;
  let n = Number(String(nums[0]).split(".")[0]);
  if (n >= 300 && n <= 600) n = Math.round(n / 10); // «410» = 41 πόδια
  return n >= 20 && n <= 100 ? n : null;
}
