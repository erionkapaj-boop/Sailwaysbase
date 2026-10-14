import assert from "node:assert/strict";
import { distanceNm, whatIsHere, whereIs, positionedPlaces, boundsOf, placeKey, locatePoint } from "../../lib/platform/geo.js";
import { buildPlaceIndex } from "../../lib/platform/placeSearch.js";
import { PLACES } from "../../lib/platform/places.js";

let passed = 0;
const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
  passed++;
};

// Δοκιμαστικές θέσεις (ονόματα ενός γνωστού και μερικών κοντινών μερών).
const find = (name, parent) => PLACES.find((p) => p.name === name && (parent ? p.parent === parent : !p.parent));
const fake = {
  "Αθήνα – Άλιμος": { lat: 37.9087, lng: 23.7117 },
  "Λαύριο": { lat: 37.7133, lng: 24.0583 },
  "Πάρος": { lat: 37.0850, lng: 25.1500 },
  "Μύκονος": { lat: 37.4467, lng: 25.3289 },
};
const positioned = positionedPlaces({ coords: fake });

ok("θέσεις μόνο για μέρη του λεξικού που έχουν συντεταγμένες", positioned.length === 4 && positioned.every((e) => find(e.place.name, e.place.parent)));
ok("απόσταση Άλιμος–Λαύριο ≈ 18–20 ν.μ.", (() => { const d = distanceNm(fake["Αθήνα – Άλιμος"], fake["Λαύριο"]); return d > 17 && d < 21; })(), distanceNm(fake["Αθήνα – Άλιμος"], fake["Λαύριο"]));
ok("η απόσταση ενός σημείου από τον εαυτό του είναι 0", distanceNm(fake["Πάρος"], fake["Πάρος"]) === 0);

const near = whatIsHere({ lat: 37.911, lng: 23.715 }, { positioned });
ok("πάτημα κοντά στον Άλιμο → το μέρος «Άλιμος», Σαρωνικός", near.kind === "place" && near.place.name === "Άλιμος" && near.regionName === "Σαρωνικός", near);

const far = whatIsHere({ lat: 37.20, lng: 25.05 }, { positioned });
ok("πάτημα στη θάλασσα κοντά στην Πάρο (αλλά όχι σε μέρος) → περιοχή Κυκλάδες", far.kind === "region" && far.regionName === "Κυκλάδες", far);

ok("πάτημα μακριά από κάθε γνωστό μέρος → τίποτα", whatIsHere({ lat: 50, lng: 10 }, { positioned }).kind === "none");
ok("χωρίς θέσεις → τίποτα", whatIsHere({ lat: 37.9, lng: 23.7 }, { positioned: [] }).kind === "none");

const over = positionedPlaces({ coords: fake, overrides: { "Λαύριο": { lat: 37.72, lng: 24.07 } } });
ok("η διόρθωση του ιδιοκτήτη υπερισχύει", over.find((e) => e.key === "Λαύριο").lat === 37.72 && over.find((e) => e.key === "Λαύριο").review === false);

const index = buildPlaceIndex([]);
const found = whereIs(index, "Lavrio", { positioned });
ok("«Lavrio» (λατινικά) → Λαύριο, με θέση", found.length === 1 && found[0].entry.name === "Λαύριο" && found[0].lat === 37.7133, found);
ok("άγνωστο μέρος → κενό", whereIs(index, "Ξξξξξξ", { positioned }).length === 0);
ok("όρια σημείων", JSON.stringify(boundsOf([{ lng: 1, lat: 2 }, { lng: 3, lat: 0 }])) === "[[1,0],[3,2]]");
ok("κλειδί λιμανιού νησιού", placeKey({ name: "Νάουσα", parent: "Πάρος" }) === "Πάρος – Νάουσα");

const fake2 = { ...fake, "Πάρος – Νάουσα": { lat: 37.1235, lng: 25.2387 } };
const pos2 = positionedPlaces({ coords: fake2 });
ok("θέση αιτήματος: «Νάουσα (Πάρος)» → το λιμάνι της Πάρου", locatePoint("Νάουσα (Πάρος)", { positioned: pos2 })?.key === "Πάρος – Νάουσα");
ok("θέση αιτήματος: όνομα μέρους", locatePoint("Λαύριο", { positioned: pos2 })?.lat === 37.7133);
ok("θέση αιτήματος: χωρίς τόνους, κεφαλαία, λατινικά", locatePoint("LAVRIO", { positioned: pos2 })?.key === "Λαύριο" && locatePoint("λαυριο", { positioned: pos2 })?.key === "Λαύριο");
ok("θέση αιτήματος: λιμάνι με όνομα μόνο του", locatePoint("Άλιμος", { positioned: pos2 })?.key === "Αθήνα – Άλιμος");
const reg = locatePoint("Κυκλάδες", { positioned: pos2 });
ok("θέση αιτήματος: περιοχή → κέντρο και όρια της περιοχής", reg?.kind === "region" && reg.bounds && reg.lat > 37 && reg.lat < 37.5, reg);
ok("θέση αιτήματος: άγνωστο ή κενό → τίποτα", locatePoint("Λαυριοπολη", { positioned: pos2 }) === null && locatePoint("  ", { positioned: pos2 }) === null);
ok("θέση αιτήματος: μέρος χωρίς συντεταγμένες → τίποτα", locatePoint("Σύρος", { positioned: pos2 }) === null);

console.log(`${passed} έλεγχοι`);
