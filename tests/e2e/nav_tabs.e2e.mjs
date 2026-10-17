// Κάτω μπάρα (κινητό) και πάνω καρτέλες (υπολογιστής): τα ΔΙΚΑ ΜΟΥ πράγματα στον τρέχοντα ρόλο (βήμα 4). Αλλάζει αμέσως με τον ρόλο.
import { chromium } from "playwright";
import { as, go, check, finish, shoot, sql, BASE, eventually } from "./lib.mjs";

const CLIENT = "6900002002"; // Μαρία Πελάτη
const SKIPPER = "6900002003"; // Νίκος Αρχικός: Πελάτης + Επαγγελματίας
const ADMIN = "6900002001";
const STAFF = "6900002008"; // Σοφία: θα γίνει Ομάδα
const uid = (phone) => sql(`select id from users where phone_number = '+30${phone}'`);
const setActive = (phone, role) => sql(`update users set active_role = '${role}' where phone_number = '+30${phone}'`);
const reset = () => {
  sql("delete from user_roles where role in ('company', 'creator')");
  sql(`update users set is_staff_admin = false where phone_number = '+30${STAFF}'`);
  sql("update users set active_role = 'client', locale = 'el'");
};
reset();

const bar = (page) => page.evaluate(() => ({
  shown: (() => { const n = document.querySelector("nav.sf-bnav"); return Boolean(n) && getComputedStyle(n).display !== "none"; })(),
  tabs: [...document.querySelectorAll("nav.sf-bnav [data-bnav-tab]")].map((a) => a.dataset.bnavTab),
  labels: [...document.querySelectorAll("nav.sf-bnav [data-bnav-tab]")].map((a) => a.innerText.trim()),
  active: [...document.querySelectorAll("nav.sf-bnav [aria-current]")].map((a) => a.dataset.bnavTab),
  role: document.querySelector("nav.sf-bnav")?.dataset.bnavRole,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  minH: Math.min(...[...document.querySelectorAll("nav.sf-bnav [data-bnav-tab]")].map((a) => a.getBoundingClientRect().height)),
}));
const top = (page) => page.evaluate(() => ({
  shown: (() => { const n = document.querySelector("nav.sf-toptabs"); return Boolean(n) && getComputedStyle(n).display !== "none"; })(),
  tabs: [...document.querySelectorAll("nav.sf-toptabs [data-toptab]")].map((a) => a.dataset.toptab),
  active: [...document.querySelectorAll("nav.sf-toptabs [aria-current]")].map((a) => a.dataset.toptab),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));

const CASES = [
  { who: "πελάτης", phone: CLIENT, role: "client", tabs: "home,requests,profile", labels: "Αρχική,Αιτήματα,Προφίλ" },
  { who: "επαγγελματίας", phone: SKIPPER, role: "professional", tabs: "home,requests,calendar,profile", labels: "Αρχική,Αιτήματα,Ημερολόγιο,Προφίλ" },
  { who: "εταιρεία (χωρίς σελίδα σκαφών: κρύβεται)", phone: CLIENT, role: "company", tabs: "home,profile", labels: "Αρχική,Προφίλ", prep: () => sql(`insert into user_roles (user_id, role, status) values ('${uid(CLIENT)}', 'company', 'active')`) },
  { who: "δημιουργός", phone: CLIENT, role: "creator", tabs: "home,experiences,profile", labels: "Αρχική,Εμπειρίες,Προφίλ", prep: () => sql(`insert into user_roles (user_id, role, status) values ('${uid(CLIENT)}', 'creator', 'active')`) },
  { who: "Ομάδα", phone: STAFF, role: "team", tabs: "home,admin,profile", labels: "Αρχική,Διαχείριση,Προφίλ", prep: () => sql(`update users set is_staff_admin = true where phone_number = '+30${STAFF}'`) },
  { who: "Administrator", phone: ADMIN, role: "admin", tabs: "home,admin,profile", labels: "Αρχική,Διαχείριση,Προφίλ" },
];

try {
  for (const c of CASES) {
    for (const vw of [390, 1280]) {
      await as(c.phone, async (page) => {
        await page.setViewportSize({ width: vw, height: vw === 390 ? 844 : 900 });
        c.prep?.();
        setActive(c.phone, c.role);
        await go(page, "/platform/profile");
        const tag = `${c.who}, ${vw}`;
        if (vw === 390) {
          await eventually(async () => (await bar(page)).role === c.role);
          const b = await bar(page);
          check(`${tag}: κάτω μπάρα ${c.labels}`, b.shown && b.tabs.join() === c.tabs && b.labels.join() === c.labels, JSON.stringify(b));
          check(`${tag}: η ενεργή καρτέλα (Προφίλ) τονίζεται`, b.active.join() === "profile", JSON.stringify(b.active));
          check(`${tag}: καρτέλες ≥ 44px, χωρίς οριζόντια κύλιση, χωρίς «Κρατήσεις»`, b.minH >= 44 && b.overflow === 0 && !b.labels.includes("Κρατήσεις"), JSON.stringify(b));
          check(`${tag}: δεν υπάρχουν πάνω καρτέλες στο κινητό`, !(await top(page)).shown);
          await shoot(page, `nav-${c.role}-390`);
        } else {
          await eventually(async () => (await top(page)).tabs.length > 0);
          const t = await top(page);
          check(`${tag}: οι ίδιες καρτέλες στην πάνω μπάρα`, t.shown && t.tabs.join() === c.tabs && t.active.join() === "profile", JSON.stringify(t));
          check(`${tag}: χωρίς κάτω μπάρα στον υπολογιστή, χωρίς κύλιση`, !(await bar(page)).shown && t.overflow === 0);
          if (["client", "professional"].includes(c.role)) await shoot(page, `nav-${c.role}-1280`);
        }
        if (c.role === "client" && vw === 390) {
          await go(page, "/platform/requests");
          check(`${tag}: στα Αιτήματα τονίζονται τα Αιτήματα`, (await bar(page)).active.join() === "requests");
        }
      });
      reset();
    }
  }

  // Ο διαχειριστής στην κονσόλα: η μπάρα δεν εμφανίζεται (έχει δικό του μενού).
  await as(ADMIN, async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    setActive(ADMIN, "admin");
    await go(page, "/platform/admin");
    check("κονσόλα διαχείρισης: χωρίς κάτω μπάρα", !(await bar(page)).shown);
  });

  // Αλλαγή ρόλου: η μπάρα αλλάζει αμέσως, χωρίς ανανέωση.
  reset();
  await as(SKIPPER, async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, "/platform/profile");
    await eventually(async () => (await bar(page)).role === "client");
    check("πριν: ρόλος Πελάτης, τρεις καρτέλες", (await bar(page)).tabs.join() === "home,requests,profile");
    await page.locator("[data-profile-menu]").click();
    await page.locator("[data-pm-change-role]").click();
    await page.waitForURL(/\/platform\/roles$/);
    await page.locator('[data-role-row="professional"]').click();
    await page.waitForURL((u) => u.pathname === "/platform/profile", { timeout: 5000 });
    await eventually(async () => (await bar(page)).tabs.length === 4);
    const b = await bar(page);
    check("αμέσως μετά: Επαγγελματίας με Ημερολόγιο, χωρίς ανανέωση", b.role === "professional" && b.tabs.join() === "home,requests,calendar,profile", JSON.stringify(b));
    await shoot(page, "nav-switched-professional");
    await page.locator('[data-bnav-tab="calendar"]').click();
    await page.waitForURL(/\/platform\/availability/);
    await eventually(async () => (await bar(page)).active.join() === "calendar");
    check("Ημερολόγιο → η σελίδα διαθεσιμότητας, τονισμένη", (await bar(page)).active.join() === "calendar");
  });

  // Επισκέπτης: Αρχική, Σύνδεση (στις εσωτερικές σελίδες).
  reset();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await ctx.newPage();
  await go(guest, "/platform/contact");
  const g = await bar(guest);
  check("επισκέπτης: Αρχική, Σύνδεση", g.shown && g.tabs.join() === "home,login" && g.labels.join() === "Αρχική,Σύνδεση", JSON.stringify(g));
  await shoot(guest, "nav-guest-390");
  await browser.close();
} finally {
  reset();
}
finish();
