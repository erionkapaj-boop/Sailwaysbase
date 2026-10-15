// Οθόνη γλωσσών: προεπιλογή μόνο Αγγλικά, το «+» ανοίγει πεδίο αναζήτησης (ελληνικά ή αγγλικά, όλες οι
// γλώσσες ISO 639), προσθήκη με ένα πάτημα, ερώτηση όταν αφαιρούνται τα Αγγλικά, και σημάδι στα
// αποτελέσματα για όποιον επαγγελματία μιλά γλώσσα που διάλεξε ο πελάτης.
import { chromium } from "playwright";
import { BASE, OUT, as, go, check, finish, sql, num, pickDay, daysFromToday, iso, shoot, text } from "./lib.mjs";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies([{ name: "sf_locale", value: "el", url: BASE }]);
const page = await ctx.newPage();
// The wizard no longer has a language screen (English is assumed); the picker lives in the results filters.
await page.goto(BASE + "/platform/search?" + new URLSearchParams({ roles: "skipper", start: iso(daysFromToday(40)), end: iso(daysFromToday(43)), region: sql(`select id from regions where name = 'Κυκλάδες'`), point: "Νάξος", arrival: "Νάξος", boat: sql(`select id from boat_types where name = 'Ιστιοπλοϊκό'`), party: "4", cabin: "skipper:bunk", lang: "en" }));
await page.waitForTimeout(2500);
const openFilters = async () => { await page.getByRole("button", { name: /^(Αλλαγή|Change)$/ }).first().click(); await page.waitForTimeout(500); };
await openFilters();
await page.locator("[data-language-picker]").first().scrollIntoViewIfNeeded();

const chips = () => page.locator("[data-language-picker] button[aria-pressed=true]");
const names = async () => (await chips().allInnerTexts()).map((x) => x.trim());
check("προεπιλογή: μόνο τα Αγγλικά (chip με τικ), όχι Ελληνικά", (await names()).join() === "Αγγλικά" && (await page.locator("[data-language=el]").count()) === 0, (await names()).join());
check("δίπλα στο chip υπάρχει το «+»", (await page.getByRole("button", { name: "Περισσότερες γλώσσες" }).count()) === 1);
check("δεν υπάρχει λίστα με κουτάκια", (await page.locator("[data-language-list]").count()) === 0);

await page.getByRole("button", { name: "Περισσότερες γλώσσες" }).click();
const input = page.getByPlaceholder("Γράψε γλώσσα");
check("το «+» ανοίγει μικρό πεδίο αναζήτησης", await input.isVisible());
await input.fill("Γ");
check("με ένα γράμμα δεν βγαίνουν προτάσεις", (await page.locator("[data-language-option]").count()) === 0);
await input.fill("Γερ");
check("«Γερ» → Γερμανικά", (await page.locator("[data-language-option=de]").count()) === 1 && (await page.locator("[data-language-option=de]").innerText()).includes("Γερμανικά"));
await shoot(page, "language-search-el");
await page.locator("[data-language-option=de]").click();
check("ένα πάτημα προσθέτει chip", (await names()).join() === "Αγγλικά,Γερμανικά", (await names()).join());
check("το πεδίο μένει ανοιχτό και άδειο για την επόμενη", (await input.inputValue()) === "" && await input.isVisible());
await input.fill("Thai");
check("«Thai» (αγγλικό όνομα) → Ταϊλανδικά, σπάνια γλώσσα στη δεύτερη κίνηση", (await page.locator("[data-language-option=th]").innerText()).includes("Ταϊλανδικά"));
await page.locator("[data-language-option=th]").click();
check("προστίθενται όσες θέλει ο χρήστης", (await chips().count()) === 3);
await input.fill("Ger");
check("οι ήδη επιλεγμένες δεν προτείνονται ξανά, και δεν γράφει «Δεν βρέθηκε γλώσσα»", (await page.locator("[data-language-option=de]").count()) === 0 && !(await text(page)).includes("Δεν βρέθηκε γλώσσα"));

// Αφαίρεση Αγγλικών.
await page.locator("[data-language=en]").click();
check("αφαίρεση Αγγλικών: μήνυμα «Μπορεί να βρεις λιγότερους επαγγελματίες»", (await page.locator("[data-language-warning]").innerText()).includes("Μπορεί να βρεις λιγότερους επαγγελματίες"));
await shoot(page, "language-warning-el");
await page.locator("[data-keep-english]").click();
check("«Κράτα Αγγλικά»: μένουν και το μήνυμα φεύγει", (await page.locator("[data-language=en]").count()) === 1 && (await page.locator("[data-language-warning]").count()) === 0);
await page.locator("[data-language=en]").click();
await page.locator("[data-remove-english]").click();
check("«Αφαίρεση»: τα Αγγλικά φεύγουν", (await page.locator("[data-language=en]").count()) === 0 && (await chips().count()) === 2);
await page.locator("[data-language=th]").click();
check("άλλη γλώσσα αφαιρείται χωρίς ερώτηση", (await page.locator("[data-language=th]").count()) === 0);
await page.getByRole("button", { name: "Περισσότερες γλώσσες" }).click().catch(() => {});

// Αγγλικά: ίδιο πεδίο, αναζήτηση «Ger».
await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
await page.reload(); await page.waitForTimeout(2500);
await openFilters();
check("αγγλικά: το chip είναι στα αγγλικά", (await names()).join() === "English", (await names()).join());
if (!(await page.getByPlaceholder("Type a language").count())) await page.getByRole("button", { name: "More languages" }).click();
await page.getByPlaceholder("Type a language").fill("Ger");
check("«Ger» → German με το ελληνικό όνομα δίπλα", (await page.locator("[data-language-option=de]").innerText()).includes("German") && (await page.locator("[data-language-option=de]").innerText()).includes("Γερμανικά"));
await page.getByPlaceholder("Type a language").fill("Fren");
check("«Fren» → French με το ελληνικό όνομα δίπλα", (await page.locator("[data-language-option=fr]").innerText()).includes("French") && (await page.locator("[data-language-option=fr]").innerText()).includes("Γαλλικά"));
await shoot(page, "language-search-en");
await ctx.close();
await browser.close();

// Αποτελέσματα: σημάδι για όποιον μιλά τη γλώσσα που διάλεξε ο πελάτης.
const english = sql(`select id from languages where name = 'Αγγλικά'`);
const added = sql(`select u.id from users u where u.role = 'skipper' and not exists (select 1 from user_languages ul where ul.user_id = u.id and ul.language_id = '${english}')`).split("\n").filter(Boolean);
if (added.length) sql(`insert into user_languages (user_id, language_id) values ${added.map((u) => `('${u}', '${english}')`).join(",")}`);
const region = sql(`select id from regions where name = 'Κυκλάδες'`);
const boat = sql(`select id from boat_types where name = 'Ιστιοπλοϊκό'`);
const q = (lang) => new URLSearchParams({ roles: "skipper", start: iso(daysFromToday(12)), end: iso(daysFromToday(14)), region, point: "Νάξος", arrival: "Νάξος", boat, party: "4", cabin: "skipper:bunk", lang });
// Ένας επαγγελματίας μιλά και Γερμανικά.
const german = sql(`select id from languages where name = 'Γερμανικά'`);
const germanUser = sql(`select u.id from users u where u.role = 'skipper' and not exists (select 1 from user_languages ul where ul.user_id = u.id and ul.language_id = '${german}') limit 1`);
sql(`insert into user_languages (user_id, language_id) values ('${germanUser}', '${german}')`);
await as("6900002002", async (page2) => {
  await go(page2, `/platform/search?${q("en")}`);
  await page2.waitForTimeout(1500);
  check("μόνο Αγγλικά (δεδομένα): κανένα σημάδι, βρίσκονται όλοι", (await page2.locator("[data-spoken-match]").count()) === 0 && (await page2.getByRole("button", { name: "Επιλογή", exact: true }).count()) >= 2);
  await go(page2, `/platform/search?${q("en,de")}`);
  await page2.waitForTimeout(1500);
  const marks = page2.locator("[data-spoken-match]");
  check("προστέθηκαν Γερμανικά: σημάδι μόνο σε όποιον τα μιλά, και μόνο για τα Γερμανικά", (await marks.count()) === 1 && (await marks.first().innerText()).includes("Γερμανικά") && !(await marks.first().innerText()).includes("Αγγλικά"), String(await marks.count()));
  await page2.setViewportSize({ width: 390, height: 844 });
  await marks.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page2.waitForTimeout(300);
  await page2.screenshot({ path: `${OUT}/design-language-result-mark-m.png` });
  await go(page2, `/platform/search?${q("th")}`);
  await page2.waitForTimeout(1500);
  check("γλώσσα που δεν μιλά κανείς: κανένα αποτέλεσμα, χωρίς σφάλμα", (await page2.locator("[data-spoken-match]").count()) === 0);
});
sql(`delete from user_languages where language_id = '${german}' and user_id = '${germanUser}'`);
if (added.length) sql(`delete from user_languages where language_id = '${english}' and user_id in (${added.map((u) => `'${u}'`).join(",")})`);
finish();
