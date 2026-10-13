// Δεδομένα της βάσης στη γλώσσα της σελίδας (docs/I18N.md §7): κάθε τιμή των
// λιστών που ζουν στη βάση πρέπει να έχει όνομα σε κάθε γλώσσα με λεξικό, και
// κανένα αγγλικό όνομα δεν περιέχει ελληνικά γράμματα.
import fs from "node:fs";
import { localizeData, localizeName, displayName } from "../../lib/platform/localData.js";
import * as en from "../../lib/platform/localData/en.js";
import { REGION_INFO, COUNTRIES } from "../../lib/platform/places.js";

let failed = 0;
const ok = (cond, msg, detail = "") => {
  if (cond) console.log(`ok   ${msg}`);
  else {
    failed += 1;
    console.log(`FAIL ${msg}${detail ? `\n     ${detail}` : ""}`);
  }
};
const GREEK = /[Ͱ-Ͽἀ-῿]/;

const sql = (f) => fs.readFileSync(`supabase/migrations/${f}`, "utf8");
const values = (text, table) => {
  const m = [...text.matchAll(new RegExp(`insert into ${table}\\s*\\(name\\)\\s*values\\s*([\\s\\S]*?)on conflict`, "g"))];
  return m.flatMap((x) => [...x[1].matchAll(/'((?:[^']|'')*)'/g)].map((y) => y[1]));
};
const seedLanguages = [...values(sql("0004_seed.sql"), "languages"), ...values(sql("0056_more_languages.sql"), "languages")];
const seedBoats = values(sql("0004_seed.sql"), "boat_types");
const seedNationalities = [...sql("0046_nationality_and_language_filter.sql").matchAll(/insert into nationalities \(name\)\s*values([\s\S]*?)on conflict/g)].flatMap((x) =>
  [...x[1].matchAll(/'((?:[^']|'')*)'/g)].map((y) => y[1])
);

ok(seedLanguages.length >= 28 && seedBoats.length === 4 && seedNationalities.length >= 40, "οι λίστες της βάσης διαβάστηκαν", `${seedLanguages.length}/${seedBoats.length}/${seedNationalities.length}`);
for (const [label, list, dict] of [
  ["γλώσσες", seedLanguages, en.LANGUAGES],
  ["τύποι σκαφών", seedBoats, en.BOAT_TYPES],
  ["εθνικότητες", seedNationalities, en.NATIONALITIES],
]) {
  const missing = list.filter((v) => !dict[v]);
  ok(missing.length === 0, `αγγλικά ονόματα για όλες τις ${label}`, missing.join(", "));
}
const regionsMissing = Object.entries(REGION_INFO).filter(([, i]) => !i.en).map(([n]) => n);
ok(regionsMissing.length === 0, "αγγλικό όνομα για κάθε περιοχή", regionsMissing.join(", "));
ok(COUNTRIES.every((c) => c.en), "αγγλικό όνομα για κάθε χώρα");

const dirty = [];
for (const [name, obj] of Object.entries(en)) for (const [k, v] of Object.entries(obj)) if (GREEK.test(v)) dirty.push(`${name}.${k}`);
ok(dirty.length === 0, "κανένα αγγλικό όνομα δεν έχει ελληνικά γράμματα", dirty.join(", "));

ok(localizeData("Άλιμος (Σαρωνικός) · Ιστιοπλοϊκό", "en") === "Alimos (Saronic Gulf) · Sailboat", "τόπος, περιοχή και τύπος σκάφους");
ok(localizeData("Κέρκυρα", "en") === "Corfu", "γνωστό αγγλικό όνομα τόπου");
ok(localizeData("Αγγλικά, Ελληνικά", "en") === "English, Greek", "λίστα γλωσσών");
ok(localizeData("Πολλοί σταματούν: Εγγραφή", "en") === "Many drop out: Sign-up", "κείμενο συστήματος με πρόθεμα");
ok(localizeData("Άλιμος", "el") === "Άλιμος", "στα ελληνικά τίποτα δεν αλλάζει");
ok(localizeData("Μια άγνωστη τοποθεσία", "en") === "Mia agnosti topothesia", "άγνωστο: μεταγραφή, ποτέ ελληνικά");
ok(localizeName("Σάμη Παπαδοπούλου", "en") === "Sami Papadopoulou", "όνομα: μόνο μεταγραφή, όχι λεξικό");
ok(displayName({ full_name: "Γιώργος Παπαδόπουλος", full_name_latin: "Giorgos Papadopoulos" }, "en") === "Giorgos Papadopoulos", "όνομα από τη βάση");
ok(displayName({ full_name: "Γιώργος Παπαδόπουλος" }, "en") === "Giorgos Papadopoulos", "όνομα χωρίς πεδίο της βάσης");
ok(displayName({ full_name: "Γιώργος" }, "el") === "Γιώργος", "όνομα στα ελληνικά");

if (failed) process.exit(1);
console.log("\nALL LOCAL DATA TESTS PASSED");
