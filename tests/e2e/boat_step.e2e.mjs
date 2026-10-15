// Βήμα σκάφους: όταν αλλάζει η μάρκα το μοντέλο αδειάζει και δείχνει τις προτάσεις της νέας μάρκας,
// τα πόδια και το έτος δεν μένουν από την προηγούμενη επιλογή, το έτος είναι προαιρετικό και ζει
// μετά τα πόδια. Ελληνικά και αγγλικά.
import { chromium } from "playwright";
import { BASE, check, finish, pickDay, daysFromToday } from "./lib.mjs";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const locale of ["el", "en"]) {
  const L = locale === "el"
    ? { start: /Αναζήτηση πληρώματος/, country: /Ελλάδα/, back: "Πίσω", feet: "Πόσα πόδια;", year: "Έτος κατασκευής", brandTitle: "Τι μάρκα;", modelTitle: "Ποιο μοντέλο;", skip: "Παράλειψη", modelPh: "Γράψε μοντέλο" }
    : { start: /Find crew/, country: /Greece/, back: "Back", feet: "How many feet?", year: "Year built", brandTitle: "Which brand?", modelTitle: "Which model?", skip: "Skip", modelPh: "Type a model" };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Τα κουμπιά ημερολογίου του pickDay είναι ελληνικά: η διαδρομή γίνεται στα ελληνικά και η γλώσσα αλλάζει μετά.
  await ctx.addCookies([{ name: "sf_locale", value: "el", url: BASE }]);
  const page = await ctx.newPage();
  const cont = () => page.locator(".sf-step-footer button").first().click();
  await page.goto(BASE + "/platform"); await page.waitForTimeout(1200);
  await page.locator("button, a").filter({ hasText: /Αναζήτηση πληρώματος/ }).first().click(); await page.waitForTimeout(500);
  await page.locator("button").filter({ hasText: /Ελλάδα/ }).first().click(); await page.waitForTimeout(2500);
  await cont(); await page.waitForTimeout(700);
  await pickDay(page, daysFromToday(40)); await pickDay(page, daysFromToday(43)); await cont(); await page.waitForTimeout(900);
  await cont(); await page.waitForTimeout(700); // επιβάτες
  await page.locator("button[aria-pressed]").nth(0).click(); await page.waitForTimeout(700); // ιστιοπλοϊκό
  if (locale === "en") { await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]); await page.reload(); await page.waitForTimeout(2500); }
  const t = async () => (await page.innerText("body")).replace(/\s+/g, " ");
  const backBtn = () => page.getByLabel(L.back).first();

  check(`${locale}: βήμα μάρκας`, (await t()).includes(L.brandTitle));
  await page.getByRole("button", { name: "Bavaria", exact: true }).click(); await page.waitForTimeout(400);
  check(`${locale}: βήμα μοντέλου`, (await t()).includes(L.modelTitle));
  await page.getByRole("button", { name: "Cruiser 46", exact: true }).click(); await page.waitForTimeout(400);
  check(`${locale}: βήμα ποδιών`, (await t()).includes(L.feet));
  await page.getByRole("button", { name: /^46 / }).click();
  await cont(); await page.waitForTimeout(400);
  check(`${locale}: το έτος έρχεται μετά τα πόδια και είναι προαιρετικό`, (await t()).includes(L.year) && (await page.locator("#wz-boat-year").count()) === 1 && (await page.getByRole("button", { name: L.skip }).count()) === 1);
  await page.locator("#wz-boat-year").fill("2022");

  // Πίσω στη μάρκα και αλλαγή σε Jeanneau.
  for (let i = 0; i < 3; i++) { await backBtn().click(); await page.waitForTimeout(350); }
  check(`${locale}: πίσω στη μάρκα`, (await t()).includes(L.brandTitle));
  // With a brand typed in the field the chips give way to suggestions: clear it first, as a user changing brand would.
  const brandInput = page.locator("input[type=text]").first();
  if ((await brandInput.inputValue()) !== "") { await brandInput.fill(""); await page.waitForTimeout(300); }
  await page.getByRole("button", { name: "Jeanneau", exact: true }).click(); await page.waitForTimeout(500);
  const modelInput = page.getByPlaceholder(L.modelPh);
  check(`${locale}: το μοντέλο της προηγούμενης μάρκας (Cruiser 46) δεν μένει`, (await modelInput.inputValue()) === "" && !(await t()).includes("Cruiser 46"));
  check(`${locale}: φαίνονται προτάσεις μοντέλων της Jeanneau`, (await page.locator("button").filter({ hasText: /Sun Odyssey|Sun Fast|Yacht|Jeanneau/ }).count()) > 0, (await t()).slice(0, 300));
  // Επιλογή μοντέλου, και τα πόδια/έτος δεν κρατούν τις τιμές του Bavaria.
  await page.locator("[role=none], button").filter({ hasText: /Sun Odyssey/ }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  if (!(await t()).includes(L.feet)) await page.getByRole("button", { name: L.skip }).click();
  await page.waitForTimeout(400);
  check(`${locale}: τα πόδια δεν κρατούν το 46 του προηγούμενου σκάφους`, (await page.locator("input[inputmode=numeric]").first().inputValue()) !== "46");
  await page.getByRole("button", { name: L.skip }).click().catch(() => {});
  await page.waitForTimeout(400);
  check(`${locale}: το έτος δεν κρατά το 2022 του προηγούμενου σκάφους`, (await page.locator("#wz-boat-year").count()) === 1 && (await page.locator("#wz-boat-year").inputValue()) === "");
  await ctx.close();
}
await browser.close();
finish();
