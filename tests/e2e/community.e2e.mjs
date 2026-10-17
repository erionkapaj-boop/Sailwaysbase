// Community (16-17/10/2026): η διαδρομή /platform/community έχει δύο ενότητες (Χάρτης, Ομάδες). Πρόσβαση μόνο για εγκεκριμένους επαγγελματίες (και τη διαχείριση)· πελάτης και επισκέπτης δεν μπαίνουν.
// Ελληνικά και αγγλικά, κινητό και υπολογιστής.
import { chromium } from "playwright";
import { BASE, as, go, text, check, finish, shoot, hydrationOnly, sql } from "./lib.mjs";

// Η αγγλική συνεδρία γράφει τη γλώσσα στον λογαριασμό· επαναφέρεται ώστε να μη χαλά τα επόμενα τεστ.
const resetLocales = () => sql("select set_config('platform.trusted', 'true', false); update users set locale = 'el' where locale <> 'el';");
resetLocales();

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const locale of ["el", "en"]) {
  const L = locale === "el"
    ? { map: "Χάρτης", groups: "Ομάδες", soon: "Σύντομα", denied: "Για επαγγελματίες της θάλασσας" }
    : { map: "Map", groups: "Groups", soon: "Coming soon", denied: "For maritime professionals" };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (locale === "en") await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => hydrationOnly(e, page, `community ${locale}`) || errors.push(e.message));
  await go(page, "/platform/community");
  await page.waitForTimeout(500);
  check(`${locale}: επισκέπτης → ζητά σύνδεση, όχι περιεχόμενο`, (await page.locator("[data-community-tab]").count()) === 0 && (await page.locator('a[href*="/platform/login"]').count()) > 0);
  check(`${locale}: χωρίς σφάλματα σελίδας`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}
await browser.close();

for (const locale of ["el", "en"]) {
  for (const [w, h, tag] of [[390, 844, "m"], [1280, 900, "d"]]) {
    const L = locale === "el"
      ? { map: "Χάρτης", groups: "Ομάδες", soon: "Σύντομα", denied: "Για επαγγελματίες της θάλασσας" }
      : { map: "Map", groups: "Groups", soon: "Coming soon", denied: "For maritime professionals" };
    await as("6900002002", async (page) => {
      await page.setViewportSize({ width: w, height: h });
      if (locale === "en") await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
      await go(page, "/platform/community");
      await page.waitForTimeout(800);
      const t = await text(page);
      check(`πελάτης ${locale} ${tag}: δεν έχει πρόσβαση`, t.includes(L.denied) && (await page.locator("[data-community-tab]").count()) === 0, t.slice(0, 200));
      if (locale === "el" && tag === "m") await shoot(page, "community-denied");
    });
    await as("6900002003", async (page) => {
      await page.setViewportSize({ width: w, height: h });
      if (locale === "en") await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
      await go(page, "/platform/community");
      await page.waitForTimeout(800);
      check(`επαγγελματίας ${locale} ${tag}: δύο ενότητες, ανοίγει ο Χάρτης`, (await page.locator("[data-community-tab]").count()) === 2 && (await page.locator('[data-community-tab="map"]').getAttribute("aria-selected")) === "true" && (await page.locator("[data-community-map]").count()) === 1);
      await page.locator('[data-community-tab="groups"]').click();
      check(`επαγγελματίας ${locale} ${tag}: μετάβαση στις Ομάδες`, (await page.locator('[data-community-pane="groups"]').count()) === 1 && (await page.locator('[data-community-tab="groups"]').getAttribute("aria-selected")) === "true" && (await page.locator("[data-community-groups]").count()) === 1);
      await shoot(page, `community-${locale}-${tag}`);
    });
  }
}
await as("6900002001", async (page) => {
  await go(page, "/platform/community");
  await page.waitForTimeout(800);
  check("διαχειριστής: έχει πρόσβαση", (await page.locator("[data-community-tab]").count()) === 2);
});
resetLocales();
finish();
