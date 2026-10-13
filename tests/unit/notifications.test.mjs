// Οι ειδοποιήσεις διαβάζονται από τα messages. Τα ελληνικά πρέπει να βγαίνουν
// ακριβώς όπως πριν (tests/fixtures/notifications.json, παράχθηκε από τον παλιό κώδικα)
// και τα αγγλικά να μη περιέχουν ούτε ένα ελληνικό γράμμα.
process.env.TZ = "UTC";
import fs from "node:fs";
import { PARTS } from "../../messages/parts.js";
import { setCurrentMessages } from "../../lib/platform/tNow.js";
import { describeNotification } from "../../lib/platform/notifications.js";

function load(locale) {
  const out = {};
  for (const p of PARTS) Object.assign(out, JSON.parse(fs.readFileSync(`messages/${locale}/${p}.json`, "utf8")));
  return out;
}
let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`ok   ${msg}`);
  else {
    failed += 1;
    console.log(`FAIL ${msg}`);
  }
};
const GREEK = /[Ͱ-Ͽ]/;
const cases = JSON.parse(fs.readFileSync("tests/fixtures/notifications.json", "utf8"));

setCurrentMessages("el", load("el"));
let same = 0;
for (const { n, r } of cases) {
  const got = describeNotification(n, "el");
  if (JSON.stringify(got) === JSON.stringify(r)) same += 1;
  else console.log("  διαφορά", n.kind, JSON.stringify(n.data), "\n   παλιό:", JSON.stringify(r), "\n   νέο:  ", JSON.stringify(got));
}
ok(same === cases.length, `ελληνικά: ${same}/${cases.length} ειδοποιήσεις ίδιες με πριν`);

setCurrentMessages("en", load("en"));
let clean = 0;
for (const { n } of cases) {
  const data = JSON.parse(JSON.stringify(n.data).replace(/"[^"]*[Ͱ-Ͽ][^"]*"/g, '"X"'));
  const got = describeNotification({ ...n, data }, "en");
  const text = `${got.title} ${got.body}`;
  if (!GREEK.test(text) && got.title) clean += 1;
  else console.log("  ελληνικά στα αγγλικά:", n.kind, text);
}
ok(clean === cases.length, `αγγλικά: ${clean}/${cases.length} χωρίς ελληνικά γράμματα`);
ok(describeNotification({ kind: "request_expired", data: { role: "cook", refund: 1, released: 3 } }, "en").body === "Cook · 1 credit refunded · 3 credits released", "αγγλικά: πληθυντικός credit");

if (failed) process.exit(1);
console.log("\nALL NOTIFICATION TESTS PASSED");
