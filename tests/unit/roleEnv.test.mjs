import { readFileSync } from "node:fs";
import { ROLE_ENV, envFor, ADMIN_GROUPS, ADMIN_SECTION_ICON } from "../../lib/platform/roleEnv.js";
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
ok("το μενού προφίλ δεν επαναλαμβάνει καρτέλες (προφίλ, αιτήματα, διαθεσιμότητα)", ROLE_KEYS.every((r) => !ROLE_ENV[r].menu.some((m) => ["profile", "requests", "availability"].includes(m))));
ok("«Αποσύνδεση» δεν είναι γραμμή ρύθμισης (είναι πάντα τελευταία)", ROLE_KEYS.every((r) => !ROLE_ENV[r].menu.includes("logout")));
ok("το προφίλ κάθε ρόλου είναι δικό του", ROLE_ENV.client.profile === "client" && ROLE_ENV.professional.profile === "professional" && ROLE_ENV.company.profile === "stub" && ROLE_ENV.creator.profile === "stub");

// Η οργάνωση της διαχείρισης: κάθε ενότητα της κονσόλας (AdminShell SECTIONS) σε ΜΙΑ ομάδα, εκτός από την Επισκόπηση (Αρχική).
const shell = readFileSync(new URL("../../app/platform/admin/AdminShell.js", import.meta.url), "utf8");
const sections = [...shell.matchAll(/href: "(\/platform\/admin[^"]*)"/g)].map((m) => m[1]).filter((h) => h !== "/platform/admin");
const grouped = ADMIN_GROUPS.flatMap((g) => g.sections);
ok("όλες οι ενότητες της κονσόλας βρίσκονται σε ομάδα", sections.every((h) => grouped.includes(h)), sections.filter((h) => !grouped.includes(h)).join());
ok("καμία ενότητα δεν υπάρχει σε δύο ομάδες", new Set(grouped).size === grouped.length, grouped.join());
ok("οι ομάδες δεν έχουν ενότητα που δεν υπάρχει", grouped.every((h) => sections.includes(h)), grouped.filter((h) => !sections.includes(h)).join());
ok("κάθε ενότητα έχει εικονίδιο", grouped.every((h) => ADMIN_SECTION_ICON[h]));
ok("πέντε ομάδες: Χρήστες, Αιτήματα, Credits, Community, Περιεχόμενο", ADMIN_GROUPS.map((g) => g.key).join() === "people,requests,credits,community,content");
