// Πού θα κοιμάται ο επαγγελματίας: κουκέτα (κοινή καμπίνα), ιδιωτική καμπίνα ή η καμπίνα
// του σκίπερ (η ειδική μικρή καμπίνα πληρώματος του σκάφους, συνήθως στην πλώρη).
// Ρωτιέται ξεχωριστά για κάθε επαγγελματία που ζητά ο πελάτης (skipper, hostess, ...).
// Το πεδίο private_cabin της βάσης μένει boolean: κουκέτα = false, τα άλλα δύο = true.
export const CABIN_KINDS = ["bunk", "private", "skipper"];

export const isPrivateCabin = (kind) => (CABIN_KINDS.includes(kind) ? kind !== "bunk" : undefined);

// Από το παλιό true/false του URL ή του προσχεδίου.
export function cabinKindFrom(param, privateCabin) {
  if (CABIN_KINDS.includes(param)) return param;
  if (param === "true" || privateCabin === true) return "private";
  if (param === "false" || privateCabin === false) return "bunk";
  return "";
}

// URL: «skipper:private,hostess:bunk» (ανά ρόλο) ή μία τιμή για όλους (παλιά μορφή: bunk, true, false).
export function parseCabins(param) {
  const map = {};
  let all = "";
  for (const part of String(param || "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [role, kind] = part.includes(":") ? part.split(":") : ["", part];
    const k = cabinKindFrom(kind, undefined);
    if (!k) continue;
    if (role) map[role] = k;
    else all = k;
  }
  return { map, all };
}

export function serializeCabins(map, roles) {
  return roles.filter((r) => CABIN_KINDS.includes(map?.[r])).map((r) => `${r}:${map[r]}`).join(",");
}

// Η καμπίνα ενός ρόλου από τα φίλτρα {cabins, cabinKind, privateCabin}.
export function cabinOf(filters, role) {
  return filters?.cabins?.[role] || cabinKindFrom(filters?.cabinKind, filters?.privateCabin);
}
