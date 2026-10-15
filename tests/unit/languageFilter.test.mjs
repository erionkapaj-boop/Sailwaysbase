import { parseLanguageIds, speaksAny } from "../../lib/platform/languageFilter.js";

let passed = 0;
const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
  passed++;
};

const rows = [
  { id: 1, languages: ["Αγγλικά", "Ελληνικά"] },
  { id: 2, languages: ["Πολωνικά", "Γερμανικά"] },
  { id: 3, languages: ["Γαλλικά"] },
  { id: 4, languages: null },
];
ok("καμία γλώσσα επιλεγμένη: όλοι", speaksAny(rows, []).length === 4);
ok("μία γλώσσα: μόνο όσοι τη μιλούν", speaksAny(rows, ["Πολωνικά"]).map((r) => r.id).join() === "2");
ok("τρεις γλώσσες: τουλάχιστον μία", speaksAny(rows, ["Πολωνικά", "Αγγλικά", "Ιαπωνικά"]).map((r) => r.id).join() === "1,2");
ok("όποιος δεν μιλά καμία από τις επιλεγμένες δεν εμφανίζεται", !speaksAny(rows, ["Πολωνικά", "Αγγλικά"]).some((r) => r.id === 3));
ok("χωρίς καταχωρημένες γλώσσες: φεύγει όταν υπάρχει φίλτρο", !speaksAny(rows, ["Αγγλικά"]).some((r) => r.id === 4));
ok("η σειρά των αποτελεσμάτων μένει", speaksAny(rows, ["Γαλλικά", "Αγγλικά"]).map((r) => r.id).join() === "1,3");
ok("ids από το URL: κόμμα, κενά, παλιό μονό id", parseLanguageIds("a, b,,c").join() === "a,b,c" && parseLanguageIds("x").join() === "x" && parseLanguageIds("").length === 0 && parseLanguageIds(null).length === 0);
console.log(`${passed} έλεγχοι`);
