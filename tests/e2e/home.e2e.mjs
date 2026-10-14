// Αρχική (διάταξη ιδιοκτήτη 13/10/2026): τελείες πάνω αριστερά με «Μεταφορά
// σκάφους», γλώσσα και Σύνδεση δεξιά, λογότυπο, σλόγκαν, κουμπί αναζήτησης,
// εμπειρίες, και κάτω η πόρτα για τους επαγγελματίες. Ελληνικά και αγγλικά.
import { chromium } from "playwright";
import http from "node:http";
import { BASE, as, go, text, check, finish, shoot } from "./lib.mjs";

// Στο skipperfinder.gr η αρχική είναι η ρίζα «/» (middleware.js): ίδια κεφαλίδα με το /platform.
const html = await new Promise((resolve, reject) => {
  const u = new URL(BASE + "/");
  http.get({ host: u.hostname, port: u.port, path: "/", headers: { host: "skipperfinder.gr" } }, (res) => {
    let b = "";
    res.on("data", (c) => (b += c));
    res.on("end", () => resolve(b));
  }).on("error", reject);
});
check("skipperfinder.gr/: η νέα αρχική (τελείες, χωρίς λογότυπο στην κεφαλίδα)", html.includes('aria-label="Περισσότερα"') && html.includes("Δημιούργησε προφίλ"));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const locale of ["el", "en"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (locale === "en") await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await go(page, "/platform");
  const L = locale === "el"
    ? { tag: "Οι άνθρωποι πίσω από κάθε ταξίδι.", cta: "Αναζήτηση πληρώματος", other: "Έχεις κάτι άλλο στο μυαλό σου;", exp: "Ανακάλυψε εμπειρίες στη θάλασσα", pro: "Είσαι επαγγελματίας;", create: "Δημιούργησε προφίλ", login: "Σύνδεση", menu: "Περισσότερα", delivery: "Μεταφορά σκάφους", terms: "Όροι χρήσης" }
    : { tag: "The people behind every voyage.", cta: "Find crew", other: "Something else in mind?", exp: "Discover experiences at sea", pro: "Are you a professional?", create: "Create a profile", login: "Login", menu: "More", delivery: "Boat delivery", terms: "Terms of use" };
  const body = await text(page);
  check(`${locale}: όλα τα στοιχεία της αρχικής`, [L.tag, L.cta, L.other, L.exp, L.pro, L.create, L.login, L.terms].every((s) => body.includes(s)), body.slice(0, 300));
  check(`${locale}: χωρίς λογότυπο στην κεφαλίδα (μόνο ένα SkipperFinder)`, (body.match(/SkipperFinder/g) || []).length <= 2);
  const dots = page.getByRole("button", { name: L.menu, exact: true });
  const box = await dots.boundingBox();
  check(`${locale}: τελείες πάνω αριστερά, 44px`, box && box.x < 60 && box.y < 70 && box.width >= 44 && box.height >= 44, JSON.stringify(box));
  await shoot(page, `home-${locale}`);
  await dots.click();
  await page.waitForTimeout(300);
  const items = await page.getByRole("menuitem").allInnerTexts();
  check(`${locale}: το μενού έχει μόνο τη μεταφορά σκάφους`, items.length === 1 && items[0].trim() === L.delivery, items.join("|"));
  await shoot(page, `home-menu-${locale}`);
  await page.getByRole("menuitem").first().click();
  await page.waitForURL(/\/platform\/delivery/, { timeout: 10000 }).catch(() => {});
  check(`${locale}: η μεταφορά σκάφους ανοίγει`, page.url().includes("/platform/delivery"));
  await go(page, "/platform");
  await page.getByRole("link", { name: L.exp, exact: true }).click();
  await page.waitForURL(/experiences/, { timeout: 10000 }).catch(() => {});
  check(`${locale}: οι εμπειρίες ανοίγουν`, page.url().includes("/platform/experiences"));
  await go(page, "/platform");
  await page.getByRole("link", { name: L.create, exact: true }).click();
  await page.waitForURL(/professionals/, { timeout: 10000 }).catch(() => {});
  check(`${locale}: το «Δημιούργησε προφίλ» ανοίγει την εγγραφή επαγγελματία`, page.url().includes("/platform/professionals"));
  await go(page, "/platform");
  await page.getByRole("button", { name: L.cta, exact: true }).click();
  await page.waitForTimeout(800);
  check(`${locale}: η αναζήτηση ξεκινά`, (await page.locator("[data-sf-wizard]").count()) > 0);
  check(`${locale}: χωρίς σφάλματα σελίδας`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}
await browser.close();

await as("6900002002", async (page) => {
  await go(page, "/platform");
  check("συνδεδεμένη: οι τελείες υπάρχουν", await page.getByRole("button", { name: "Περισσότερα", exact: true }).isVisible());
  check("συνδεδεμένη: χωρίς δεύτερη εγγραφή", !(await text(page)).includes("Δημιούργησε προφίλ"));
  await shoot(page, "home-signed-in");
});

finish();
