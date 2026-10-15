// Πού θα κοιμάται ο επαγγελματίας: κουκέτα (κοινή καμπίνα), ιδιωτική καμπίνα ή η καμπίνα
// του σκίπερ (η ειδική μικρή καμπίνα πληρώματος του σκάφους, συνήθως στην πλώρη).
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
