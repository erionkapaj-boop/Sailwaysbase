// Μενού εφαρμογών (τελείες πάνω αριστερά, 16/10/2026): πλέγμα 3×2 με σειρά Jobs, Delivery, WindNow / Community, Nearby,
// Explore. Jobs και Delivery ανοίγουν τις υπάρχουσες σελίδες, Nearby τον υπάρχοντα χάρτη (ίδιο σύστημα), τα άλλα τρία
// δείχνουν το όνομα και «Σύντομα». Χωρίς διπλά τετράγωνα για τις ίδιες λειτουργίες. Κινητό και υπολογιστής, EL και EN.
import { chromium } from "playwright";
import { BASE, as, go, text, check, finish, shoot, hydrationOnly } from "./lib.mjs";

const ORDER = ["jobs", "delivery", "windnow", "community", "nearby", "explore"];
const NAMES = ["Jobs", "Delivery", "WindNow", "Community", "Nearby", "Explore"];
const PAGES = { windnow: "WindNow", community: "Community", explore: "Explore" };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const locale of ["el", "en"]) {
  const soon = locale === "el" ? "Σύντομα" : "Coming soon";
  const dotsName = locale === "el" ? "Περισσότερα" : "More";
  for (const [w, h, tag] of [[390, 844, "κινητό"], [1280, 900, "υπολογιστής"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    if (locale === "en") await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => hydrationOnly(e, page, `apps ${locale}`) || errors.push(e.message));
    const label = `${locale}, ${tag}`;
    await go(page, "/platform");
    await page.getByRole("button", { name: dotsName, exact: true }).click();
    await page.waitForTimeout(300);
    const items = page.getByRole("menuitem");
    check(`${label}: έξι τετράγωνα με τη σωστή σειρά`, (await items.allInnerTexts()).map((x) => x.trim()).join("|") === NAMES.join("|"));
    const keys = await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-app")));
    check(`${label}: τα κλειδιά σε σειρά`, keys.join("|") === ORDER.join("|"), keys.join("|"));
    const boxes = await items.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
    const rows = [...new Set(boxes.map((b) => b.y))];
    check(`${label}: πλέγμα 3×2 μέσα στην οθόνη`, rows.length === 2 && boxes.slice(0, 3).every((b) => b.y === rows[0]) && boxes.slice(3).every((b) => b.y === rows[1]) && boxes.every((b) => b.x >= 0 && b.x + b.w <= w && b.w >= 44 && b.h >= 44), JSON.stringify(boxes));
    const body = await text(page);
    check(`${label}: χωρίς τα παλιά τετράγωνα («Μεταφορά σκάφους», «Ανοιχτά αιτήματα»)`, !/Μεταφορά σκάφους|Ανοιχτά αιτήματα|Boat delivery|Open requests/.test(await page.locator("[data-apps-grid]").innerText()));
    if (tag === "κινητό") await shoot(page, `apps-menu-${locale}`);

    // Jobs → ανοιχτά αιτήματα
    await page.locator('[data-app="jobs"]').click();
    await page.waitForURL(/\/platform\/board/, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    check(`${label}: Jobs → η σελίδα ανοιχτών αιτημάτων`, new URL(page.url()).pathname === "/platform/board");
    // Delivery → μεταφορές
    await go(page, "/platform");
    await page.getByRole("button", { name: dotsName, exact: true }).click();
    await page.locator('[data-app="delivery"]').click();
    await page.waitForURL(/\/platform\/delivery/, { timeout: 10000 }).catch(() => {});
    check(`${label}: Delivery → η σελίδα μεταφορών`, new URL(page.url()).pathname === "/platform/delivery");
    // Nearby → ο υπάρχων χάρτης του πίνακα
    await go(page, "/platform");
    await page.getByRole("button", { name: dotsName, exact: true }).click();
    await page.locator('[data-app="nearby"]').click();
    await page.waitForURL(/\/platform\/board/, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    check(`${label}: Nearby → ο χάρτης είναι ανοιχτός (ο υπάρχων, στον πίνακα)`, new URL(page.url()).pathname === "/platform/board" && (await page.locator("[data-board-map]").count()) === 1, page.url());
    if (tag === "κινητό" && locale === "el") await shoot(page, "apps-nearby");
    // Οι τρεις νέες: όνομα + «Σύντομα»
    for (const [key, name] of Object.entries(PAGES)) {
      await go(page, "/platform");
      await page.getByRole("button", { name: dotsName, exact: true }).click();
      await page.locator(`[data-app="${key}"]`).click();
      await page.waitForURL(new RegExp(`/platform/${key}`), { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
      const t = await text(page);
      check(`${label}: ${name} → όνομα και «${soon}»`, new URL(page.url()).pathname === `/platform/${key}` && (await page.locator("h1").innerText()).trim() === name && t.includes(soon), page.url());
      if (tag === "κινητό" && locale === "el" && key === "community") await shoot(page, "apps-soon");
    }
    check(`${label}: χωρίς σφάλματα σελίδας`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
}
await browser.close();

// Συνδεδεμένος: το ίδιο μενού.
await as("6900002002", async (page) => {
  await go(page, "/platform");
  await page.getByRole("button", { name: "Περισσότερα", exact: true }).click();
  await page.waitForTimeout(300);
  check("συνδεδεμένη: ίδιο μενού με έξι εφαρμογές", (await page.getByRole("menuitem").count()) === 6);
  await page.locator('[data-app="community"]').click();
  await page.waitForURL(/\/platform\/community/, { timeout: 10000 }).catch(() => {});
  check("συνδεδεμένη: το Community ανοίγει με «Σύντομα»", (await text(page)).includes("Σύντομα"));
});
finish();
