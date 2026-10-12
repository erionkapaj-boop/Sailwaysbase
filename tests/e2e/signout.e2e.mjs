// Αποσύνδεση: μετά από αυτήν δεν μένει τίποτα από τη σελίδα του συνδεδεμένου
// (μενού, εκκρεμότητες διαχειριστή), ούτε όταν το δίκτυο αποτύχει, ούτε όταν
// η αποσύνδεση γίνεται σε άλλη καρτέλα.
import { as, go, text, check, finish, BASE, shoot } from "./lib.mjs";

const ADMIN = "6900002001";
const hasToken = (page) => page.evaluate(() => Object.keys(localStorage).some((k) => k.includes("auth-token")));

// Σε στενή οθόνη η αποσύνδεση είναι στο συρτάρι των τριών γραμμών, σε πλατιά στο μόνιμο μενού αριστερά.
async function openMenuAndSignOut(page) {
  const burger = page.getByRole("button", { name: "Μενού", exact: true });
  if (await burger.isVisible()) await burger.click();
  await page.getByRole("button", { name: "Αποσύνδεση" }).click();
}

// 1. Κανονική αποσύνδεση από την κονσόλα διαχείρισης.
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin");
  check("συνδεδεμένος διαχειριστής: φαίνεται η κονσόλα και το μενού", (await text(page)).includes("Καλησπέρα") && (await page.locator("aside.sf-sidenav").isVisible()));
  await openMenuAndSignOut(page);
  await page.waitForURL((u) => u.pathname === "/platform");
  await page.waitForLoadState("networkidle");
  const t = await text(page);
  check("μετά την αποσύνδεση: πάει στην αρχική, με κεφαλίδα επισκέπτη", (await page.getByRole("link", { name: "Σύνδεση" }).count()) >= 1);
  check("δεν μένει το μενού διαχείρισης", (await page.locator("aside.sf-sidenav").count()) === 0 && !t.includes("Εκκρεμότητες"), t.slice(0, 200));
  check("η σύνδεση σβήστηκε από τον browser", !(await hasToken(page)));
  await page.goto(`${BASE}/platform/admin`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  check("η κονσόλα ζητά σύνδεση", (await text(page)).includes("Χρειάζεται σύνδεση"));
});

// 2. Η κλήση προς τον διακομιστή αποτυγχάνει (κακό δίκτυο στο κινητό): πάλι βγαίνει.
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin");
  await page.route(/\/auth\/v1\/logout/, (r) => r.abort("internetdisconnected"));
  await openMenuAndSignOut(page);
  await page.waitForURL((u) => u.pathname === "/platform");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  check("χωρίς δίκτυο: βγαίνει πάλι, δεν μένει συνδεδεμένος", !(await hasToken(page)) && (await page.getByRole("link", { name: "Σύνδεση" }).count()) >= 1);
});

// 3. Αποσύνδεση σε άλλη καρτέλα: η πρώτη δεν μένει με στοιχεία συνδεδεμένου.
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin");
  const other = await page.context().newPage();
  await other.goto(`${BASE}/platform/admin`);
  await other.waitForLoadState("networkidle");
  await other.waitForTimeout(1200);
  await openMenuAndSignOut(other);
  await other.waitForURL((u) => u.pathname === "/platform");
  await page.waitForURL((u) => u.pathname.startsWith("/platform/login"), { timeout: 15000 });
  check("αποσύνδεση σε άλλη καρτέλα: η πρώτη πάει στη σύνδεση", true);
});

finish();
