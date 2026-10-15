import { parseLanguageIds, parseLanguageCodes, speaksAny, annotateSpoken, languageCodesOf } from "../../lib/platform/languageFilter.js";

let passed = 0;
const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
  passed++;
};

// row.languages: τα ονόματα όπως είναι στη βάση (ελληνικά)· η επιλογή είναι κωδικοί ISO.
const rows = [
  { id: 1, languages: ["Αγγλικά", "Ελληνικά"] },
  { id: 2, languages: ["Πολωνικά", "Γερμανικά"] },
  { id: 3, languages: ["Γαλλικά"] },
  { id: 4, languages: null },
  { id: 5, languages: ["Ινδικά"] },
];
ok("καμία γλώσσα επιλεγμένη: όλοι", speaksAny(rows, []).length === 5);
ok("μία γλώσσα: μόνο όσοι τη μιλούν", speaksAny(rows, ["pl"]).map((r) => r.id).join() === "2");
ok("τρεις γλώσσες: τουλάχιστον μία", speaksAny(rows, ["pl", "en", "ja"]).map((r) => r.id).join() === "1,2");
ok("όποιος δεν μιλά καμία από τις επιλεγμένες δεν εμφανίζεται", !speaksAny(rows, ["pl", "en"]).some((r) => r.id === 3));
ok("χωρίς καταχωρημένες γλώσσες: φεύγει όταν υπάρχει φίλτρο", !speaksAny(rows, ["en"]).some((r) => r.id === 4));
ok("η σειρά των αποτελεσμάτων μένει", speaksAny(rows, ["fr", "en"]).map((r) => r.id).join() === "1,3");
ok("«Ινδικά» της βάσης αντιστοιχεί στα Ινδικά (hi)", speaksAny(rows, ["hi"]).map((r) => r.id).join() === "5");
ok("γλώσσα που δεν δηλώνει κανείς: κανένα αποτέλεσμα, χωρίς σφάλμα", speaksAny(rows, ["th"]).length === 0);
ok("κωδικοί γλωσσών επαγγελματία", [...languageCodesOf(rows[1])].sort().join() === "de,pl");

const marked = annotateSpoken(speaksAny(rows, ["en", "de", "pl"]), ["en", "de", "pl"]);
ok("σημάδι ανά επαγγελματία: ποιες από τις επιλεγμένες μιλά",
  marked.find((r) => r.id === 1).matched_languages.join() === "en" && marked.find((r) => r.id === 2).matched_languages.sort().join() === "de,pl");
ok("χωρίς επιλογή δεν προστίθεται σημάδι", annotateSpoken(rows, []).every((r) => r.matched_languages === undefined));

ok("ids από το URL: κόμμα, κενά, παλιό μονό id", parseLanguageIds("a, b,,c").join() === "a,b,c" && parseLanguageIds("x").join() === "x" && parseLanguageIds("").length === 0 && parseLanguageIds(null).length === 0);
const legacy = new Map([["8b2f0c3e-1111-4222-8333-444455556666", "de"]]);
ok("κωδικοί και παλιά ids μαζί", parseLanguageCodes("en,8b2f0c3e-1111-4222-8333-444455556666,en,zz-unknown", legacy).join() === "en,de");
console.log(`${passed} έλεγχοι`);
