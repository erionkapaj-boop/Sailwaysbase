import { CABIN_UNKNOWN, CABIN_CHOICES, isMultiDay, cabinKindForDb, CABIN_KINDS, isPrivateCabin, cabinKindFrom, parseCabins, serializeCabins, cabinOf } from "../../lib/platform/cabin.js";

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
console.log(`${passed} έλεγχοι`);
