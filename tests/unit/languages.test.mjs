import { searchLanguages, languageLabel, languageCodeOfDbName, isLanguageCode, ISO_639_1 } from "../../lib/platform/languages.js";
import { LANGUAGES } from "../../lib/platform/localData/en.js";

let passed = 0;
const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
  passed++;
};

ok("«Γερ» → Γερμανικά", searchLanguages("Γερ")[0] === "de");
ok("«Ger» → German", searchLanguages("Ger")[0] === "de");
ok("αναζήτηση χωρίς τόνους και με πεζά/κεφαλαία: «γερμ», «GERM»", searchLanguages("γερμ")[0] === "de" && searchLanguages("GERM")[0] === "de");
ok("«Πολ» → Πολωνικά, «pol» → Polish", searchLanguages("Πολ")[0] === "pl" && searchLanguages("pol")[0] === "pl");
ok("ένα γράμμα δεν δίνει προτάσεις", searchLanguages("Γ").length === 0 && searchLanguages("").length === 0);
ok("οι ήδη επιλεγμένες δεν προτείνονται", !searchLanguages("Γερ", { exclude: ["de"] }).includes("de"));
ok("σπάνιες γλώσσες βρίσκονται και στα δύο: Ταϊλανδικά / Thai", searchLanguages("Ταϊλ")[0] === "th" && searchLanguages("Thai")[0] === "th");
ok("το όριο προτάσεων είναι 6", searchLanguages("an").length <= 6);
ok("ονόματα: δικά μας για τις γλώσσες της βάσης", languageLabel("en", "el") === "Αγγλικά" && languageLabel("en", "en") === "English" && languageLabel("el", "el") === "Ελληνικά");
ok("ονόματα: Intl για τις υπόλοιπες", languageLabel("th", "en") === "Thai" && languageLabel("th", "el").length > 2);
ok("κάθε γλώσσα της βάσης έχει κωδικό (εκτός από μη αντιστοιχισμένες)", Object.keys(LANGUAGES).every((n) => languageCodeOfDbName(n)), Object.keys(LANGUAGES).filter((n) => !languageCodeOfDbName(n)).join());
ok("κωδικός: δύο ή τρία γράμματα", isLanguageCode("en") && isLanguageCode("fil") && !isLanguageCode("8b2f0c3e-1111") && !isLanguageCode(""));
ok("ο κατάλογος έχει όλες τις γλώσσες ISO 639-1 (περίπου 180)", ISO_639_1.length >= 175);
console.log(`${passed} έλεγχοι`);
