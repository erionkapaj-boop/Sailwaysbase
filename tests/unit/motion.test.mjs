// Κανόνας κίνησης (docs/DESIGN.md «Κίνηση»): κάθε scroll περνά από lib/platform/motion.js. Κανένα άμεσο
// scrollIntoView/scrollTo στον κώδικα των οθονών, ώστε το scroll να είναι πάντα ήπιο, στο κέντρο και να σέβεται το
// «λιγότερη κίνηση» χωρίς να το ξαναγράφουμε ανά σελίδα.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { scrollBehavior, MOTION_MS } from "../../lib/platform/motion.js";

const root = new URL("../../", import.meta.url).pathname;
const offenders = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) { if (name.name !== "node_modules" && name.name !== ".next") walk(p); continue; }
    if (!/\.(js|jsx)$/.test(name.name) || p.endsWith("lib/platform/motion.js")) continue;
    const src = fs.readFileSync(p, "utf8");
    if (/\.scrollIntoView\(|window\.scrollTo\(|\.scrollTo\(/.test(src)) offenders.push(path.relative(root, p));
  }
}
walk(path.join(root, "app"));
walk(path.join(root, "lib"));
assert.deepEqual(offenders, [], `scroll χωρίς το lib/platform/motion.js: ${offenders.join(", ")}`);
console.log("ok   κάθε scroll περνά από το κοινό helper");
assert.ok(MOTION_MS >= 200 && MOTION_MS <= 300);
assert.equal(scrollBehavior(), "smooth"); // χωρίς window (node): χωρίς σφάλμα· στον browser αποφασίζει το prefers-reduced-motion
console.log("ok   διάρκεια 200–300ms, ασφαλές εκτός browser");
