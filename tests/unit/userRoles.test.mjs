import { ROLE_KEYS, ROLE_COLORS, roleColor, normalizeRoles, activeRoles } from "../../lib/platform/userRoles.js";

const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
};

ok("έξι ρόλοι", ROLE_KEYS.join() === "client,professional,company,creator,team,admin");
ok("χρώμα για κάθε ρόλο, όλα διαφορετικά", ROLE_KEYS.every((k) => ROLE_COLORS[k]?.bg && ROLE_COLORS[k]?.fg && ROLE_COLORS[k]?.solid) && new Set(ROLE_KEYS.map((k) => ROLE_COLORS[k].solid)).size === 6);
ok("άγνωστος ρόλος → χρώμα Πελάτη", roleColor("x") === ROLE_COLORS.client);

const m = normalizeRoles({ active_role: "professional", roles: [{ role: "professional", status: "active" }, { role: "client", status: "active" }, { role: "company", status: "pending" }] });
ok("σειρά και τρέχων ρόλος", m.active === "professional" && m.roles.map((r) => r.role).join() === "client,professional,company");
ok("ενεργοί ρόλοι", activeRoles(m).join() === "client,professional");
ok("τρέχων ρόλος σε έλεγχο → Πελάτης", normalizeRoles({ active_role: "company", roles: [{ role: "company", status: "pending" }] }).active === "client");
ok("κενή απάντηση → μόνο Πελάτης", normalizeRoles(null).roles.length === 1 && normalizeRoles(null).active === "client");
ok("άγνωστα φιλτράρονται", normalizeRoles({ roles: [{ role: "boss", status: "active" }] }).roles.length === 1);

import { roleRows, rowAction, registerPath, PUBLIC_ROLES } from "../../lib/platform/userRoles.js";
const model = normalizeRoles({ active_role: "client", roles: [{ role: "client", status: "active" }, { role: "professional", status: "active" }, { role: "company", status: "pending" }] });
const rows = roleRows(model);
ok("οθόνη ρόλων: μόνο οι τέσσερις δημόσιοι σε απλό χρήστη", rows.map((r) => r.role).join() === PUBLIC_ROLES.join());
ok("οθόνη ρόλων: τρέχων με τικ, ο άλλος ενεργός επιλέγεται", rowAction(rows[0]) === "none" && rows[0].current && rowAction(rows[1]) === "select");
ok("οθόνη ρόλων: σε έλεγχο δεν επιλέγεται", rowAction(rows[2]) === "none" && rows[2].status === "pending");
ok("οθόνη ρόλων: ρόλος που δεν έχει → εγγραφή", rowAction(rows[3]) === "register" && rows[3].status === null);
ok("εγγραφή: επαγγελματίας → φόρμα επαγγελματία, άλλοι → «Σύντομα»", registerPath("professional") === "/platform/profile?become=professional" && registerPath("creator") === "/platform/roles/soon?role=creator");
const adminModel = normalizeRoles({ active_role: "admin", roles: [{ role: "client", status: "active" }, { role: "admin", status: "active" }] });
const ar = roleRows(adminModel);
ok("Ομάδα και Administrator μόνο σε εσωτερικούς", ar.map((r) => r.role).join() === "client,professional,company,creator,team,admin" && !rows.some((r) => r.internal));
ok("εσωτερικός ρόλος που δεν έχει: κλειδωμένος, χωρίς ενέργεια", rowAction(ar.find((r) => r.role === "team")) === "none" && rowAction(ar.find((r) => r.role === "admin")) === "none" && ar.find((r) => r.role === "admin").current);
