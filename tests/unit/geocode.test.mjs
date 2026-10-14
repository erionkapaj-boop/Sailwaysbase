import assert from "node:assert/strict";
import { REJECT, rank, pickBest, searchBox, regionViewbox } from "../../map/tools/geocode-rules.mjs";

let passed = 0;
const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
  passed++;
};
const r = (cls, lat = 37, lng = 24, name = cls) => ({ lat, lng, cls, name });

// Τα πραγματικά λάθη του πρώτου περάσματος (OpenStreetMap, 14/10/2026) απορρίπτονται.
for (const cls of ["amenity/place_of_worship", "tourism/hotel", "amenity/restaurant", "shop/bakery", "amenity/taxi", "natural/peak", "tourism/museum", "historic/archaeological_site", "highway/secondary"]) {
  ok(`απορρίπτεται: ${cls}`, rank(r(cls)) === 9, rank(r(cls)));
}
ok("γίνονται δεκτά: νησί, πόλη, χωριό", ["place/island", "place/town", "place/village", "place/city", "place/hamlet"].every((c) => rank(r(c)) === 1));
ok("προτιμώνται: μαρίνα, λιμάνι", rank(r("leisure/marina")) === 0 && rank(r("man_made/pier")) === 0 && rank(r("amenity/ferry_terminal")) === 0, [rank(r("leisure/marina")), rank(r("amenity/ferry_terminal"))]);

const best = pickBest([r("amenity/place_of_worship"), r("place/village", 37.1, 24.2), r("leisure/marina", 37.2, 24.3)]);
ok("διαλέγει τη μαρίνα και όχι την εκκλησία", best.pick.cls === "leisure/marina" && !best.rejected);
ok("αν υπάρχουν μόνο απορριπτέα, σημαίνεται για έλεγχο", pickBest([r("tourism/hotel"), r("shop/bakery")]).rejected === true);
ok("χωρίς αποτελέσματα → null", pickBest([]) === null);

const box = searchBox({ lat: 38.7, lng: 20.65 }, null, 0.3);
ok("πλαίσιο γύρω από το νησί-γονέα", box[0] < 20.65 && box[2] > 20.65 && box[1] < 38.7 && box[3] > 38.7 && Math.abs(box[2] - box[0] - 0.6) < 1e-9, box);
ok("χωρίς γονέα, το πλαίσιο της περιοχής", JSON.stringify(searchBox(null, [1, 2, 3, 4])) === "[1,2,3,4]");
ok("viewbox περιοχής: minLng,minLat,maxLng,maxLat", JSON.stringify(regionViewbox("Κυκλάδες")) === "[24.1,36.2,26.6,38]", regionViewbox("Κυκλάδες"));
ok("άγνωστη περιοχή → null", regionViewbox("Άγνωστη") === null);
console.log(`${passed} έλεγχοι`);
