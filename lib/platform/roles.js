// Crew roles a client can search for.
//
// Only `skipper` is backed by the database today — skipper_profiles is the
// single professional table, and the search RPC knows nothing about roles.
// The other three are carried through the UI and the query string so the
// home form works as specified, but they return nothing until the schema
// gains a real role concept (deliberately deferred to its own step).
export const CREW_ROLES = [
  { key: "skipper", label: "Skipper", supported: true },
  { key: "hostess", label: "Hostess", supported: false },
  { key: "cook", label: "Μάγειρας", supported: false },
  { key: "deckhand", label: "Ναύτης", supported: false },
];

export const SUPPORTED_ROLES = CREW_ROLES.filter((r) => r.supported).map((r) => r.key);

export function labelForRole(key) {
  return CREW_ROLES.find((r) => r.key === key)?.label || key;
}
