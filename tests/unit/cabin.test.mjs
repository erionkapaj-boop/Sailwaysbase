import { cabinAt, cabinsFilled, parsePositions, serializePositions, CABIN_UNKNOWN, CABIN_CHOICES, isMultiDay, cabinKindForDb, CABIN_KINDS, isPrivateCabin, cabinKindFrom, parseCabins, serializeCabins, cabinOf } from "../../lib/platform/cabin.js";

let passed = 0;
const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
  passed++;
};

ok("τρεις επιλογές", CABIN_KINDS.join() === "bunk,private,skipper");
ok("κουκέτα = όχι ιδιωτική, τα άλλα δύο = ναι", isPrivateCabin("bunk") === false && isPrivateCabin("private") === true && isPrivateCabin("skipper") === true && isPrivateCabin("") === undefined);
ok("παλιό true/false", cabinKindFrom("true") === "private" && cabinKindFrom("false") === "bunk" && cabinKindFrom("", true) === "private");
const p = parseCabins("skipper:private,hostess:bunk");
ok("ανά ρόλο", p.map.skipper === "private" && p.map.hostess === "bunk" && p.all === "");
ok("μία τιμή για όλους (παλιά μορφή)", parseCabins("true").all === "private" && parseCabins("skipper").all === "skipper");
ok("σειρά και απόρριψη άκυρων", serializeCabins({ hostess: "bunk", skipper: "skipper", cook: "zzz" }, ["skipper", "hostess", "cook"]) === "skipper:skipper,hostess:bunk");
ok("γύρος μετάβασης URL", JSON.stringify(parseCabins(serializeCabins({ skipper: "private", deckhand: "bunk" }, ["skipper", "deckhand"])).map) === JSON.stringify({ skipper: "private", deckhand: "bunk" }));
ok("cabinOf: ανά ρόλο, αλλιώς κοινή, αλλιώς παλιό boolean", cabinOf({ cabins: { skipper: "bunk" } }, "skipper") === "bunk" && cabinOf({ cabinKind: "private" }, "hostess") === "private" && cabinOf({ privateCabin: false }, "cook") === "bunk" && cabinOf({}, "cook") === "");
ok("«Δεν ξέρω ακόμα»: μόνο στην οθόνη και στο URL, όχι στη βάση", CABIN_CHOICES.join() === "bunk,private,skipper,unknown" && cabinKindForDb(CABIN_UNKNOWN) === null && cabinKindForDb("skipper") === "skipper" && isPrivateCabin(CABIN_UNKNOWN) === undefined);
ok("γύρος URL με «δεν ξέρω»", parseCabins(serializeCabins({ skipper: "bunk", hostess: "unknown" }, ["skipper", "hostess"])).map.hostess === "unknown");
ok("πολυήμερο: μόνο όταν η λήξη είναι μετά την έναρξη", isMultiDay("2026-10-27", "2026-10-28") && !isMultiDay("2026-10-27", "2026-10-27") && !isMultiDay("", "2026-10-27") && !isMultiDay("2026-10-27", ""));
const pos = parseCabins("hostess:private,hostess:bunk,skipper:skipper");
ok("μία διαμονή ανά θέση στο URL", JSON.stringify(pos.list) === JSON.stringify({ hostess: ["private", "bunk"], skipper: ["skipper"] }) && pos.map.hostess === "private");
ok("σειριοποίηση ανά θέση", serializeCabins({ hostess: ["private", "bunk"], skipper: ["skipper"] }, ["skipper", "hostess"], { hostess: 2 }) === "skipper:skipper,hostess:private,hostess:bunk");
ok("περισσότερες καταχωρίσεις από θέσεις κόβονται", serializeCabins({ hostess: ["private", "bunk"] }, ["hostess"], { hostess: 1 }) === "hostess:private");
ok("θέσεις στο URL", JSON.stringify(parsePositions("hostess:2,cook:3,x:0,deckhand:99")) === JSON.stringify({ hostess: 2, cook: 3, deckhand: 8 }) && serializePositions({ hostess: 2, cook: 1 }, ["hostess", "cook"]) === "hostess:2");
ok("cabinAt: ανά θέση· σκέτη τιμή ισχύει για όλες", cabinAt({ cabins: { hostess: ["private", "bunk"] } }, "hostess", 1) === "bunk" && cabinAt({ cabins: { hostess: ["private"] } }, "hostess", 1) === "" && cabinAt({ cabins: { hostess: "bunk" } }, "hostess", 1) === "bunk");
ok("cabinsFilled: όλες οι θέσεις απαντημένες", cabinsFilled({ cabins: { hostess: ["private", "bunk"] } }, "hostess", 2) && !cabinsFilled({ cabins: { hostess: ["private"] } }, "hostess", 2));
console.log(`${passed} έλεγχοι`);
