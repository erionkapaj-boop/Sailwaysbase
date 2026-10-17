// Το δωμάτιο του Administrator (lib/platform/roleEnv.js): οι καρτέλες ΕΙΝΑΙ το μενού της διαχείρισης — Επισκόπηση, Εκκρεμότητες,
// Χρήστες, Κρατήσεις, Περισσότερα (οι υπόλοιπες ενότητες σε ομάδες). Κάθε ενότητα σε ΕΝΑ σημείο. Χωρίς αριστερό μενού, συρτάρι,
// τελείες, ειδοποιήσεις/μηνύματα πελάτη και χωρίς τίποτα από το προφίλ επαγγελματία· το «Το προφίλ μου» (avatar) έχει μόνο ταυτότητα
// και στοιχεία σύνδεσης. Υπολογιστής και κινητό.
import { as, go, check, finish, shoot, resetRoles, eventually } from "./lib.mjs";

const ADMIN = "6900002001";
const TABS = "overview,approvals,users,adminBookings,more";
const TAB_SECTIONS = ["approvals", "users", "bookings"]; // + η Επισκόπηση
const MORE = { requests: ["board", "replacements", "offers", "deliveries", "disputes"], credits: ["finance"], community: ["community", "messages"], content: ["map", "health", "settings"] };
const MORE_ALL = Object.values(MORE).flat();
resetRoles();

const state = (page) => page.evaluate(() => {
  const shown = (sel) => { const n = document.querySelector(sel); return Boolean(n) && getComputedStyle(n).display !== "none"; };
  const labels = (sel) => [...document.querySelectorAll("button[aria-label]")].filter((b) => sel.test(b.getAttribute("aria-label"))).length;
  return {
    sidebar: document.querySelectorAll("aside.sf-sidenav").length,
    burger: labels(/^(Μενού|Menu)$/),
    dots: labels(/^(Περισσότερα|More)$/),
    bell: [...document.querySelectorAll("[data-sf-header] button[aria-label]")].filter((b) => /Ειδοποι|Notifications/.test(b.getAttribute("aria-label"))).length,
    messages: [...document.querySelectorAll("[data-sf-header] button[aria-label]")].filter((b) => /Μηνύματα|Messages/.test(b.getAttribute("aria-label"))).length,
    topShown: shown("nav.sf-toptabs"),
    top: [...document.querySelectorAll("nav.sf-toptabs [data-toptab]")].map((a) => a.dataset.toptab).join(),
    topActive: [...document.querySelectorAll("nav.sf-toptabs [aria-current]")].map((a) => a.dataset.toptab).join(),
    barShown: shown("nav.sf-bnav"),
    bar: [...document.querySelectorAll("nav.sf-bnav [data-bnav-tab]")].map((a) => a.dataset.bnavTab).join(),
    barActive: [...document.querySelectorAll("nav.sf-bnav [aria-current]")].map((a) => a.dataset.bnavTab).join(),
    barLabels: [...document.querySelectorAll("nav.sf-bnav [data-bnav-tab]")].map((a) => a.innerText.trim()).join(),
    barClipped: [...document.querySelectorAll("nav.sf-bnav [data-bnav-tab] span:last-child")].filter((s) => s.scrollWidth > s.clientWidth + 1 || s.getBoundingClientRect().width > s.parentElement.getBoundingClientRect().width + 1).length,
    groups: Object.fromEntries([...document.querySelectorAll("[data-admin-group]")].map((g) => [g.dataset.adminGroup, [...g.querySelectorAll("[data-admin-section]")].map((a) => a.dataset.adminSection)])),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    minRow: Math.min(...[...document.querySelectorAll("[data-admin-section]")].map((a) => a.getBoundingClientRect().height)),
  };
});

await as(ADMIN, async (page) => {
  // ---- Υπολογιστής ----
  await page.setViewportSize({ width: 1280, height: 900 });
  await go(page, "/platform");
  await page.waitForURL(/\/platform\/admin$/);
  check("η Αρχική του Administrator είναι η Επισκόπηση της διαχείρισης", /Καλημέρα|Καλησπέρα/.test(await page.innerText("body")));
  let s = await state(page);
  check("χωρίς αριστερό μενού, συρτάρι, τελείες, ειδοποιήσεις και μηνύματα πελάτη", s.sidebar === 0 && s.burger === 0 && s.dots === 0 && s.bell === 0 && s.messages === 0, JSON.stringify(s));
  check("πάνω καρτέλες = μενού διαχείρισης: Επισκόπηση, Εκκρεμότητες, Χρήστες, Κρατήσεις, Περισσότερα", s.topShown && s.top === TABS && s.topActive === "overview" && !s.barShown, JSON.stringify(s));
  const top = (await page.locator("nav.sf-toptabs").innerText()).replace(/\s+/g, " ").trim();
  check("οι λέξεις των καρτελών", top === "Επισκόπηση Εκκρεμότητες Χρήστες Κρατήσεις Περισσότερα", top);
  check("τίποτα του πελάτη ή του επαγγελματία στην Επισκόπηση", !(await page.innerText("body")).includes("Πού θα ταξιδέψεις;") && !(await page.innerText("body")).includes("Ο λογαριασμός μου"));
  await shoot(page, "admin-room-overview");

  // Κάθε καρτέλα ανοίγει τη σελίδα της και τονίζεται.
  for (const [tab, url] of [["approvals", /\/platform\/admin\/approvals$/], ["users", /\/platform\/admin\/users$/], ["adminBookings", /\/platform\/admin\/bookings$/], ["more", /\/platform\/admin\/more$/]]) {
    await page.locator(`nav.sf-toptabs [data-toptab="${tab}"]`).click();
    await page.waitForURL(url);
    await page.waitForLoadState("networkidle");
    await eventually(async () => (await state(page)).topActive === tab);
    check(`καρτέλα ${tab}: ανοίγει και τονίζεται`, (await state(page)).topActive === tab);
  }

  // «Περισσότερα»: οι υπόλοιπες ενότητες σε ομάδες, καμία που είναι ήδη καρτέλα, καμία δύο φορές.
  await page.locator("[data-admin-groups]").waitFor();
  await eventually(async () => Object.values((await state(page)).groups).flat().length === MORE_ALL.length);
  s = await state(page);
  const listed = Object.values(s.groups).flat();
  check("Περισσότερα: τέσσερις ομάδες με τις υπόλοιπες ενότητες", JSON.stringify(s.groups) === JSON.stringify(MORE), JSON.stringify(s.groups));
  check("Περισσότερα: καμία ενότητα δύο φορές, καμία που είναι ήδη καρτέλα", new Set(listed).size === listed.length && !listed.some((x) => TAB_SECTIONS.includes(x)), listed.join());
  check("Περισσότερα: γραμμές ≥ 44px, χωρίς οριζόντια κύλιση", s.minRow >= 44 && s.overflow === 0, JSON.stringify(s));
  const names = await page.locator("[data-admin-group] h2").evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check("ονόματα ομάδων", names.join("|") === "Αιτήματα και κρατήσεις|Credits και πακέτα|Community και moderation|Περιεχόμενο και ρυθμίσεις", names.join("|"));
  await shoot(page, "admin-room-more");
  await page.locator('[data-admin-section="health"]').click();
  await page.waitForURL(/\/platform\/admin\/health/);
  await eventually(async () => (await state(page)).topActive === "more");
  check("ενότητα από το «Περισσότερα»: μένει τονισμένο το «Περισσότερα»", (await state(page)).topActive === "more");

  // Το τιμόνι στη μέση γυρίζει στην Επισκόπηση.
  await page.locator("[data-home-link]").click();
  await page.waitForURL(/\/platform\/admin$/);
  check("το τιμόνι οδηγεί στην Επισκόπηση", true);

  // «Το προφίλ μου» (avatar): ταυτότητα και στοιχεία σύνδεσης, τίποτα από το δωμάτιο του επαγγελματία ή της διαχείρισης.
  await page.locator("[data-profile-menu]").click();
  await page.getByRole("menuitem", { name: "Το προφίλ μου" }).click();
  await page.waitForURL(/\/platform\/profile$/);
  await page.locator("[data-admin-identity]").waitFor();
  const p = await page.innerText("body");
  check("προφίλ Administrator: ταυτότητα με τον ρόλο", (await page.locator("[data-admin-identity]").innerText()).includes("Administrator"));
  check("προφίλ Administrator: χωρίς προφίλ επαγγελματία και χωρίς λίστα ενοτήτων", !p.includes("Ως επαγγελματίας") && !p.includes("Τιμή ανά ημέρα") && (await page.locator("[data-admin-groups]").count()) === 0, p.slice(0, 400));
  s = await state(page);
  check("στο προφίλ καμία καρτέλα δεν τονίζεται (δεν είναι ενότητα διαχείρισης)", s.topActive === "" && s.top === TABS, JSON.stringify(s));
  await shoot(page, "admin-room-profile");

  // ---- Κινητό ----
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/platform/admin/users");
  s = await state(page);
  check("κινητό: κάτω μπάρα = μενού διαχείρισης, τονισμένοι οι Χρήστες", s.barShown && s.bar === TABS && s.barActive === "users" && !s.topShown && s.sidebar === 0 && s.burger === 0 && s.dots === 0, JSON.stringify(s));
  check("κινητό: οι λέξεις χωρούν, χωρίς οριζόντια κύλιση", s.barLabels === "Επισκόπηση,Εκκρεμότητες,Χρήστες,Κρατήσεις,Περισσότερα" && s.barClipped === 0 && s.overflow === 0, JSON.stringify(s));
  await shoot(page, "admin-room-users-390");
  await page.locator('nav.sf-bnav [data-bnav-tab="more"]').click();
  await page.waitForURL(/\/platform\/admin\/more$/);
  await page.locator("[data-admin-groups]").waitFor();
  s = await state(page);
  check("κινητό: Περισσότερα σε μία στήλη, χωρίς κύλιση", Object.values(s.groups).flat().length === MORE_ALL.length && s.overflow === 0 && s.minRow >= 44 && s.barActive === "more", JSON.stringify(s));
  await shoot(page, "admin-room-more-390");
  await go(page, "/platform/admin");
  check("κινητό: στην Επισκόπηση τονίζεται η Επισκόπηση", (await state(page)).barActive === "overview");
  await shoot(page, "admin-room-overview-390");
});
resetRoles();
finish();
