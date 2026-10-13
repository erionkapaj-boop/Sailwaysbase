// Ελληνικά → λατινικά (ΕΛΟΤ 743). Τρέχει με: node tests/unit/translit.test.mjs
// Τα ίδια παραδείγματα (tests/fixtures/translit.json) τα δοκιμάζει και η βάση
// (tests/db/i18n.test.sql), ώστε οι δύο εκδόσεις να είναι πάντα ίδιες.
import fs from "node:fs";
import { greekToLatin, latinName, hasGreek } from "../../lib/platform/translit.js";

const cases = JSON.parse(fs.readFileSync(new URL("../fixtures/translit.json", import.meta.url), "utf8"));
let failures = 0;
for (const [greek, latin] of cases) {
  const got = greekToLatin(greek);
  if (got === latin) console.log(`ok   ${greek || "(κενό)"} → ${latin || "(κενό)"}`);
  else {
    failures += 1;
    console.log(`FAIL ${greek} → ${got}  (περίμενα ${latin})`);
  }
}
const extra = [
  ["latinName: όνομα χωρίς ελληνικά μένει όπως είναι", latinName("Anna-Maria"), "Anna-Maria"],
  ["latinName: ελληνικό όνομα μετατρέπεται", latinName("Άννα"), "Anna"],
  ["hasGreek: λατινικό = όχι", hasGreek("Anna"), false],
  ["hasGreek: ελληνικό = ναι", hasGreek("Άννα"), true],
  ["null δεν σπάει", greekToLatin(null), ""],
  ["κανένα ελληνικό γράμμα στην έξοδο", /[Ͱ-Ͽἀ-῿]/.test(cases.map(([g]) => greekToLatin(g)).join(" ")), false],
];
for (const [label, got, want] of extra) {
  if (got === want) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.log(`FAIL ${label}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
  }
}
console.log(failures ? `\n${failures} FAILED` : "\nALL TRANSLIT TESTS PASSED");
process.exit(failures ? 1 : 0);
