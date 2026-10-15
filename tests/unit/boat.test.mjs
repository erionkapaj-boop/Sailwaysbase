// Γραμμή σκάφους σε αίτημα: «Bavaria 46 · 2022» (τα πόδια δεν επαναλαμβάνονται όταν υπάρχουν στο όνομα).
import assert from "node:assert/strict";
import { boatLine, boatParts, boatValid } from "../../lib/platform/boat.js";

assert.equal(boatLine({ boat_model: "Bavaria 46", boat_length_ft: 46, boat_year: 2022 }), "Bavaria 46 · 2022");
assert.equal(boatLine({ boat_model: "Lagoon 42", boat_length_ft: 42 }), "Lagoon 42");
assert.equal(boatLine({ boat_model: "Jeanneau 349", boat_length_ft: 35, boat_year: 2019 }), "Jeanneau 349 · 35 ft · 2019");
assert.equal(boatLine({ boat_model: "Oceanis 46.1", boat_length_ft: 46 }), "Oceanis 46.1");
assert.equal(boatLine({ boat_model: "Sun Odyssey 349", boat_length_ft: 34 }), "Sun Odyssey 349 · 34 ft");
assert.equal(boatLine({ boat_length_ft: 40 }), "40 ft");
assert.equal(boatLine({ boat_year: 2020 }), "2020");
assert.deepEqual(boatParts(null), []);
assert.equal(boatValid({ year: "1800" }), false);
assert.equal(boatValid({ year: "2022", lengthFt: "46" }), true);
console.log("boat: ok");
