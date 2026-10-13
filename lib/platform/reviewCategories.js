import { tNow } from "./tNow";

// Οι ετικέτες και οι υποδείξεις διαβάζονται στη γλώσσα της σελίδας (messages,
// namespace «Reviews», messages/*/system.json).
const categories = (role, keys) =>
  keys.map((key) => ({
    key,
    get label() {
      return tNow("Reviews", `${role}.${key}.label`);
    },
    get hint() {
      return tNow("Reviews", `${role}.${key}.hint`);
    },
  }));

// The six axes a client rates a professional on, one set per crew role, in
// one shared place so the review form (collecting them) and every display of
// them (search results, the booking panel) can never drift apart or list
// them in a different order.
//
// Keys stay English (mirrored 1:1 into DB column suffixes rating_<key> /
// rating_avg_<key>) — only the labels/hints are Greek, same convention as
// CREW_ROLES in roles.js. Four keys (cleanliness, professionalism,
// communication, hospitality) are shared columns across roles — same
// underlying rating_<key> field — but each role gets its own label/hint,
// since "Επαγγελματισμός" means something slightly different for someone
// who drives the boat versus someone who works the cabins.
const SKIPPER_CATEGORIES = categories("skipper", ["safety", "seamanship", "professionalism", "cleanliness", "communication", "hospitality"]);

const HOSTESS_CATEGORIES = categories("hostess", ["cleanliness", "cooking", "service", "professionalism", "communication", "hospitality"]);

// The reverse direction: what a professional (skipper or hostess — the set
// is the same regardless of which) rates a client on. Same mechanism, own
// columns entirely (rating_boat_respect etc.) — none of these overlap in
// meaning with any professional-side category, so none of them share a
// column the way hostess borrows four of skipper's.
const CLIENT_CATEGORIES = categories("client", ["boat_respect", "responsibility", "cooperation", "consistency", "conduct", "tidiness"]);

// Almost entirely its own axes — a cook mostly works out of sight in the
// galley, so the guest-facing categories skipper/hostess share
// (professionalism, communication, hospitality) don't apply the same way.
// Only "cleanliness" is shared (kitchen hygiene is the same underlying
// column as boat/common-area tidiness); the other five are food/kitchen
// specific and don't correspond to anything skipper or hostess already have.
const COOK_CATEGORIES = categories("cook", ["taste", "variety", "presentation", "adaptability", "organization", "cleanliness"]);

// Three of six reuse a skipper column outright (same label, same general
// idea applied to deck work instead of command): seamanship, safety,
// cleanliness. The other three are new — "teamwork" here means cooperating
// with the skipper/crew, a different thing from the client's own
// "cooperation" column (how cooperative the client was), so it stays its
// own column rather than reusing that one.
const DECKHAND_CATEGORIES = categories("deckhand", ["seamanship", "safety", "maintenance", "cleanliness", "teamwork", "diligence"]);

const BY_ROLE = {
  skipper: SKIPPER_CATEGORIES,
  hostess: HOSTESS_CATEGORIES,
  cook: COOK_CATEGORIES,
  deckhand: DECKHAND_CATEGORIES,
  client: CLIENT_CATEGORIES,
};

// Kept for existing callers that haven't been made role-aware yet — same
// list as before (skipper's), never used for a hostess review or display.
export const REVIEW_CATEGORIES = SKIPPER_CATEGORIES;

export function reviewCategoriesForRole(crewRole) {
  return BY_ROLE[crewRole] || SKIPPER_CATEGORIES;
}
