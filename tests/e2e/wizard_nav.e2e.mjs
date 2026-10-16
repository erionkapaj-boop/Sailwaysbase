// Πλοήγηση οδηγού: «πίσω» και «μπροστά» όπως στον browser, τα στοιχεία μένουν,
// η ανανέωση κρατά το ίδιο βήμα, ένδειξη βήματος «Ν / Μ». Ελληνικά και αγγλικά.
import { chromium } from "playwright";
import { BASE, check, finish, pickDay, daysFromToday } from "./lib.mjs";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const locale of ["el", "en"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "sf_locale", value: locale, url: BASE }]);
  const page = await ctx.newPage();
  const start = locale === "el" ? /Πού θα ταξιδέψεις;/ : /Where are you travelling\?/;
  const country = locale === "el" ? /Ελλάδα/ : /Greece/;
  const fwd = page.locator("[data-forward]");
  const cont = () => page.locator(".sf-step-footer button").first().click();
  const counter = async () => (await page.locator("[data-sf-wizard] span").filter({ hasText: /^\d+ \/ \d+$/ }).first().innerText()).trim();
  await page.goto(BASE + "/platform"); await page.waitForTimeout(1500);
  await page.locator("button, a").filter({ hasText: start }).first().click(); await page.waitForTimeout(500);
  check(`${locale}: ένδειξη βήματος στο πρώτο βήμα`, /^1 \/ \d+$/.test(await counter()));
  check(`${locale}: χωρίς «μπροστά» στην αρχή`, (await fwd.count()) === 0);
  check(`${locale}: το πρώτο βήμα είναι η χώρα`, (await page.locator("button").filter({ hasText: country }).count()) >= 1);
  await page.locator("button").filter({ hasText: country }).first().click(); await page.waitForTimeout(1800);
  check(`${locale}: βήμα 2`, (await counter()).startsWith("2 /"));
  // πίσω στη χώρα
  await page.getByLabel(locale === "el" ? "Πίσω" : "Back").first().click(); await page.waitForTimeout(400);
  check(`${locale}: πίσω στο βήμα 1, η χώρα μένει`, (await counter()).startsWith("1 /") && (await page.evaluate(() => sessionStorage.getItem("sf_wizard:country"))) === '"GR"');
  check(`${locale}: εμφανίζεται «μπροστά»`, (await fwd.count()) === 1);
  await fwd.click(); await page.waitForTimeout(500);
  check(`${locale}: μπροστά στο βήμα 2`, (await counter()).startsWith("2 /") && (await fwd.count()) === 0);
  await cont(); await page.waitForTimeout(600);
  check(`${locale}: βήμα 3`, (await counter()).startsWith("3 /"));
  // ανανέωση: ίδιο βήμα
  await page.reload(); await page.waitForTimeout(2000);
  check(`${locale}: ανανέωση κρατά το βήμα 3`, (await counter()).startsWith("3 /"));
  // πίσω ως το 2, ανανέωση, μπροστά ακόμα διαθέσιμο
  await page.getByLabel(locale === "el" ? "Πίσω" : "Back").first().click(); await page.waitForTimeout(500);
  await page.reload(); await page.waitForTimeout(2000);
  check(`${locale}: ανανέωση στο βήμα 2 το κρατά και το «μπροστά»`, (await counter()).startsWith("2 /") && (await fwd.count()) === 1);
  await fwd.click(); await page.waitForTimeout(600);
  check(`${locale}: μπροστά στο βήμα 3`, (await counter()).startsWith("3 /"));
  await ctx.close();
}
await browser.close();
finish();
