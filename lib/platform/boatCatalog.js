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

// Μοντέλα ανά τύπο και μάρκα (η ίδια μάρκα έχει διαφορετικά μοντέλα σε ιστιοπλοϊκό και μηχανοκίνητο).
export const MODELS = {
  sail: {
    Bavaria: ["Cruiser 46", "Cruiser 41", "Cruiser 37", "Cruiser 34", "Cruiser 51", "C42", "C45", "C46", "C50", "C57", "C38"],
    Jeanneau: ["Sun Odyssey 410", "Sun Odyssey 440", "Sun Odyssey 380", "Sun Odyssey 349", "Sun Odyssey 449", "Sun Odyssey 490", "Sun Odyssey 519"],
    Beneteau: ["Oceanis 46.1", "Oceanis 40.1", "Oceanis 38.1", "Oceanis 51.1", "Oceanis 34.1", "Oceanis 30.1", "Oceanis 41.1", "Oceanis 54", "Oceanis 45", "Oceanis 48", "Oceanis 35", "Oceanis 38", "First 36", "First 40"],
    Dufour: ["Dufour 390 Grand Large", "Dufour 412 Grand Large", "Dufour 430 Grand Large", "Dufour 460 Grand Large", "Dufour 360 Grand Large", "Dufour 310 Grand Large", "Dufour 470", "Dufour 520 Grand Large", "Dufour 530"],
    Hanse: ["Hanse 458", "Hanse 418", "Hanse 388", "Hanse 508", "Hanse 348", "Hanse 548", "Hanse 588"],
    Elan: ["Impression 40.1", "Impression 45.1", "Impression 43", "Impression 50.1"],
    Dehler: ["Dehler 38", "Dehler 42", "Dehler 34", "Dehler 46"],
  },
  cat: {
    Lagoon: ["Lagoon 42", "Lagoon 46", "Lagoon 40", "Lagoon 450", "Lagoon 380", "Lagoon 50", "Lagoon 51", "Lagoon 55"],
    Bali: ["Bali 4.2", "Bali 4.6", "Bali 4.1", "Bali 4.4", "Bali 4.0", "Bali 4.8", "Bali 5.4"],
    "Fountaine Pajot": ["Isla 40", "Astrea 42", "Lucia 40", "Elba 45", "Saona 47", "Tanna 47", "Aura 51"],
    Leopard: ["Leopard 40", "Leopard 42", "Leopard 45", "Leopard 46", "Leopard 50"],
    Excess: ["Excess 11", "Excess 12", "Excess 14", "Excess 15"],
    Nautitech: ["Nautitech 40 Open", "Nautitech 46 Open", "Nautitech 47"],
  },
  motor: {
    Beneteau: ["Antares 9", "Antares 8", "Antares 11", "Gran Turismo 36", "Gran Turismo 41", "Gran Turismo 45", "Swift Trawler 41", "Swift Trawler 47", "Swift Trawler 48", "Flyer 8"],
    Jeanneau: ["Cap Camarat 9.0", "NC 33", "NC 37", "NC 11", "Merry Fisher 895", "Merry Fisher 795", "Merry Fisher 1095"],
    Azimut: ["Atlantis 43", "Atlantis 45", "50 Fly", "55 Fly", "60 Fly", "68 Fly"],
    Princess: ["V40", "V50", "F45", "F50", "F55", "Y72"],
    Sunseeker: ["Manhattan 52", "Manhattan 55", "Predator 50", "Predator 55", "Portofino 40"],
  },
};

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
  const starts = pool.filter((m) => norm(m).startsWith(q) || compact(m).startsWith(compact(q)));
  const has = pool.filter((m) => !starts.includes(m) && (norm(m).includes(q) || compact(m).includes(compact(q))));
  return [...starts, ...has].slice(0, limit);
}

// Μάρκα + μοντέλο σε ένα όνομα, χωρίς διπλή μάρκα («Lagoon» + «Lagoon 42» → «Lagoon 42»).
export function boatName(brand, model) {
  const b = String(brand || "").trim();
  const m = String(model || "").trim();
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
