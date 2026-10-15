// Οθόνη «Από ποιο λιμάνι;»: μία κάρτα με το «Από» και τη γραμμή διαδρομής (⇆ Άλιμος → Άλιμος ⌄), που ανοίγει ομαλά
// για άλλο λιμάνι επιστροφής· και η σελίδα ΔΕΝ πετάγεται απότομα όταν επιλέγεται λιμάνι από τη λίστα (κινητό ΚΑΙ desktop).
import { chromium } from "playwright";
import { BASE, check, finish, shoot } from "./lib.mjs";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const [label, w, h] of [["κινητό", 390, 844], ["desktop", 1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/platform`);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Αναζήτηση πληρώματος", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Ελλάδα", exact: true }).click();
  await page.waitForTimeout(2200);

  const card = page.locator("[data-route-card]");
  const routeText = async () => (await page.locator("[data-route-text]").innerText()).trim();
  check(`${label}: τίτλος «Από ποιο λιμάνι;»`, (await page.innerText("body")).includes("Από ποιο λιμάνι;"));
  check(`${label}: μία κάρτα με το «Από» και τη γραμμή διαδρομής`, (await card.count()) === 1 && (await card.locator("[data-route-field=from]").count()) === 1 && (await card.locator("[data-route-row]").count()) === 1);
  check(`${label}: προεπιλογή «Άλιμος → Άλιμος», με ⇆ και ⌄`, (await routeText()) === "Άλιμος → Άλιμος" && (await card.locator("[data-route-row] svg").count()) === 2, await routeText());
  check(`${label}: μικρό γκρι «Αλλαγή επιστροφής», όχι διακόπτης`, (await card.innerText()).includes("Αλλαγή επιστροφής") && (await page.locator("[data-same-return]").count()) === 0);
  await shoot(page, `route-card-${label}`);

  // Άνοιγμα ομαλά, επιλογή άλλου λιμανιού επιστροφής.
  const hBefore = await card.evaluate((el) => el.getBoundingClientRect().height);
  await page.locator("[data-route-row]").click();
  await page.waitForTimeout(80);
  const hMid = await card.evaluate((el) => el.getBoundingClientRect().height);
  await page.waitForTimeout(500);
  const hOpen = await card.evaluate((el) => el.getBoundingClientRect().height);
  check(`${label}: ανοίγει ομαλά (ενδιάμεσο ύψος, όχι άλμα)`, hOpen > hBefore + 40 && hMid < hOpen, `${hBefore} → ${hMid} → ${hOpen}`);
  await shoot(page, `route-card-open-${label}`);
  await page.locator("[data-route-row]").click();
  await page.waitForTimeout(450);
  check(`${label}: άνοιγμα και κλείσιμο χωρίς επιλογή: μένει «Άλιμος → Άλιμος» και το «Συνέχεια» ενεργό`, (await routeText()) === "Άλιμος → Άλιμος" && !(await page.getByRole("button", { name: "Συνέχεια" }).isDisabled()));
  await page.locator("[data-route-row]").click();
  await page.waitForTimeout(450);
  await page.locator("[data-route-panel] [role=combobox]").fill("mikonos");
  await page.getByRole("option", { name: /^Μύκονος/ }).click();
  await page.waitForTimeout(600);
  check(`${label}: «Άλιμος → Μύκονος» και κλείνει`, (await routeText()) === "Άλιμος → Μύκονος" && (await page.locator("[data-route-panel] [role=combobox]").count()) === 0, await routeText());

  // Αλλαγή του «Από» ενημερώνει τη διαδρομή (η επιστροφή μένει στη Μύκονο).
  // Επιστροφή στο ίδιο λιμάνι και μετά αλλαγή «Από»: ακολουθεί.
  await page.locator("[data-route-row]").click();
  await page.waitForTimeout(500);
  check(`${label}: ανοιγμένη διαδρομή χωρίς επιλογή δεν κλειδώνει το «Συνέχεια»`, !(await page.getByRole("button", { name: "Συνέχεια" }).isDisabled()));
  await page.locator("[data-return-home]").click();
  await page.waitForTimeout(500);
  check(`${label}: «Επιστροφή στο ίδιο λιμάνι» γυρίζει στο «Άλιμος → Άλιμος»`, (await routeText()) === "Άλιμος → Άλιμος", await routeText());

  // ---- Η σελίδα δεν πετάγεται: επιλογή λιμανιού από τη λίστα ----
  const row = page.locator("[data-base-ports] .sf-pp-row").filter({ hasText: "Πρέβεζα" }).first();
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__ys = []; const f = () => { window.__ys.push(Math.round(window.scrollY)); window.__raf = requestAnimationFrame(f); }; f(); });
  await row.click();
  await page.waitForTimeout(1400);
  const ys = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__ys; });
  let maxStep = 0;
  for (let i = 1; i < ys.length; i++) maxStep = Math.max(maxStep, Math.abs(ys[i] - ys[i - 1]));
  check(`${label}: επιλογή «Πρέβεζα» από τη λίστα: καμία απότομη μετακίνηση (μέγιστο βήμα ${maxStep}px/frame)`, maxStep <= 90, `${maxStep}`);
  const fromTxt = (await page.locator("[data-route-field=from] [data-place-title]").innerText()).trim();
  check(`${label}: το «Από» ενημερώθηκε ορατά σε «Πρέβεζα» και η διαδρομή ακολουθεί`, fromTxt === "Πρέβεζα" && (await routeText()) === "Πρέβεζα → Πρέβεζα", `${fromTxt} / ${await routeText()}`);
  const vis = await card.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
  check(`${label}: η κάρτα με το «Από» φαίνεται στην οθόνη`, vis);
  await shoot(page, `route-card-picked-${label}`);
  check(`${label}: χωρίς σφάλματα σελίδας`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}
await browser.close();
finish();
