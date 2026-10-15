// Πού θα κοιμάται ο επαγγελματίας: κουκέτα (κοινή καμπίνα), ιδιωτική καμπίνα ή η καμπίνα
// του σκίπερ (η ειδική μικρή καμπίνα πληρώματος του σκάφους, συνήθως στην πλώρη).
// Ρωτιέται ξεχωριστά για κάθε επαγγελματία που ζητά ο πελάτης (skipper, hostess, ...).
// Το πεδίο private_cabin της βάσης μένει boolean: κουκέτα = false, τα άλλα δύο = true.
export const CABIN_KINDS = ["bunk", "private", "skipper"];
// «Δεν ξέρω ακόμα»: υπάρχει μόνο στην οθόνη και στον σύνδεσμο. Στη βάση το αίτημα μένει χωρίς καμπίνα (null)
// και ο επαγγελματίας διαβάζει «Διαμονή: αδιευκρίνιστη».
export const CABIN_UNKNOWN = "unknown";
export const CABIN_CHOICES = [...CABIN_KINDS, CABIN_UNKNOWN];
// Η διαμονή ρωτιέται μόνο σε πολυήμερο ταξίδι· σε ημερήσια εκδρομή (ίδια μέρα) παραλείπεται.
export const isMultiDay = (start, end) => Boolean(start && end && String(end) > String(start));
// Τιμή για τη βάση: μόνο οι τρεις πραγματικές καμπίνες, αλλιώς null.
export const cabinKindForDb = (kind) => (CABIN_KINDS.includes(kind) ? kind : null);

export const isPrivateCabin = (kind) => (CABIN_KINDS.includes(kind) ? kind !== "bunk" : undefined);

// Από το παλιό true/false του URL ή του προσχεδίου.
export function cabinKindFrom(param, privateCabin) {
  if (CABIN_CHOICES.includes(param)) return param;
  if (param === "true" || privateCabin === true) return "private";
  if (param === "false" || privateCabin === false) return "bunk";
  return "";
}

// URL: «skipper:private,hostess:bunk,hostess:private»: μία καταχώριση ΑΝΑ ΘΕΣΗ (ο ίδιος ρόλος πολλές φορές, με τη σειρά
// των θέσεων), ή μία τιμή για όλους (παλιά μορφή: bunk, true, false).
// map = η πρώτη θέση κάθε ρόλου (συμβατότητα)· list = όλες οι θέσεις.
export function parseCabins(param) {
  const map = {};
  const list = {};
  let all = "";
  for (const part of String(param || "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [role, kind] = part.includes(":") ? part.split(":") : ["", part];
    const k = cabinKindFrom(kind, undefined);
    if (!k) continue;
    if (role) {
      (list[role] ||= []).push(k);
      map[role] ??= k;
    } else all = k;
  }
  return { map, list, all };
}

// cabins: { ρόλος: [καμπίνα θέσης 1, θέσης 2, …] } (ή σκέτη τιμή για μία θέση)· counts: { ρόλος: πλήθος θέσεων }.
export function serializeCabins(cabins, roles, counts = {}) {
  const out = [];
  for (const r of roles) {
    const v = cabins?.[r];
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    for (let i = 0; i < (counts[r] || 1); i++) if (CABIN_CHOICES.includes(arr[i])) out.push(`${r}:${arr[i]}`);
  }
  return out.join(",");
}

// Θέσεις ανά ρόλο στον σύνδεσμο: «hostess:2,cook:3» (όπου λείπει ρόλος, μία θέση).
export const MAX_POSITIONS = 8;
export function parsePositions(param) {
  const out = {};
  for (const part of String(param || "").split(",")) {
    const [role, n] = part.trim().split(":");
    const v = Math.floor(Number(n));
    if (role && v >= 1) out[role] = Math.min(v, MAX_POSITIONS);
  }
  return out;
}
export const serializePositions = (counts, roles) => roles.filter((r) => (counts?.[r] || 1) > 1).map((r) => `${r}:${counts[r]}`).join(",");

// Η καμπίνα της θέσης i ενός ρόλου από τα φίλτρα {cabins, cabinKind, privateCabin}. Σκέτη τιμή (παλιά μορφή)
// ισχύει για όλες τις θέσεις· λίστα, ανά θέση.
export function cabinAt(filters, role, i = 0) {
  const v = filters?.cabins?.[role];
  if (Array.isArray(v)) return v[i] || "";
  return v || cabinKindFrom(filters?.cabinKind, filters?.privateCabin);
}
export const cabinOf = (filters, role) => cabinAt(filters, role, 0);
export const cabinsFilled = (filters, role, n = 1) => Array.from({ length: n }, (_, i) => cabinAt(filters, role, i)).every(Boolean);
