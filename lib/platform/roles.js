// Crew roles a client can search for.
//
// Order is fixed and meaningful (landing brief §2) — it is the priority order
// and must be used identically everywhere: role pickers, filters, listings,
// and any future enum in the data model. Keys stay English in code even where
// the Greek UI label differs (e.g. deckhand → "Ναύτης").
//
// Only `skipper` is backed by data today: skipper_profiles is the sole
// professional table and the search RPC has no role concept. The other three
// travel through the UI and query string, and the results page says plainly
// that they returned nothing, until the role model lands in its own step.
export const CREW_ROLES = [
  { key: "skipper", label: "Skipper", supported: true },
  { key: "hostess", label: "Hostess", supported: false },
  { key: "cook", label: "Cook", supported: false },
  { key: "deckhand", label: "Ναύτης", supported: false },
];

export const SUPPORTED_ROLES = CREW_ROLES.filter((r) => r.supported).map((r) => r.key);

export function labelForRole(key) {
  return CREW_ROLES.find((r) => r.key === key)?.label || key;
}
