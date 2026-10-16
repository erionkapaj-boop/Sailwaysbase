// Αρχική (διάταξη ιδιοκτήτη 16/10/2026, από εικόνα αναφοράς): τελείες πάνω αριστερά με «Μεταφορά σκάφους»,
// «Για επαγγελματίες», γλώσσα με γράμματα (ΕΛ/EN) και Σύνδεση δεξιά, τιμόνι, όνομα, σλόγκαν, πεδίο «Πού θα
// ταξιδέψεις;» που ανοίγει τον οδηγό, εμπειρίες. Ελληνικά και αγγλικά.
import { chromium } from "playwright";
import http from "node:http";
import { BASE, as, go, text, check, finish, shoot, hydrationDiag, HYDRATION_SNAP, hydrationOnly } from "./lib.mjs";

// Στο skipperfinder.gr η αρχική είναι η ρίζα «/» (middleware.js): ίδια κεφαλίδα με το /platform.
const html = await new Promise((resolve, reject) => {
  const u = new URL(BASE + "/");
  http.get({ host: u.hostname, port: u.port, path: "/", headers: { host: "skipperfinder.gr" } }, (res) => {
    let b = "";
    res.on("data", (c) => (b += c));
    res.on("end", () => resolve(b));
  }).on("error", reject);
});
check("skipperfinder.gr/: η νέα αρχική (τελείες, χωρίς λογότυπο στην κεφαλίδα)", html.includes('aria-label="Περισσότερα"') && html.includes("Για επαγγελματίες") && html.includes("data-home-search"));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const locale of ["el", "en"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(HYDRATION_SNAP);
  if (locale === "en") await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => {
    if (hydrationOnly(e, page, `home ${locale}`)) return;
    errors.push(e.message);
  });
  await go(page, "/platform");
  const L = locale === "el"
    ? { tag: "Οι άνθρωποι πίσω από κάθε ταξίδι.", cta: "Πού θα ταξιδέψεις;", exp: "Ανακάλυψε εμπειρίες στη θάλασσα", pros: "Για επαγγελματίες", code: "ΕΛ", login: "Σύνδεση", menu: "Περισσότερα", delivery: "Μεταφορά σκάφους", terms: "Όροι", how: "Πώς λειτουργεί", lead: "φέρνει σε επαφή όσους χρειάζονται πλήρωμα", detail: "Αναλυτικά" }
    : { tag: "The people behind every voyage.", cta: "Where are you travelling?", exp: "Discover experiences at sea", pros: "For professionals", code: "EN", login: "Login", menu: "More", delivery: "Boat delivery", terms: "Terms", how: "How it works", lead: "connects people who need crew", detail: "In detail" };
  const body = await text(page);
  check(`${locale}: όλα τα στοιχεία της αρχικής`, [L.tag, L.cta, L.exp, L.pros, L.login, L.terms].every((s) => body.includes(s)), body.slice(0, 300));
  check(`${locale}: γλώσσα με γράμματα, χωρίς σημαία`, (await page.locator("[data-language-code]").innerText()) === L.code && (await page.locator("[data-language-button] svg, [data-language-button] img").count()) === 1);
  const bar = await page.locator("[data-home-search]").boundingBox();
  check(`${locale}: το πεδίο απλώνεται σε όλο το πλάτος του κινητού`, bar && bar.width >= 320 && bar.height >= 60, JSON.stringify(bar));
  check(`${locale}: χωρίς λογότυπο στην κεφαλίδα (μόνο ένα SkipperFinder)`, (body.match(/SkipperFinder/g) || []).length <= 2);
  const dots = page.getByRole("button", { name: L.menu, exact: true });
  const box = await dots.boundingBox();
  check(`${locale}: τελείες πάνω αριστερά, 44px`, box && box.x < 60 && box.y < 70 && box.width >= 44 && box.height >= 44, JSON.stringify(box));
  await shoot(page, `home-${locale}`);
  // Υποσέλιδο (16/10/2026): μία λεπτή λωρίδα στο κάτω άκρο· «Πώς λειτουργεί» ανοίγει τη σύντομη καρτέλα.
  const foot = await page.locator("[data-site-footer]").boundingBox();
  check(`${locale}: λεπτό υποσέλιδο στο κάτω άκρο`, foot && foot.height <= 110 && Math.abs(foot.y + foot.height - 844) <= 2, JSON.stringify(foot));
  await page.locator("[data-how-link]").click();
  await page.waitForTimeout(400);
  const sheet = page.locator("[data-how-sheet]");
  check(`${locale}: «${L.how}» ανοίγει την καρτέλα`, (await sheet.count()) === 1 && (await sheet.innerText()).includes(L.lead));
  await shoot(page, `home-how-${locale}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check(`${locale}: το Escape την κλείνει`, (await sheet.count()) === 0);
  await page.locator("[data-how-link]").click();
  await page.getByRole("link", { name: L.detail, exact: true }).click();
  await page.waitForURL(/\/platform\/about/, { timeout: 10000 }).catch(() => {});
  check(`${locale}: «${L.detail}» οδηγεί στη σελίδα με τις λεπτομέρειες`, page.url().includes("/platform/about"));
  await go(page, "/platform");
  await dots.click();
  await page.waitForTimeout(300);
  const items = (await page.getByRole("menuitem").allInnerTexts()).map((x) => x.trim());
  check(`${locale}: το μενού έχει έξι εφαρμογές με τη σειρά Jobs, Delivery, WindNow, Community, Nearby, Explore`, items.join("|") === "Jobs|Delivery|WindNow|Community|Nearby|Explore", items.join("|"));
  await shoot(page, `home-menu-${locale}`);
  await page.locator('[data-app="delivery"]').click();
  await page.waitForURL(/\/platform\/delivery/, { timeout: 10000 }).catch(() => {});
  check(`${locale}: η μεταφορά σκάφους ανοίγει`, page.url().includes("/platform/delivery"));
  await go(page, "/platform");
  await page.getByRole("link", { name: L.exp, exact: true }).click();
  await page.waitForURL(/experiences/, { timeout: 10000 }).catch(() => {});
  check(`${locale}: οι εμπειρίες ανοίγουν`, page.url().includes("/platform/experiences"));
  await go(page, "/platform");
  await page.getByRole("link", { name: L.pros, exact: true }).click();
  await page.waitForURL(/register/, { timeout: 10000 }).catch(() => {});
  check(`${locale}: το «Για επαγγελματίες» ανοίγει κατευθείαν τη φόρμα, με το πρώτο πεδίο έτοιμο`, page.url().includes("/platform/register?as=professional") && (await page.locator("#reg-name").isVisible()) && (await page.evaluate(() => document.activeElement?.id)) === "reg-name");
  await go(page, "/platform");
  await page.locator("[data-home-search]").click();
  await page.waitForTimeout(800);
  check(`${locale}: η αναζήτηση ξεκινά`, (await page.locator("[data-sf-wizard]").count()) > 0);
  check(`${locale}: χωρίς σφάλματα σελίδας`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}
await browser.close();

await as("6900002002", async (page) => {
  await go(page, "/platform");
  check("συνδεδεμένη: οι τελείες υπάρχουν πάνω αριστερά", await page.getByRole("button", { name: "Περισσότερα", exact: true }).isVisible());
  await page.getByRole("button", { name: "Περισσότερα", exact: true }).click();
  check("συνδεδεμένη: οι τελείες έχουν τις έξι εφαρμογές (Jobs … Explore)", (await page.getByRole("menuitem").allInnerTexts()).map((x) => x.trim()).join("|") === "Jobs|Delivery|WindNow|Community|Nearby|Explore");
  await page.keyboard.press("Escape");
  check("συνδεδεμένη: χωρίς δεύτερη εγγραφή", !(await text(page)).includes("Για επαγγελματίες"));
  await shoot(page, "home-signed-in");
});

// «Πίσω» κρατά ό,τι είχε συμπληρωθεί: ρόλος διαλεγμένος, φεύγω από την οθόνη, γυρνώ.
const b2 = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
{
  const page = await (await b2.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`${BASE}/platform`);
  await page.waitForLoadState("networkidle");
  await page.locator("[data-home-search]").click();
  await page.getByRole("button", { name: "Ελλάδα", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.goto(`${BASE}/platform/contact`);
  await page.waitForLoadState("networkidle");
  await page.goBack();
  await page.waitForTimeout(1500);
  check("πίσω από άλλη οθόνη: ο οδηγός ανοίγει στο ίδιο βήμα", (await text(page)).includes("Από ποιο λιμάνι;"));
  await page.getByRole("button", { name: "Πίσω" }).first().click();
  await page.waitForTimeout(600);
  check("πίσω στο προηγούμενο βήμα: η χώρα μένει", (await text(page)).includes("Πού θα ταξιδέψεις;") && (await page.evaluate(() => sessionStorage.getItem("sf_wizard:country"))) === '"GR"');
  await page.goto(`${BASE}/platform/contact`);
  await check_small_logo(page);
}
await b2.close();

async function check_small_logo(page) {
  const link = page.locator('a[aria-label^="SkipperFinder"]').first();
  check("σελίδα χρήσης: κέντρο κεφαλίδας με μικρό τιμόνι και «SkipperFinder» που οδηγεί στην αρχική", (await link.locator("svg").count()) > 0 && (await link.innerText()).includes("SkipperFinder"));
}

finish();
