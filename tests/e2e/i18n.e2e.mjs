// Γλώσσες (docs/I18N.md): το κουμπί γλώσσας πάνω δεξιά, η γλώσσα να κρατιέται
// (cookie και λογαριασμός), και ό,τι έχει περάσει στην υποδομή να γυρίζει
// ολόκληρο, χωρίς ανάμεικτα. Εδώ τα αγγλικά είναι ανοιχτά μόνο για τα τεστ.
import { chromium } from "playwright";
import { BASE, as, go, text, check, finish, sql, num, shoot, hydrationOnly } from "./lib.mjs";

const MARIA = "6900002002";
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const lang = (page) => page.evaluate(() => document.documentElement.lang);
const cookie = async (page) => (await page.context().cookies()).find((c) => c.name === "sf_locale")?.value;
const button = (page) => page.locator("[data-language-button]");

async function openMenuAndPick(page, name) {
  await button(page).click();
  await page.locator(".sf-lang-item", { hasText: name }).click();
  await page.waitForTimeout(1500);
}

// ---------------------------------------------------------------------------
console.log("\n== Επισκέπτης: το κουμπί φαίνεται και αλλάζει ολόκληρη τη σελίδα");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => hydrationOnly(e, page) || errors.push(e.message));
await go(page, "/platform");

check("η σελίδα ξεκινά στα ελληνικά", (await lang(page)) === "el" && (await text(page)).includes("Οι άνθρωποι πίσω από κάθε ταξίδι."));
check("το κουμπί γλώσσας φαίνεται στην κεφαλίδα", await button(page).isVisible());
const box = await button(page).boundingBox();
check("πάνω δεξιά: δίπλα στο κέντρο δεξιού άκρου, και αρκετά μεγάλο για δάχτυλο", box && box.x > 390 / 2 && box.y < 80 && box.width >= 44 && box.height >= 44, JSON.stringify(box));
check("δείχνει τον κωδικό με γράμματα (ΕΛ), όχι σημαία", (await button(page).innerText()).trim() === "ΕΛ");

await button(page).click();
const names = (await page.locator(".sf-lang-item").allInnerTexts()).map((s) => s.trim());
check("η λίστα έχει τις γλώσσες στη δική τους γλώσσα", names.join("|") === "Ελληνικά|English", names.join("|"));
check("η τρέχουσα είναι σημειωμένη", (await page.locator(".sf-lang-item", { hasText: "Ελληνικά" }).getAttribute("aria-selected")) === "true");
await shoot(page, "language-menu");
await page.keyboard.press("Escape");
check("το Escape κλείνει τη λίστα", (await page.locator(".sf-lang-item").count()) === 0);

await openMenuAndPick(page, "English");
const en = await text(page);
check("γλώσσα σελίδας: en", (await lang(page)) === "en");
check("cookie γλώσσας", (await cookie(page)) === "en");
check("τα κείμενα που έχουν περάσει στην υποδομή γύρισαν", en.includes("The people behind every voyage.") && en.includes("Where are you travelling?") && en.includes("Login"));
check("υποσέλιδο στα αγγλικά", en.includes("Terms") && en.includes("Privacy") && en.includes("How it works"));
check("το κουμπί δείχνει τη νέα γλώσσα", (await button(page).getAttribute("aria-label")).includes("English"));
const remaining = await page.locator("div.platform-scope").first().evaluate((el) => {
  // Χωρίς το υποσέλιδο (έχει την ελληνική επωνυμία της εταιρείας).
  const clone = el.cloneNode(true);
  clone.querySelectorAll("footer, [data-legal], [lang=el]").forEach((n) => n.remove());
  return clone.innerText;
});
check("η κεφαλίδα και η αρχική δεν έχουν ελληνικά γράμματα", !GREEK.test(remaining), remaining.replace(/\s+/g, " ").slice(0, 300));
await shoot(page, "language-english-home");

// Η επιλογή μένει σε νέα φόρτωση και σε νέα καρτέλα του ίδιου browser.
await page.reload();
await page.waitForTimeout(1200);
check("μετά από ανανέωση μένει στα αγγλικά", (await lang(page)) === "en" && (await text(page)).includes("Where are you travelling?"));
const other = await ctx.newPage();
await other.goto(`${BASE}/platform`);
await other.waitForTimeout(1200);
check("νέα καρτέλα: αγγλικά", (await lang(other)) === "en" && (await text(other)).includes("Where are you travelling?"));
await other.close();

await openMenuAndPick(page, "Ελληνικά");
check("πίσω στα ελληνικά: γλώσσα σελίδας", (await lang(page)) === "el");
check("πίσω στα ελληνικά: τα κείμενα", (await text(page)).includes("Οι άνθρωποι πίσω από κάθε ταξίδι."));

// Άγνωστη ή κλειστή γλώσσα στο cookie δεν σπάει τίποτα: μένει η προεπιλογή.
await ctx.addCookies([{ name: "sf_locale", value: "klingon", url: BASE }]);
await page.reload();
await page.waitForTimeout(1000);
check("άγνωστη γλώσσα στο cookie → ελληνικά", (await lang(page)) === "el" && (await text(page)).includes("Οι άνθρωποι πίσω από κάθε ταξίδι."));
check("χωρίς σφάλματα σελίδας (επισκέπτης)", errors.length === 0, errors.join(" | "));
await ctx.close();

// ---------------------------------------------------------------------------
console.log("\n== Συνδεδεμένος: η γλώσσα ακολουθεί τον λογαριασμό");
sql(`update users set locale = 'el' where id = 'a0000000-0000-0000-0000-000000000002'`);
await as(MARIA, async (p) => {
  await go(p, "/platform");
  check("συνδεδεμένος: το κουμπί φαίνεται και στη δεύτερη κεφαλίδα", await button(p).isVisible());
  const headerBox = await button(p).boundingBox();
  check("και δεν σπρώχνει το όνομα έξω από την οθόνη", headerBox && headerBox.x + headerBox.width <= 1280);
  await openMenuAndPick(p, "English");
  check("συνδεδεμένος: γλώσσα σελίδας en", (await lang(p)) === "en");
  await p.waitForTimeout(800);
  check("η γλώσσα γράφτηκε στον λογαριασμό", sql(`select locale from users where id = 'a0000000-0000-0000-0000-000000000002'`) === "en");

  // Νέα συσκευή: χωρίς cookie, η σελίδα ανοίγει στη γλώσσα του λογαριασμού.
  await p.context().clearCookies({ name: "sf_locale" });
  await go(p, "/platform");
  await p.waitForTimeout(1800);
  check("νέα συσκευή: ανοίγει στη γλώσσα του λογαριασμού", (await lang(p)) === "en" && (await cookie(p)) === "en");

  // Ημερολόγιο: οι μήνες και οι ημέρες στη γλώσσα της σελίδας.
  await go(p, "/platform/search");
  const cal = await text(p);
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  check("ημερολόγιο: μήνας στα αγγλικά", cal.includes(month), month + " ← " + cal.slice(0, 400));
  check("ημερολόγιο: ημέρες Mo Tu We", /Mo\s*Tu\s*We\s*Th\s*Fr\s*Sa\s*Su/.test(cal));
  await shoot(p, "language-english-calendar");

  // Και πίσω: ο λογαριασμός ξαναγίνεται ελληνικός.
  await openMenuAndPick(p, "Ελληνικά");
  await p.waitForTimeout(800);
  check("πίσω στα ελληνικά και στον λογαριασμό", (await lang(p)) === "el" && sql(`select locale from users where id = 'a0000000-0000-0000-0000-000000000002'`) === "el");
  const calEl = await text(p);
  check("ημερολόγιο στα ελληνικά όπως πριν", /Δε\s*Τρ\s*Τε\s*Πε\s*Πα\s*Σα\s*Κυ/.test(calEl));
});

// Το cookie γράφει μόνο ανοιχτή γλώσσα: τιμή εκτός μορφής απορρίπτεται και από τη βάση.
check("η βάση απορρίπτει κωδικό γλώσσας εκτός μορφής", (() => {
  try {
    sql(`update users set locale = 'Not A Locale' where id = 'a0000000-0000-0000-0000-000000000002'`);
    return false;
  } catch {
    return true;
  }
})());

await browser.close();
sql(`update users set locale = 'el' where id = 'a0000000-0000-0000-0000-000000000002'`);
finish();
