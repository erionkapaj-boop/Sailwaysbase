// Ο Administrator βλέπει ΜΟΝΟ ό,τι αφορά διαχείριση (lib/platform/roleEnv.js): χωρίς αριστερό μενού, χωρίς συρτάρι, χωρίς τελείες των
// κοινών εφαρμογών, χωρίς ειδοποιήσεις/μηνύματα πελάτη, χωρίς σελίδες πελάτη ή επαγγελματία. Καρτέλες: Αρχική (η Επισκόπηση) και Προφίλ
// (η οργανωμένη διαχείριση, κάθε ενότητα σε ΜΙΑ ομάδα). Υπολογιστής και κινητό.
import { as, go, check, finish, shoot, resetRoles, eventually } from "./lib.mjs";

const ADMIN = "6900002001";
const EXPECT = ["approvals", "users", "board", "bookings", "replacements", "offers", "deliveries", "disputes", "finance", "community", "messages", "map", "health", "settings"];
const GROUPS = { people: 2, requests: 6, credits: 1, community: 2, content: 3 };
resetRoles();

const hub = (page) => page.evaluate(() => ({
  sections: [...document.querySelectorAll("[data-admin-section]")].map((a) => a.dataset.adminSection),
  groups: Object.fromEntries([...document.querySelectorAll("[data-admin-group]")].map((g) => [g.dataset.adminGroup, g.querySelectorAll("[data-admin-section]").length])),
  identity: Boolean(document.querySelector("[data-admin-identity]")),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  minRow: Math.min(...[...document.querySelectorAll("[data-admin-section]")].map((a) => a.getBoundingClientRect().height)),
}));
const header = (page) => page.evaluate(() => ({
  sidebar: document.querySelectorAll("aside.sf-sidenav").length,
  burger: [...document.querySelectorAll("button[aria-label]")].filter((b) => /^(Μενού|Menu)$/.test(b.getAttribute("aria-label"))).length,
  dots: [...document.querySelectorAll("button[aria-label]")].filter((b) => /^(Περισσότερα|More)$/.test(b.getAttribute("aria-label"))).length,
  bell: [...document.querySelectorAll("[data-sf-header] button[aria-label]")].filter((b) => /Ειδοποι|Notifications/.test(b.getAttribute("aria-label"))).length,
  messages: [...document.querySelectorAll("[data-sf-header] button[aria-label]")].filter((b) => /Μηνύματα|Messages/.test(b.getAttribute("aria-label"))).length,
  topTabs: [...document.querySelectorAll("nav.sf-toptabs [data-toptab]")].map((a) => a.dataset.toptab),
  barTabs: [...document.querySelectorAll("nav.sf-bnav [data-bnav-tab]")].map((a) => a.dataset.bnavTab),
  barShown: (() => { const n = document.querySelector("nav.sf-bnav"); return Boolean(n) && getComputedStyle(n).display !== "none"; })(),
  topShown: (() => { const n = document.querySelector("nav.sf-toptabs"); return Boolean(n) && getComputedStyle(n).display !== "none"; })(),
  activeTop: [...document.querySelectorAll("nav.sf-toptabs [aria-current]")].map((a) => a.dataset.toptab),
  activeBar: [...document.querySelectorAll("nav.sf-bnav [aria-current]")].map((a) => a.dataset.bnavTab),
}));

await as(ADMIN, async (page) => {
  // ---- Υπολογιστής ----
  await page.setViewportSize({ width: 1280, height: 900 });
  await go(page, "/platform");
  await page.waitForURL(/\/platform\/admin$/);
  check("η Αρχική του Administrator είναι η Επισκόπηση της διαχείρισης", /Καλημέρα|Καλησπέρα/.test(await page.innerText("body")));
  let h = await header(page);
  check("χωρίς αριστερό μενού και χωρίς τα τρία γραμμάκια", h.sidebar === 0 && h.burger === 0, JSON.stringify(h));
  check("χωρίς τελείες κοινών εφαρμογών, ειδοποιήσεις και μηνύματα πελάτη", h.dots === 0 && h.bell === 0 && h.messages === 0, JSON.stringify(h));
  check("πάνω καρτέλες: Αρχική, Προφίλ (τίποτα από πελάτη/επαγγελματία)", h.topShown && h.topTabs.join() === "home,profile" && h.activeTop.join() === "home", JSON.stringify(h));
  check("χωρίς κάτω μπάρα στον υπολογιστή", !h.barShown);
  const t = await page.innerText("body");
  check("τίποτα του πελάτη στην Επισκόπηση", !t.includes("Πού θα ταξιδέψεις;") && !t.includes("Ο λογαριασμός μου"));
  await shoot(page, "admin-env-home");

  // Προφίλ = οργανωμένη διαχείριση.
  await page.locator('[data-toptab="profile"]').click();
  await page.waitForURL(/\/platform\/profile$/);
  await page.locator("[data-admin-groups]").waitFor();
  await eventually(async () => (await hub(page)).sections.length === EXPECT.length);
  const g = await hub(page);
  check("προφίλ: κάρτα ταυτότητας (όνομα, ρόλος) και ομάδες", g.identity && Object.keys(g.groups).join() === Object.keys(GROUPS).join(), JSON.stringify(g.groups));
  check("κάθε ενότητα της διαχείρισης υπάρχει, και ΜΙΑ φορά μόνο", [...g.sections].sort().join() === [...EXPECT].sort().join() && new Set(g.sections).size === g.sections.length, g.sections.join());
  check("ομάδες: Χρήστες και ρόλοι 2 · Αιτήματα και κρατήσεις 6 · Credits 1 · Community 2 · Περιεχόμενο 3", JSON.stringify(g.groups) === JSON.stringify(GROUPS), JSON.stringify(g.groups));
  check("γραμμές ≥ 44px, χωρίς οριζόντια κύλιση", g.minRow >= 44 && g.overflow === 0, JSON.stringify(g));
  // textContent, όχι innerText: οι τίτλοι εμφανίζονται με κεφαλαία από το CSS (και τα ελληνικά κεφαλαία χάνουν τόνους).
  const names = await page.locator("[data-admin-group] h2").evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check("ονόματα ομάδων", names.join("|") === "Χρήστες και ρόλοι|Αιτήματα και κρατήσεις|Credits και πακέτα|Community και moderation|Περιεχόμενο και ρυθμίσεις", names.join("|"));
  h = await header(page);
  check("στο προφίλ τονίζεται η καρτέλα Προφίλ", h.activeTop.join() === "profile", JSON.stringify(h));
  check("το προφίλ δεν δείχνει τίποτα πελάτη/επαγγελματία", !(await page.innerText("body")).includes("Ως επαγγελματίας") && !(await page.innerText("body")).includes("Διαθεσιμότητα"));
  await shoot(page, "admin-env-profile");

  // Μια ενότητα: ανοίγει, και το Προφίλ μένει τονισμένο.
  await page.locator('[data-admin-section="users"]').click();
  await page.waitForURL(/\/platform\/admin\/users/);
  await page.waitForLoadState("networkidle");
  h = await header(page);
  check("σε σελίδα διαχείρισης: Προφίλ τονισμένο, ούτε αριστερό μενού ούτε συρτάρι", h.activeTop.join() === "profile" && h.sidebar === 0 && h.burger === 0, JSON.stringify(h));
  await page.locator('[data-toptab="home"]').click();
  await page.waitForURL(/\/platform\/admin$/);
  check("η Αρχική γυρίζει στην Επισκόπηση", (await header(page)).activeTop.join() === "home");

  // ---- Κινητό ----
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/platform/profile");
  await page.locator("[data-admin-groups]").waitFor();
  h = await header(page);
  check("κινητό: κάτω μπάρα Αρχική, Προφίλ, χωρίς πάνω καρτέλες, χωρίς συρτάρι", h.barShown && h.barTabs.join() === "home,profile" && !h.topShown && h.sidebar === 0 && h.burger === 0 && h.dots === 0, JSON.stringify(h));
  const m = await hub(page);
  check("κινητό: όλες οι ενότητες μία φορά, χωρίς οριζόντια κύλιση", [...m.sections].sort().join() === [...EXPECT].sort().join() && m.overflow === 0 && m.minRow >= 44, JSON.stringify(m));
  await shoot(page, "admin-env-profile-390");
  await go(page, "/platform/admin/users");
  h = await header(page);
  check("κινητό: και μέσα στη διαχείριση φαίνεται η κάτω μπάρα, με τονισμένο το Προφίλ", h.barShown && h.activeBar.join() === "profile", JSON.stringify(h));
  await go(page, "/platform/admin");
  check("κινητό: στην Επισκόπηση τονίζεται η Αρχική", (await header(page)).activeBar.join() === "home");
  await shoot(page, "admin-env-home-390");
});
resetRoles();
finish();
