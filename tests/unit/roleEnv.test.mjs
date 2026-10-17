import { readFileSync } from "node:fs";
import { ROLE_ENV, envFor, ADMIN_GROUPS, ADMIN_SECTION_ICON, ADMIN_TAB_SECTIONS, NAV_TAB_DEFS } from "../../lib/platform/roleEnv.js";
import { ROLE_KEYS } from "../../lib/platform/userRoles.js";

const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
};

ok("κάθε ρόλος έχει δική του ρύθμιση", ROLE_KEYS.every((r) => ROLE_ENV[r]) && ROLE_ENV.guest);
ok("άγνωστος ρόλος → του Πελάτη", envFor("x") === ROLE_ENV.client);
ok("Administrator και Ομάδα: μόνο διαχείριση (χωρίς τελείες, ειδοποιήσεις, μηνύματα, αριστερό μενού)",
  ["admin", "team"].every((r) => !ROLE_ENV[r].apps && !ROLE_ENV[r].bell && !ROLE_ENV[r].messages && !ROLE_ENV[r].sidebar && ROLE_ENV[r].profile === "admin" && ROLE_ENV[r].home === "console"));
ok("Πελάτης και Επαγγελματίας: ειδοποιήσεις και μηνύματα · Εταιρεία και Δημιουργός: όχι (δεν έχουν ακόμη)", ROLE_ENV.client.bell && ROLE_ENV.professional.messages && !ROLE_ENV.company.bell && !ROLE_ENV.creator.messages);
ok("κανένας ρόλος δεν έχει αριστερό μενού", ROLE_KEYS.every((r) => !ROLE_ENV[r].sidebar));
ok("το μενού προφίλ δεν επαναλαμβάνει καρτέλα του ίδιου ρόλου", ROLE_KEYS.every((r) => !ROLE_ENV[r].menu.some((m) => ROLE_ENV[r].tabs.some((t) => t.key === m))));
ok("Administrator: το «Το προφίλ μου» είναι στο μενού προφίλ (δεν υπάρχει καρτέλα Προφίλ)", ROLE_ENV.admin.menu.includes("profile") && !ROLE_ENV.admin.tabs.some((t) => t.key === "profile"));
ok("Administrator: καρτέλες = το μενού της διαχείρισης", ROLE_ENV.admin.tabs.map((t) => t.key).join() === "overview,approvals,users,adminBookings,more" && ROLE_ENV.team.tabs === ROLE_ENV.admin.tabs);
ok("«Αποσύνδεση» δεν είναι γραμμή ρύθμισης (είναι πάντα τελευταία)", ROLE_KEYS.every((r) => !ROLE_ENV[r].menu.includes("logout")));
ok("το προφίλ κάθε ρόλου είναι δικό του", ROLE_ENV.client.profile === "client" && ROLE_ENV.professional.profile === "professional" && ROLE_ENV.company.profile === "stub" && ROLE_ENV.creator.profile === "stub");

// Η οργάνωση της διαχείρισης: κάθε ενότητα της κονσόλας (AdminShell SECTIONS) σε ΕΝΑ σημείο: καρτέλα ή ομάδα του «Περισσότερα».
const shell = readFileSync(new URL("../../app/platform/admin/AdminShell.js", import.meta.url), "utf8");
const sections = [...shell.matchAll(/href: "(\/platform\/admin[^"]*)"/g)].map((m) => m[1]);
const grouped = ADMIN_GROUPS.flatMap((g) => g.sections);
const placed = [...ADMIN_TAB_SECTIONS, ...grouped];
ok("κάθε ενότητα της κονσόλας είναι καρτέλα ή στο «Περισσότερα»", sections.every((h) => placed.includes(h)), sections.filter((h) => !placed.includes(h)).join());
ok("καμία ενότητα σε δύο σημεία", new Set(placed).size === placed.length, placed.join());
ok("τίποτα που δεν υπάρχει στην κονσόλα", placed.every((h) => sections.includes(h)), placed.filter((h) => !sections.includes(h)).join());
ok("οι καρτέλες δείχνουν τις ενότητες-καρτέλες", ROLE_ENV.admin.tabs.filter((t) => t.key !== "more").map((t) => NAV_TAB_DEFS[t.key].href).join() === ADMIN_TAB_SECTIONS.join());
ok("κάθε ενότητα του «Περισσότερα» έχει εικονίδιο", grouped.every((h) => ADMIN_SECTION_ICON[h]));
ok("τέσσερις ομάδες στο «Περισσότερα»: Αιτήματα, Credits, Community, Περιεχόμενο", ADMIN_GROUPS.map((g) => g.key).join() === "requests,credits,community,content");
