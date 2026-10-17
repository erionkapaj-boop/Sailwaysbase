// Μοντέλο ρόλων: ένας χρήστης = ένας λογαριασμός με πολλούς ρόλους (docs/ROLES.md, 0139).
// Εδώ ορίζονται ΜΟΝΟ τα κλειδιά, η σειρά και τα χρώματα κάθε ρόλου — σε ένα σημείο, ώστε οι οθόνες των επόμενων
// βημάτων να τα διαβάζουν από εδώ και να μη ξαναορίζουν χρώματα. Τα ονόματα των ρόλων είναι κείμενα (messages/*/roles.json).

export const ROLE_KEYS = ["client", "professional", "company", "creator", "team", "admin"];
export const ROLE_STATUSES = ["active", "pending", "rejected"];

// bg: απαλό φόντο (σήμα, κάρτα) · fg: κείμενο πάνω στο bg · solid: έντονο (κουκκίδα, περίγραμμα, ενεργό στοιχείο)
export const ROLE_COLORS = {
  client: { bg: "#E6EEF7", fg: "#27496D", solid: "#6F9BC8" }, // απαλό μπλε
  professional: { bg: "#F3EBDA", fg: "#6E5628", solid: "#C3A164" }, // άμμος
  company: { bg: "#E4F0E8", fg: "#2F6B54", solid: "#6FAE8C" }, // απαλό πράσινο
  creator: { bg: "#ECE6F5", fg: "#53407A", solid: "#9C86C8" }, // απαλό μωβ
  team: { bg: "#E6EAEF", fg: "#3F4F61", solid: "#7F90A3" }, // γκρι-μπλε
  admin: { bg: "#F7E5E2", fg: "#8A2F25", solid: "#D2776C" }, // απαλό κόκκινο
};

export function roleColor(role) {
  return ROLE_COLORS[role] || ROLE_COLORS.client;
}

// Εσωτερικοί ρόλοι: δεν ζητούνται από τον χρήστη.
export const INTERNAL_ROLES = ["team", "admin"];
// Ρόλοι που ο χρήστης μπορεί να ζητήσει με αίτηση (request_role). Ο Επαγγελματίας ζητείται με το προφίλ επαγγελματία.
export const REQUESTABLE_ROLES = ["company", "creator"];

// Απάντηση get_my_roles() → { active: κλειδί, roles: [{ role, status }] }. Πάντα υπάρχει Πελάτης· ο τρέχων είναι πάντα ενεργός.
export function normalizeRoles(raw) {
  const roles = (raw?.roles || [])
    .filter((r) => ROLE_KEYS.includes(r.role) && ROLE_STATUSES.includes(r.status))
    .sort((a, b) => ROLE_KEYS.indexOf(a.role) - ROLE_KEYS.indexOf(b.role));
  if (!roles.some((r) => r.role === "client")) roles.unshift({ role: "client", status: "active" });
  const activeOk = roles.some((r) => r.role === raw?.active_role && r.status === "active");
  return { active: activeOk ? raw.active_role : "client", roles };
}

export function activeRoles(model) {
  return model.roles.filter((r) => r.status === "active").map((r) => r.role);
}

// ---- Οθόνη «Οι ρόλοι μου» (βήμα 3) -------------------------------------------------------------------------------------------

// Εικονίδιο κάθε ρόλου (ένα σετ, components/Icon.js).
export const ROLE_ICON = { client: "user", professional: "helm", company: "boat", creator: "compass", team: "users", admin: "shield" };

// Ρόλοι που βλέπει κάθε χρήστης στη λίστα, με τη σειρά τους. Ομάδα και Administrator μόνο σε εσωτερικούς (ενεργός Administrator ή Ομάδα).
export const PUBLIC_ROLES = ["client", "professional", "company", "creator"];

// Η αλλαγή τρέχοντος ρόλου ενημερώνει το avatar της κεφαλίδας χωρίς ανανέωση σελίδας.
export const ROLES_CHANGED_EVENT = "sf:roles-changed";

// Πού οδηγεί η εγγραφή ρόλου που ο χρήστης δεν έχει. Επαγγελματίας: η υπάρχουσα φόρμα εγγραφής επαγγελματίας (στο προφίλ).
// Όπου δεν υπάρχει ακόμη εγγραφή: οθόνη «Σύντομα».
export function registerPath(role) {
  if (role === "professional") return "/platform/profile?become=professional";
  return `/platform/roles/soon?role=${role}`;
}

// Οι γραμμές της οθόνης: { role, status (null = δεν τον έχει), current, internal, held }.
export function roleRows(model, { internal = false } = {}) {
  const byRole = Object.fromEntries(model.roles.map((r) => [r.role, r.status]));
  const showInternal = internal || ["admin", "team"].some((k) => byRole[k] === "active");
  const keys = [...PUBLIC_ROLES, ...(showInternal ? INTERNAL_ROLES : [])];
  return keys.map((role) => ({
    role,
    status: byRole[role] || null,
    current: model.active === role,
    internal: INTERNAL_ROLES.includes(role),
  }));
}

// Τι γίνεται με το πάτημα: select (γίνεται τρέχων), register (ξεκινά εγγραφή), none (δεν κάνει τίποτα).
export function rowAction(row) {
  if (row.status === "active") return row.current ? "none" : "select";
  if (row.status === "pending" || row.status === "rejected") return "none";
  return row.internal ? "none" : "register";
}
