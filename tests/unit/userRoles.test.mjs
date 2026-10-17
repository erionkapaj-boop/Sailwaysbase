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
