#!/usr/bin/env node
// Αντιγράφει τον «εργάτη» (web worker) του maplibre-gl στο public/maplibre.
// Το Next.js δεν πακετάρει σωστά τον εργάτη της βιβλιοθήκης, οπότε τον
// σερβίρουμε εμείς και τον δηλώνουμε με setWorkerUrl (MapViewInner.js).
// Τρέχει μετά από κάθε εγκατάσταση και πριν από κάθε build· τα αρχεία δεν μπαίνουν
// στο git, ώστε να ταιριάζουν πάντα με την εγκατεστημένη έκδοση.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FROM = path.join(ROOT, "node_modules/maplibre-gl/dist");
const TO = path.join(ROOT, "public/maplibre");
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

if (!fs.existsSync(FROM)) {
  // Εγκατάσταση χωρίς τη βιβλιοθήκη (π.χ. μόνο το map/worker): τίποτα να κάνουμε.
  process.exit(0);
}
fs.mkdirSync(TO, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(FROM, f), path.join(TO, f));
console.log(`maplibre: ${FILES.length} αρχεία → public/maplibre`);
