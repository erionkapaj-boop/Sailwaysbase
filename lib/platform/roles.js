// Crew roles a client can search for.
//
// Order is fixed and meaningful (landing brief §2) — it is the priority order
// and must be used identically everywhere: role pickers, filters, listings,
// and any future enum in the data model. Keys stay English in code even where
// the Greek UI label differs (e.g. deckhand → "Ναύτης").
//
// All four crew roles are now backed by real data — all live in
// skipper_profiles, distinguished by `role`, all searchable and bookable.
// blurb: one quiet line for anyone who doesn't already know these titles
// apart (hostess vs. cook, say) — shown small and muted under the label
// wherever a client is picking a role, never as a heading of its own.
export const CREW_ROLES = [
  { key: "skipper", label: "Skipper", blurb: "Οδηγεί και έχει την ευθύνη του σκάφους", supported: true },
  { key: "hostess", label: "Hostess", blurb: "Φροντίζει τους επιβάτες και το σκάφος εν πλω", supported: true },
  { key: "cook", label: "Cook", blurb: "Ετοιμάζει τα γεύματα του ταξιδιού", supported: true },
  { key: "deckhand", label: "Ναύτης", blurb: "Βοηθός σε ελλιμενισμό και εργασίες καταστρώματος", supported: true },
];

export const SUPPORTED_ROLES = CREW_ROLES.filter((r) => r.supported).map((r) => r.key);

export function labelForRole(key) {
  return CREW_ROLES.find((r) => r.key === key)?.label || key;
}

// Highlights shown on a profile, derived entirely from data the professional
// has already entered or earned. Nothing here is free text or self-selected,
// so there is no route for contact details to reach an anonymous profile —
// which is why the old bio tags were removed rather than restyled.
//
// Deliberately computed on the fly instead of stored: a highlight is a view
// of the underlying fields, and a stored copy would drift the moment one of
// them changed.
export function computeCrewHighlights(profile, { languageCount = 0 } = {}) {
  if (!profile) return [];
  const out = [];

  if (languageCount >= 2) out.push(`Μιλά ${languageCount} γλώσσες`);

  // Reliability, completed trips and region expertise belong here too, but
  // only once there are real bookings behind them — showing "100% αξιοπιστία"
  // to someone with zero trips would be worse than showing nothing.
  return out;
}
