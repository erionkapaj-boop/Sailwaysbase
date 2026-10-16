// Νέα είσοδος στο root (link ή bookmark) → ΠΑΝΤΑ η αρχική. Ανανέωση ΜΕΣΑ στη ροή → ίδιο βήμα με τα δεδομένα του.
// Μισοτελειωμένο αίτημα → μικρή ταμπέλα «Συνέχισε το αίτημά σου» στην αρχική. Κινητό και desktop, καθαρός browser.
import { chromium } from "playwright";
import { BASE, check, finish, shoot } from "./lib.mjs";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const [label, w, h] of [["κινητό", 390, 844], ["desktop", 1280, 900]]) {
  // Καθαρός browser: νέο context, χωρίς αποθηκευμένη κατάσταση.
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const onHome = async () => (await page.locator("[data-home-search]").count()) === 1 && (await page.locator("[data-sf-wizard]").count()) === 0;
  const inWizard = async () => (await page.locator("[data-sf-wizard]").count()) === 1;
  const counter = async () => (await page.locator("[data-sf-wizard] span").filter({ hasText: /^\d+ \/ \d+$/ }).first().innerText()).trim();

  await page.goto(`${BASE}/platform`);
  await page.waitForTimeout(1500);
  check(`${label}: καθαρός browser → αρχική, χωρίς ταμπέλα συνέχειας`, (await onHome()) && (await page.locator("[data-resume-request]").count()) === 0);

  // Μέσα στη ροή: χώρα (βήμα 2), λιμάνι (βήμα 3).
  await page.locator("[data-home-search]").click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Ελλάδα", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.locator(".sf-step-footer button").first().click();
  await page.waitForTimeout(700);
  check(`${label}: μέσα στη ροή το URL έχει τη δική του διεύθυνση (flow=1)`, page.url().includes("flow=1&s=2") && (await counter()).startsWith("3 /"), page.url());

  // Ανανέωση ΜΕΣΑ στη ροή: ίδιο βήμα.
  await page.reload();
  await page.waitForTimeout(2000);
  check(`${label}: ανανέωση μέσα στη ροή → μένει στο βήμα 3`, (await inWizard()) && (await counter()).startsWith("3 /"));

  // Νέα είσοδος στο root URL (ίδια καρτέλα, ίδιο σημείο): αρχική.
  await page.goto(`${BASE}/platform`);
  await page.waitForTimeout(1500);
  check(`${label}: νέα είσοδος στο root → αρχική (όχι βήμα της ροής)`, await onHome());
  const banner = page.locator("[data-resume-request]");
  check(`${label}: μισοτελειωμένο αίτημα → ταμπέλα «Συνέχισε το αίτημά σου»`, (await banner.count()) === 1 && (await banner.innerText()).includes("Συνέχισε το αίτημά σου"));
  await shoot(page, `home-resume-${label}`);

  // Ακόμα κι αν γράψει το URL της ροής (bookmark μέσα στη ροή): αρχική.
  await page.goto(`${BASE}/platform?flow=1`);
  await page.waitForTimeout(1500);
  check(`${label}: URL ροής σε νέα είσοδο → αρχική, και καθαρίζει το ίχνος`, (await onHome()) && !page.url().includes("flow="), page.url());

  // Η ταμπέλα πάει ακριβώς εκεί που έμεινε.
  await page.locator("[data-resume-request]").click();
  await page.waitForTimeout(800);
  check(`${label}: «Συνέχισε» → στο βήμα 3 με τα δεδομένα του`, (await inWizard()) && (await counter()).startsWith("3 /") && (await page.evaluate(() => sessionStorage.getItem("sf_wizard:country"))) === '"GR"');

  // «Πίσω» από τη ροή: η αρχική.
  await page.goBack();
  await page.waitForTimeout(800);
  check(`${label}: πίσω από τη ροή → αρχική`, await onHome());

  // Τελειωμένο αίτημα: δεν υπάρχει τίποτα μισοτελειωμένο.
  await page.evaluate(() => sessionStorage.setItem("sf_wizard:done", "1"));
  await page.goto(`${BASE}/platform`);
  await page.waitForTimeout(1500);
  check(`${label}: τελειωμένο αίτημα → καμία ταμπέλα`, (await onHome()) && (await page.locator("[data-resume-request]").count()) === 0);
  check(`${label}: χωρίς σφάλματα σελίδας`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// Αγγλικά: το κείμενο της ταμπέλας.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/platform`);
  await page.waitForTimeout(1500);
  await page.locator("[data-home-search]").click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Greece", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.goto(`${BASE}/platform`);
  await page.waitForTimeout(1500);
  check("en: «Continue your request»", (await page.locator("[data-resume-request]").innerText()).includes("Continue your request"));
  await shoot(page, "home-resume-en");
  await ctx.close();
}
await browser.close();
finish();
