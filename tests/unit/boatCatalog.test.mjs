import fs from "node:fs";
import { BOAT_MODELS, BOAT_GROUPS, BOAT_ALIASES } from "../../lib/platform/boatData.js";
import { MODELS, KINDS, searchBrands, searchModels, modelsFor, boatName, inferFeet, findModel } from "../../lib/platform/boatCatalog.js";
import { boatImage } from "../../lib/platform/boatImages.js";

let passed = 0;
const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
  passed++;
};

ok("259 μοντέλα: 187 ιστιοπλοϊκά και 72 καταμαράν", BOAT_MODELS.length === 259 && BOAT_MODELS.filter((m) => m[0] === "sail").length === 187 && BOAT_MODELS.filter((m) => m[0] === "cat").length === 72);
ok("9 εικόνες, όλες υπάρχουν στο public/boats", Object.keys(BOAT_GROUPS).length === 9 && Object.values(BOAT_GROUPS).every((f) => fs.existsSync(`public/boats/${f}`)), Object.values(BOAT_GROUPS).join());
const noImg = BOAT_MODELS.filter(([, brand, label]) => !boatImage(brand, label));
ok("κάθε μοντέλο βρίσκει την εικόνα του (μηδέν σπασμένα)", noImg.length === 0, noImg.slice(0, 3).join(" | "));
ok("όλες οι εικόνες είναι ενδεικτικές AI", BOAT_MODELS.every(([, brand, label]) => boatImage(brand, label).illustrative === true));
ok("οι συνηθισμένες μάρκες του ιδιοκτήτη υπάρχουν στον κατάλογο", KINDS.sail.slice(0, 7).every((b) => MODELS.sail[b]) && KINDS.cat.every((b) => MODELS.cat[b]));
ok("πρώτα όσα επιβεβαιώθηκαν στην Ελλάδα", (() => {
  const gr = new Set(BOAT_MODELS.filter((m) => m[5]).map((m) => m[2]));
  const first = modelsFor("Bavaria", "sail").slice(0, 3);
  return first.every((l) => gr.has(l));
})());
ok("όνομα = μάρκα + μοντέλο, χωρίς διπλή μάρκα", boatName("Bavaria", "Cruiser 46") === "Bavaria Cruiser 46" && boatName("Lagoon", "Lagoon 40") === "Lagoon 40");
ok("αναζήτηση μάρκας με προτάσεις", searchBrands("bav", "sail")[0] === "Bavaria" && searchBrands("fount", "cat")[0] === "Fountaine Pajot");
ok("αναζήτηση μοντέλου: «c45», «cruiser46»", searchModels("c45", "Bavaria", "sail").includes("C45") && searchModels("cruiser46", "Bavaria", "sail").includes("Cruiser 46"));
ok("έκδοση/alias προτείνει το βασικό μοντέλο («C42 Style» → C42)", searchModels("c42 style", "Bavaria", "sail").includes("C42"));
ok("εικόνα από πλήρες όνομα και από alias", boatImage("Bavaria Cruiser 46")?.src.startsWith("/boats/") && boatImage("Bavaria C42 Style")?.src.startsWith("/boats/") && boatImage("Άγνωστο 99") === null);
ok("γνωστό και άγνωστο μοντέλο", findModel("Lagoon 42")?.brand === "Lagoon" && findModel("Foo", "Bar 1") === null);
ok("πόδια από το μοντέλο", inferFeet("Lagoon", "Lagoon 380") === 38 && inferFeet("Beneteau", "Oceanis 46.1") === 46 && inferFeet("Bali", "Bali 4.6") === 46 && inferFeet("Jeanneau", "Sun Odyssey 410") === 41 && inferFeet("Elan", "E4") === null);
ok("τα aliases δείχνουν σε υπαρκτά μοντέλα", BOAT_ALIASES.length >= 30 && BOAT_ALIASES.every(([, base]) => findModel(base)));
console.log(`${passed} έλεγχοι`);
