// Φτιάχνει το lib/platform/boatData.js από τα αρχεία του φακέλου data/:
//   data/boat-models.csv        kind, brand, series, model, full_name, greece, croatia, image_group, image_file
//   data/boat-aliases.csv       alias, base   (εκδόσεις/εμπορικές ονομασίες που δείχνουν σε βασικό μοντέλο)
//   data/boat-image-groups.json id, file, width, height
// Όταν ο ιδιοκτήτης στείλει νέο Excel/CSV: ενημερώνονται τα αρχεία data/ και τρέχει
//   node scripts/build-boat-data.mjs
import fs from "node:fs";

const csv = (file) => {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x !== ""));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
};

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9.]+/g, " ").trim();

const models = csv("data/boat-models.csv");
const groups = JSON.parse(fs.readFileSync("data/boat-image-groups.json", "utf8"));
const aliases = csv("data/boat-aliases.csv");

// Όνομα που δείχνει στα chips: χωρίς τη μάρκα όταν το υπόλοιπο ξεκινά με γράμμα
// («Oceanis 45», «Cruiser 50»), αλλιώς το πλήρες όνομα («Lagoon 40»).
const label = (m) => {
  const rest = [m.series, m.model].filter(Boolean).join(" ");
  return /^[A-Za-z]/.test(rest) && !/^[0-9]/.test(rest) ? rest : m.full_name;
};

const byFull = new Map(models.map((m) => [norm(m.full_name), m]));
const resolved = [];
const unresolved = [];
for (const a of aliases) {
  const b = norm(a.base);
  let hit = byFull.get(b);
  if (!hit) {
    const found = models.filter((m) => norm(m.full_name).endsWith(` ${b}`) || norm(m.full_name) === b);
    if (found.length === 1) hit = found[0];
  }
  if (hit) resolved.push([a.alias, hit.full_name]);
  else unresolved.push(a);
}

const data = {
  BOAT_GROUPS: Object.fromEntries(groups.map((g) => [g.id, g.file])),
  BOAT_MODELS: models.map((m) => [m.kind, m.brand, label(m), m.full_name, m.image_group, Number(m.greece)]),
  BOAT_ALIASES: resolved,
};
const out =
  "// ΑΥΤΟΜΑΤΑ ΠΑΡΑΓΟΜΕΝΟ από το scripts/build-boat-data.mjs (πηγή: φάκελος data/). Μην το επεξεργάζεσαι με το χέρι.\n" +
  "// BOAT_MODELS: [τύπος, μάρκα, όνομα στη λίστα, πλήρες όνομα, ομάδα εικόνας, επιβεβαιωμένο στην Ελλάδα]\n" +
  Object.entries(data).map(([k, v]) => `export const ${k} = ${JSON.stringify(v)};\n`).join("");
fs.writeFileSync("lib/platform/boatData.js", out);
console.log(`μοντέλα ${models.length} · ομάδες εικόνων ${groups.length} · aliases ${resolved.length} (χωρίς αντιστοίχιση: ${unresolved.length})`);
for (const a of unresolved) console.log(`  χωρίς βασικό μοντέλο: «${a.alias}» → «${a.base}»`);
