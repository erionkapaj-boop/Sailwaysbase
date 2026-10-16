// Στοιχεία παρόχου (ιδιοκτήτης 16/10/2026): δεν φαίνονται σε κανένα σημείο χωρίς πάτημα — ούτε στο footer ούτε
// στο σώμα των Όρων και του Απορρήτου — και εμφανίζονται με ένα πάτημα στο «Στοιχεία παρόχου».
import { chromium } from "playwright";
import { BASE, go, text, check, finish, shoot } from "./lib.mjs";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const locale of ["el", "en"]) {
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    if (locale === "en") await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
    const page = await ctx.newPage();
    for (const path of ["/platform", "/platform/terms", "/platform/privacy"]) {
      await go(page, path);
      const body = await text(page);
      check(`${locale} ${w}px ${path}: χωρίς στοιχεία παρόχου πριν το πάτημα`, !body.includes("138244549") && !body.includes("ΚΑΠΑΙ ΕΡΙΟΝ") && !body.includes("Δυοβουνιώτου"));
    }
    for (const path of ["/platform/terms", "/platform/privacy"]) {
      await go(page, path);
      await page.locator("[data-provider-toggle]").click();
      const body = await text(page);
      check(`${locale} ${w}px ${path}: με ένα πάτημα φαίνονται`, body.includes("138244549") && body.includes("ΚΑΠΑΙ ΕΡΙΟΝ") && body.includes("Δυοβουνιώτου"));
      await shoot(page, `legal-details-${path.split("/").pop()}-${locale}-${w}`);
    }
    await ctx.close();
  }
}
await browser.close();
finish();
