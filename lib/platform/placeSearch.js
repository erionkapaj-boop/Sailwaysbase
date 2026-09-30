// Εύρεση μέρους από ό,τι γράψει ο πελάτης, με ανοχή σε ορθογραφία.
//
// Δεν συγκρίνουμε γράμματα αλλά προφορά: ι/η/υ/ει/οι είναι το ίδιο, ο/ω το
// ίδιο, αι = ε, τόνοι και κεφαλαία δεν μετράνε, διπλά γράμματα ενώνονται, και
// ελληνικά ↔ λατινικά συναντιούνται (ΠΑΡΟΣ = Paros = παρωσ). Πάνω σε αυτό,
// επιτρέπονται 1–3 λάθος γράμματα ανάλογα με το μήκος.
//
// Δεν διαλέγει ποτέ μόνο του: επιστρέφει τις πιο κοντινές επιλογές, και την
// τελική επιλογή την κάνει ο πελάτης (Πάρος / Πόρος διαφέρουν κατά ένα γράμμα).

import { PLACES, REGION_INFO, COUNTRIES } from "./places.js";

const strip = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ");

// Σειρά μετρά: τα δίψηφα πριν από τα μονά γράμματα.
const GR2 = [
  ["αυ", "av"], ["ευ", "ev"], ["ηυ", "iv"],
  ["αι", "e"], ["ει", "i"], ["οι", "i"], ["υι", "i"], ["ου", "u"],
  ["μπ", "b"], ["ντ", "d"], ["γκ", "g"], ["γγ", "g"], ["τσ", "c"], ["τζ", "j"],
];
const GR1 = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "t", ι: "i", κ: "k", λ: "l", μ: "m",
  ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", τ: "t", υ: "i", φ: "f", χ: "h", ψ: "ps", ω: "o",
};
const LAT2 = [
  ["ph", "f"], ["th", "t"], ["ch", "h"], ["kh", "h"], ["ou", "u"], ["ee", "i"], ["ei", "i"],
  ["ae", "e"], ["ai", "e"], ["oi", "i"], ["ck", "k"], ["ts", "c"], ["tz", "j"], ["sh", "s"], ["gh", "g"], ["dh", "d"],
];

export function phoneticKey(raw) {
  let s = strip(raw).replace(/[^a-zα-ω ]+/g, " ");
  // Κάθε λέξη ξεχωριστά: μια λέξη μπορεί να είναι ελληνική και η επόμενη λατινική.
  s = s
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      if (/[α-ω]/.test(w)) {
        for (const [a, b] of GR2) w = w.split(a).join(b);
        return [...w].map((c) => GR1[c] ?? c).join("");
      }
      for (const [a, b] of LAT2) w = w.split(a).join(b);
      return w.replace(/y/g, "i").replace(/w/g, "v").replace(/q/g, "k").replace(/c/g, "k");
    })
    .join(" ");
  return s.replace(/([a-z])\1+/g, "$1").trim();
}

export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const allowed = (len) => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 8 ? 2 : 3);

// Πόσο κοντά είναι αυτό που γράφτηκε σε ένα όνομα (μικρότερο = καλύτερο).
// null = όχι αρκετά κοντά.
function closeness(qk, nameKey) {
  if (!qk || !nameKey) return null;
  if (qk === nameKey) return 0;
  // Όσο γράφει: «παρ» → Πάρος, Πάργα.
  if (qk.length >= 2 && nameKey.startsWith(qk)) return 0.2 + (nameKey.length - qk.length) * 0.01;
  const words = nameKey.split(" ");
  if (words.length > 1) {
    // «νικολαος» → Άγιος Νικόλαος
    for (const w of words) {
      if (w === qk) return 0.3;
      if (qk.length >= 3 && w.startsWith(qk)) return 0.4;
    }
  }
  const d = editDistance(qk, nameKey);
  if (d <= allowed(Math.max(qk.length, nameKey.length))) return d;
  // Λάθος μέσα σε λέξη πολυλεκτικού ονόματος.
  if (words.length > 1 && qk.length >= 4) {
    for (const w of words) {
      const dw = editDistance(qk, w);
      if (dw <= allowed(w.length)) return 0.5 + dw;
    }
  }
  // Γραμμένο μέχρι τη μέση, με λάθος (π.χ. «σαντορη»).
  if (qk.length >= 4 && nameKey.length > qk.length) {
    const dp = editDistance(qk, nameKey.slice(0, qk.length));
    if (dp <= allowed(qk.length) - (qk.length <= 5 ? 0 : 1)) return 1 + dp;
  }
  return null;
}

// Ευρετήριο: μία φορά, από τις περιοχές που υπάρχουν στη βάση (όνομα → id).
// Μέρη σε περιοχές που δεν καλύπτονται ακόμα μπαίνουν κι αυτά (covered:false):
// ο πελάτης τα βρίσκει και ενημερώνεται, δεν φαίνονται σαν να μην υπάρχουν.
export function buildPlaceIndex(regions = []) {
  const regionByName = new Map(regions.map((r) => [r.name, r]));
  const nearOf = (areaName) =>
    (REGION_INFO[areaName]?.near || []).map((n) => regionByName.get(n)).filter(Boolean).map((r) => ({ regionId: r.id, name: r.name }));
  const countryName = (code) => COUNTRIES.find((c) => c.code === code)?.name || "";
  const entries = [];
  for (const p of PLACES) {
    const region = regionByName.get(p.region);
    const info = REGION_INFO[p.region] || {};
    const names = [p.name, p.en, ...(p.aka || [])].filter(Boolean);
    // «Ιθάκη Βαθύ»: το λιμάνι βρίσκεται και με το όνομα του νησιού, λίγο πιο κάτω
    // από τα ίδια τα ονόματα (ώστε το «Πόρος» να δείχνει πρώτα τον Πόρο).
    const parentPlace = p.parent ? PLACES.find((q) => q.name === p.parent && !q.child && q.region === p.region) : null;
    const compound = p.parent ? [p.parent, parentPlace?.en].filter(Boolean).map((n) => `${n} ${p.name}`) : [];
    entries.push({
      type: "place",
      parent: p.parent || null,
      child: Boolean(p.child),
      compound: compound.map(phoneticKey),
      id: `place:${p.region}|${p.parent || ""}|${p.name}`,
      name: p.name,
      en: p.en,
      kind: p.kind,
      ports: p.ports || null,
      popular: p.popular || 99,
      base: p.base || null,
      covered: Boolean(region),
      near: region ? [] : nearOf(p.region),
      regionId: region ? region.id : null,
      regionName: p.region,
      regionIn: info.in || "",
      countryCode: p.country || info.country || "GR",
      countryName: countryName(p.country || info.country || "GR"),
      keys: names.map(phoneticKey),
    });
  }
  for (const [name, info] of Object.entries(REGION_INFO)) {
    const region = regionByName.get(name);
    const names = [name, info.en, ...(info.aka || [])].filter(Boolean);
    entries.push({
      type: "region",
      id: `region:${name}`,
      name,
      en: info.en,
      popular: 50 + (info.order || 50),
      covered: Boolean(region),
      near: region ? [] : nearOf(name),
      regionId: region ? region.id : null,
      regionName: name,
      regionIn: info.in || "",
      countryCode: info.country || "GR",
      countryName: countryName(info.country || "GR"),
      keys: names.map(phoneticKey),
    });
  }
  for (const c of COUNTRIES) {
    const names = [c.name, c.en, ...(c.aka || [])];
    entries.push({ type: "country", id: `country:${c.code}`, name: c.name, code: c.code, countryCode: c.code, popular: 90, keys: names.map(phoneticKey) });
  }
  return entries;
}

// Οι πιο κοντινές επιλογές για ό,τι γράφτηκε. Κενό = τίποτα κοντά.
export function searchPlaces(index, query, limit = 5, country = null) {
  const qk = phoneticKey(query);
  if (!qk) return [];
  const scored = [];
  for (const e of index) {
    if (country && e.countryCode !== country) continue;
    let best = null;
    for (const k of e.keys) {
      const c = closeness(qk, k);
      if (c !== null && (best === null || c < best)) best = c;
    }
    for (const k of e.compound || []) {
      const c = closeness(qk, k);
      if (c !== null && (best === null || c + 1 < best)) best = c + 1;
    }
    if (best !== null) scored.push({ e, score: best });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      // σε ισοπαλία: μέρη πριν από περιοχές, τα γνωστά πρώτα
      (a.e.type === "place" ? 0 : 1) - (b.e.type === "place" ? 0 : 1) ||
      a.e.popular - b.e.popular ||
      a.e.name.localeCompare(b.e.name, "el")
  );
  return scored.slice(0, limit).map((s) => s.e);
}

// Προτεινόμενα λιμάνια (εκεί που δραστηριοποιούνται εταιρείες τσάρτερ), με τη
// σειρά της λίστας. Ομαδοποιούνται ανά περιοχή στο πεδίο.
export function suggestedPlaces(index, country = null) {
  return index
    .filter((e) => e.type === "place" && e.base && (!country || e.countryCode === country))
    .sort((a, b) => a.base - b.base);
}

// Το σημείο αναχώρησης που αποθηκεύεται για ένα μέρος της αναζήτησης:
// «Νάουσα (Πάρος)» για λιμάνι νησιού, αλλιώς το όνομα.
export function pointOf(e) {
  return e.child ? pointFor({ name: e.parent }, e.name) : e.name;
}

// Τι σημαίνει μια αποθηκευμένη επιλογή {regionId, point}, για να ξαναδειχτεί
// όπως επιλέχτηκε (και όταν έρχεται από σύνδεσμο):
//   place   μέρος του λεξικού, με ή χωρίς λιμάνι («Νάουσα (Πάρος)»)
//   region  όλη η περιοχή
//   custom  κείμενο του πελάτη που δεν είναι στο λεξικό, με την περιοχή του
export function describeChoice(index, { regionId, point } = {}) {
  if (!regionId) return { kind: "empty" };
  const region = index.find((e) => e.type === "region" && e.regionId === regionId) || null;
  const text = String(point || "").trim();
  const places = index.filter((e) => e.type === "place" && e.regionId === regionId && !e.child);
  const withPort = /^(.+) \((.+)\)$/.exec(text);
  if (withPort) {
    const place = places.find((e) => e.name === withPort[2]);
    if (place && place.ports?.includes(withPort[1])) return { kind: "place", entry: place, port: withPort[1], region };
  }
  const place = places.find((e) => e.name === text);
  if (place) return { kind: "place", entry: place, port: null, region };
  if (!text || (region && text === region.name)) return { kind: "region", entry: region, region };
  return { kind: "custom", text, region };
}

// Το σημείο αναχώρησης που αποθηκεύεται για μέρος + (προαιρετικό) λιμάνι.
export function pointFor(entry, port) {
  return port ? `${port} (${entry.name})` : entry.name;
}

// Μέρη μιας περιοχής για γρήγορη επιλογή (χωρίς τα λιμάνια που ανήκουν σε άλλο μέρος).
export function placesInRegion(index, regionId, count = 10) {
  return index
    .filter((e) => e.type === "place" && e.regionId === regionId && !e.child && !e.parent)
    .sort((a, b) => a.popular - b.popular || a.name.localeCompare(b.name, "el"))
    .slice(0, count);
}
