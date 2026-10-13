#!/usr/bin/env node
// Έλεγχος γλωσσών (docs/I18N.md). Τρεις δουλειές:
//
//  1. ΤΑΞΗ στα αρχεία μηνυμάτων (messages/*.json): ίδια κλειδιά και ίδια
//     {μεταβλητά} με τα ελληνικά, καμία κενή τιμή, κανένα ελληνικό γράμμα σε
//     μετάφραση. Περιττά ή χαλασμένα κλειδιά αποτυγχάνουν πάντα.
//  2. ΦΡΑΧΤΗΣ: οι γραμμές κώδικα με ελληνικό κείμενο μέσα (αντί για αρχείο
//     μηνυμάτων) μπορούν μόνο να ΜΕΙΩΝΟΝΤΑΙ, ανά αρχείο. Νέο ελληνικό κείμενο μέσα
//     σε κώδικα κάνει τα τεστ κόκκινα. Το ίδιο και οι παλιές συναρτήσεις
//     ημερομηνιών που δουλεύουν μόνο ελληνικά (formatDate, timeAgo κ.λπ.).
//     Όταν ο αριθμός πέσει, το baseline πρέπει να χαμηλώσει στο ίδιο commit
//     (--update), ώστε η βελτίωση να κλειδώνει.
//  3. ΠΥΛΗ (--gate, τρέχει πριν από κάθε build): αν μια γλώσσα δεν είναι η
//     προεπιλεγμένη και είναι ΑΝΟΙΧΤΗ (NEXT_PUBLIC_PLATFORM_LOCALES), πρέπει να
//     είναι πλήρης: κανένα κλειδί να μη λείπει, μηδέν ελληνικό κείμενο μέσα στον
//     κώδικα, μηδέν παλιές συναρτήσεις ημερομηνίας. Αλλιώς το build αποτυγχάνει
//     και δεν ανεβαίνει ποτέ σελίδα με ανάμεικτες γλώσσες.
//
//   node scripts/check-i18n.mjs            # τεστ: τάξη + φράχτης
//   node scripts/check-i18n.mjs --gate     # build: και πληρότητα ανοιχτών γλωσσών
//   node scripts/check-i18n.mjs --report   # τι λείπει για να ανοίξει μια γλώσσα
//   node scripts/check-i18n.mjs --update   # χαμηλώνει το baseline (ποτέ δεν το ανεβάζει)
//   node scripts/check-i18n.mjs --init     # δημιουργεί το baseline από την αρχή
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LOCALE, LANGUAGES, parseLocales } from "../lib/platform/i18n.js";
import { PARTS } from "../messages/parts.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = path.join(ROOT, "scripts/i18n-baseline.json");
const args = new Set(process.argv.slice(2));

const GREEK = /[Ͱ-Ͽἀ-῿]/;

// Ό,τι ανήκει στην πλατφόρμα και το βλέπει χρήστης.
const SCOPE = ["app/platform", "app/api/platform", "lib/platform", "i18n"];
// Δεδομένα και όχι κείμενα οθόνης: το λεξικό μερών ΠΡΕΠΕΙ να έχει ελληνικά ονόματα
// (είναι ό,τι ψάχνει ο πελάτης), και μερικά αρχεία φτιάχνουν σταθερές λίστες.
const EXCLUDED = [
  /^lib\/platform\/countries\//,
  // Λεξικά δεδομένων ανά γλώσσα (κλειδί: το ελληνικό όνομα στη βάση): δεδομένα, όχι κείμενα οθόνης.
  /^lib\/platform\/localData\//,
  /^lib\/platform\/places\.js$/,
  /^lib\/platform\/placeSearch\.js$/,
  // Πίνακες γλώσσας (μήνες, αλφάβητο, όνομα γλώσσας): δεδομένα, όχι κείμενα οθόνης.
  /^lib\/platform\/(format|translit|i18n)\.js$/,
  // Τα νομικά στοιχεία της εταιρείας (επωνυμία όπως στο ΓΕΜΗ): δεδομένα.
  /^lib\/platform\/company\.js$/,
];
// Οι παλιές συναρτήσεις ημερομηνίας: ορίζονται εδώ, δεν μετρούν ως «χρήση».
const LEGACY_DEFINERS = [/^lib\/platform\/notifications\.js$/, /^lib\/platform\/format\.js$/];
const LEGACY_CALL = /(?<![.\w$])(formatDateRange|formatDateTime|formatDate|timeAgo)\(/g;

function walk(dir) {
  const out = [];
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      out.push(...walk(rel));
    } else if (/\.(js|jsx|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
}

// Γραμμή με ελληνικό κείμενο στον ΚΩΔΙΚΑ: όχι σχόλιο ολόκληρης γραμμής, και όχι
// ό,τι έρχεται μετά από ένα τελικό « // σχόλιο» (όταν δεν περιέχει εισαγωγικά).
function codeLine(line) {
  const t = line.trim();
  if (!t || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) return "";
  const m = line.match(/\s\/\/\s(?![^'"`]*['"`]).*$/);
  return m ? line.slice(0, m.index) : line;
}

function scan() {
  const greek = {};
  const legacy = {};
  for (const dir of SCOPE) {
    for (const file of walk(dir)) {
      const rel = file.split(path.sep).join("/");
      if (EXCLUDED.some((r) => r.test(rel))) continue;
      const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split("\n");
      let g = 0;
      let l = 0;
      for (const raw of lines) {
        const code = codeLine(raw);
        if (!code) continue;
        if (GREEK.test(code)) g += 1;
        if (!LEGACY_DEFINERS.some((r) => r.test(rel))) l += (code.match(LEGACY_CALL) || []).length;
      }
      if (g) greek[rel] = g;
      if (l) legacy[rel] = l;
    }
  }
  return { greek, legacy };
}

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

// Οι μεταβλητές ενός μηνύματος ICU: {name}, {count, plural, …}. Μετράμε μόνο τα ονόματα.
function placeholders(message) {
  const names = new Set();
  const re = /\{\s*([A-Za-z_][\w]*)\s*[,}]/g;
  let m;
  while ((m = re.exec(String(message)))) names.add(m[1]);
  return [...names].sort().join(",");
}

function readMessages(locale) {
  const dir = path.join(ROOT, "messages", locale);
  if (!fs.existsSync(dir)) return null;
  const out = {};
  const owner = {};
  for (const part of PARTS) {
    const file = path.join(dir, `${part}.json`);
    if (!fs.existsSync(file)) {
      partProblems.push(`messages/${locale}/${part}.json: λείπει.`);
      continue;
    }
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const ns of Object.keys(json)) {
      if (owner[ns]) partProblems.push(`messages/${locale}: το namespace «${ns}» υπάρχει και στο ${owner[ns]} και στο ${part}.`);
      owner[ns] = part;
    }
    Object.assign(out, flatten(json));
  }
  return out;
}
const partProblems = [];

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const problems = [];
const notes = [];

// ── 1. Τάξη στα αρχεία μηνυμάτων ──────────────────────────────────────────
const base = readMessages(DEFAULT_LOCALE);
if (!base) problems.push(`Λείπει ο φάκελος messages/${DEFAULT_LOCALE}.`);
const completeness = {};
for (const code of Object.keys(LANGUAGES)) {
  const file = `messages/${code}`;
  const msgs = readMessages(code);
  if (!msgs) {
    completeness[code] = { missing: Object.keys(base || {}), absent: true };
    if (code !== DEFAULT_LOCALE) notes.push(`${file}: δεν υπάρχει ακόμα (η γλώσσα ${LANGUAGES[code].name} δεν έχει γραφτεί).`);
    continue;
  }
  const missing = [];
  for (const [k, v] of Object.entries(msgs)) {
    if (String(v).trim() === "") problems.push(`${file}: κενή τιμή στο «${k}».`);
    if (code !== DEFAULT_LOCALE && GREEK.test(String(v))) problems.push(`${file}: ελληνικά γράμματα στο «${k}» (μετάφραση).`);
    if (code !== DEFAULT_LOCALE && base) {
      if (!(k in base)) problems.push(`${file}: το κλειδί «${k}» δεν υπάρχει στα ελληνικά (περιττό ή με λάθος όνομα).`);
      else if (placeholders(v) !== placeholders(base[k]))
        problems.push(`${file}: το «${k}» έχει άλλες μεταβλητές από τα ελληνικά ({${placeholders(v)}} αντί για {${placeholders(base[k])}}).`);
    }
  }
  if (code !== DEFAULT_LOCALE && base) for (const k of Object.keys(base)) if (!(k in msgs)) missing.push(k);
  completeness[code] = { missing };
  // Ό,τι μπαίνει στα ελληνικά μπαίνει ταυτόχρονα και στις άλλες γλώσσες (CLAUDE.md).
  if (missing.length) problems.push(`${file}: λείπουν ${missing.length} μηνύματα που υπάρχουν στα ελληνικά (π.χ. ${missing.slice(0, 3).join(", ")}). Κάθε κείμενο γράφεται και στις δύο γλώσσες.`);
}

problems.push(...new Set(partProblems));

// ── 2. Φράχτης: το ελληνικό κείμενο μέσα σε κώδικα μόνο μειώνεται ─────────
const { greek, legacy } = scan();
const mode = args.has("--init") ? "init" : args.has("--update") ? "update" : "check";

if (mode === "init") {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({ greek, legacy }, null, 2) + "\n");
  console.log(`i18n: baseline δημιουργήθηκε (${sum(greek)} γραμμές ελληνικού κειμένου σε ${Object.keys(greek).length} αρχεία, ${sum(legacy)} χρήσεις παλιών συναρτήσεων ημερομηνίας).`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE_FILE)) {
  console.error("i18n: λείπει το scripts/i18n-baseline.json. Τρέξε: node scripts/check-i18n.mjs --init");
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));

function ratchet(label, current, allowed, hint) {
  const lower = {};
  for (const [file, n] of Object.entries(current)) {
    const was = allowed[file] ?? 0;
    if (n > was) problems.push(`${file}: ${n} ${label} (επιτρέπονται ${was}). ${hint}`);
    else if (n < was) lower[file] = n;
  }
  for (const file of Object.keys(allowed)) if (!(file in current)) lower[file] = 0;
  return lower;
}
const lowerGreek = ratchet(
  "γραμμές με ελληνικό κείμενο μέσα στον κώδικα",
  greek,
  baseline.greek || {},
  "Βάλε το κείμενο στο messages/el/*.json (και en.json) και διάβασέ το με useTranslations."
);
const lowerLegacy = ratchet(
  "χρήσεις παλιάς συνάρτησης ημερομηνίας",
  legacy,
  baseline.legacy || {},
  "Χρησιμοποίησε το useFormat() (app/platform/useFormat.js)."
);

if (mode === "update") {
  const next = {
    greek: Object.fromEntries(Object.entries({ ...baseline.greek, ...lowerGreek }).filter(([, n]) => n > 0)),
    legacy: Object.fromEntries(Object.entries({ ...baseline.legacy, ...lowerLegacy }).filter(([, n]) => n > 0)),
  };
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(next, null, 2) + "\n");
  console.log(`i18n: baseline χαμήλωσε σε ${sum(next.greek)} γραμμές κειμένου και ${sum(next.legacy)} παλιές χρήσεις ημερομηνίας.`);
  if (problems.length) {
    console.error(problems.map((p) => `✗ ${p}`).join("\n"));
    process.exit(1);
  }
  process.exit(0);
}

if (Object.keys(lowerGreek).length || Object.keys(lowerLegacy).length) {
  problems.push(
    `Το ελληνικό κείμενο μέσα στον κώδικα μειώθηκε (καλό!). Κλείδωσέ το: node scripts/check-i18n.mjs --update (και κάνε commit το scripts/i18n-baseline.json).`
  );
}

// ── 3. Πύλη: ανοιχτή γλώσσα = πλήρης γλώσσα ───────────────────────────────
const enabled = parseLocales(process.env.NEXT_PUBLIC_PLATFORM_LOCALES || DEFAULT_LOCALE);
const toOpen = args.has("--report") ? Object.keys(LANGUAGES).filter((c) => c !== DEFAULT_LOCALE) : enabled.filter((c) => c !== DEFAULT_LOCALE);

function incomplete(code) {
  const why = [];
  const c = completeness[code];
  if (!c || c.absent) why.push(`δεν υπάρχει ο φάκελος messages/${code}`);
  else if (c.missing.length) why.push(`λείπουν ${c.missing.length} μηνύματα από τα ${Object.keys(base).length} (π.χ. ${c.missing.slice(0, 3).join(", ")})`);
  if (sum(greek)) why.push(`${sum(greek)} γραμμές κώδικα έχουν ακόμα ελληνικό κείμενο μέσα σε ${Object.keys(greek).length} αρχεία`);
  if (sum(legacy)) why.push(`${sum(legacy)} σημεία χρησιμοποιούν παλιές συναρτήσεις ημερομηνίας που δουλεύουν μόνο ελληνικά`);
  return why;
}

if (args.has("--report")) {
  for (const code of toOpen) {
    const why = incomplete(code);
    console.log(`\n${LANGUAGES[code].name} (${code}): ${why.length ? "ΔΕΝ είναι έτοιμη" : "έτοιμη να ανοίξει"}`);
    for (const w of why) console.log(`  · ${w}`);
    if (why.length) {
      const top = Object.entries(greek).sort((a, b) => b[1] - a[1]).slice(0, 8);
      console.log("  Περισσότερα ελληνικά μέσα σε κώδικα:");
      for (const [f, n] of top) console.log(`    ${String(n).padStart(5)}  ${f}`);
    }
  }
  console.log(`\nΣύνολο: ${sum(greek)} γραμμές κειμένου σε ${Object.keys(greek).length} αρχεία · ${sum(legacy)} παλιές χρήσεις ημερομηνίας.`);
  process.exit(problems.length ? 1 : 0);
}

if (args.has("--gate") && process.env.I18N_SKIP_GATE !== "1") {
  for (const code of toOpen) {
    const why = incomplete(code);
    if (why.length)
      problems.push(
        `Η γλώσσα «${LANGUAGES[code].name}» είναι ανοιχτή (NEXT_PUBLIC_PLATFORM_LOCALES) αλλά δεν είναι πλήρης: ${why.join("· ")}. ` +
          `Βγάλ' την από τη μεταβλητή, ή ολοκλήρωσε τη μετάφραση (node scripts/check-i18n.mjs --report).`
      );
  }
}

for (const n of notes) console.log(`i18n: ${n}`);
if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  console.error(`\ni18n: ${problems.length} πρόβλημα(τα).`);
  process.exit(1);
}
const missingAny = Object.entries(completeness).filter(([c, v]) => c !== DEFAULT_LOCALE && v.missing.length);
console.log(
  `i18n: ok · ${sum(greek)} γραμμές ελληνικού κειμένου μέσα στον κώδικα (μόνο μειώνεται) · ${sum(legacy)} παλιές χρήσεις ημερομηνίας` +
    (missingAny.length ? ` · ${missingAny.map(([c, v]) => `${c}: λείπουν ${v.missing.length}`).join(", ")}` : "") +
    ` · ανοιχτές γλώσσες: ${enabled.join(", ")}`
);
