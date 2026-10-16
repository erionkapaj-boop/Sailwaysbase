// Πεδίο τηλεφώνου: χώρα + αριθμός, με έλεγχο ανά χώρα καθώς γράφεται. Στόχος: ένας λάθος
// αριθμός να μην περνά ποτέ ως σωστός, ώστε να μη μένει προφίλ χωρίς επικοινωνία.
import { chromium } from "playwright";
import { BASE, check, finish, text, shoot, hydrationOnly } from "./lib.mjs";

const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => hydrationOnly(e, page) || errors.push(e.message));

try {
  await page.goto(`${BASE}/platform/register`);
  await page.waitForLoadState("networkidle");
  const country = page.getByLabel("Χώρα");
  const number = page.locator("#reg-phone");
  const t = () => text(page);

  check("προεπιλογή: Ελλάδα", (await country.inputValue()) === "GR");

  await number.fill("6940903478");
  check("σωστός ελληνικός αριθμός: φαίνεται μορφοποιημένος ολόκληρος", (await t()).includes("+30 694 090 3478"), (await t()).slice(0, 300));
  await shoot(page, "phone-valid");

  await number.fill("12345");
  await number.blur();
  check("πολύ σύντομος αριθμός: μήνυμα με τον κανόνα της χώρας", (await t()).includes("Το κινητό στην Ελλάδα έχει 10 ψηφία και ξεκινά από 69."));
  check("και δεν φαίνεται ως σωστός", !(await t()).includes("+30 12"));
  await shoot(page, "phone-invalid");

  await number.fill("69409034781");
  await number.blur();
  check("ένα ψηφίο παραπάνω: δεν περνά", (await t()).includes("Το κινητό στην Ελλάδα έχει 10 ψηφία"));

  await number.fill("5940903478");
  await number.blur();
  check("ελληνικός αριθμός που δεν ξεκινά από 69: δεν περνά", (await t()).includes("ξεκινά από 69"));

  // Μόνο κινητό: το σταθερό απορρίπτεται, με οποιαδήποτε μορφή.
  await number.fill("2101234567");
  await number.blur();
  check("ελληνικό σταθερό (210…): δεν γίνεται δεκτό", (await t()).includes("Το κινητό στην Ελλάδα έχει 10 ψηφία και ξεκινά από 69.") && !(await t()).includes("+30 21"));

  // Άλλη χώρα: κανόνες δικής της χώρας.
  await country.selectOption("CY");
  await number.fill("99123456");
  check("Κύπρος: σωστός αριθμός", (await t()).includes("+357 99 123456"), (await t()).slice(0, 300));
  await number.fill("9912345");
  await number.blur();
  check("Κύπρος: ένα ψηφίο λιγότερο δεν περνά", (await t()).includes("Γράψε κινητό τηλέφωνο της χώρας που διάλεξες."));
  await number.fill("22123456");
  await number.blur();
  check("Κύπρος: σταθερό δεν γίνεται δεκτό", (await t()).includes("Γράψε κινητό τηλέφωνο της χώρας που διάλεξες.") && !(await t()).includes("+357 22"));

  // Επικόλληση διεθνούς αριθμού: διαλέγει μόνος του τη χώρα.
  await number.fill("+30 694 090 3478");
  check("επικόλληση +30…: η χώρα γίνεται Ελλάδα", (await country.inputValue()) === "GR");
  check("και ο αριθμός είναι σωστός", (await t()).includes("+30 694 090 3478"));
  await number.fill("0030 694 090 3479");
  check("επικόλληση 0030…: επίσης", (await country.inputValue()) === "GR" && (await t()).includes("+30 694 090 3479"));

  // Δεν μπορεί να συνεχίσει με άκυρο αριθμό.
  await page.fill("#reg-name", "Δοκιμή Αριθμού");
  await page.fill("#reg-email", "dokimi.arithmou@example.com");
  await number.fill("123");
  await page.getByRole("button", { name: "Συνέχεια", exact: true }).click();
  await page.waitForTimeout(800);
  check("άκυρος αριθμός: η εγγραφή δεν προχωρά και το μήνυμα είναι μία φορά, στο πεδίο",
    page.url().includes("/platform/register") && ((await t()).match(/Το κινητό στην Ελλάδα έχει 10 ψηφία/g) || []).length === 1 && !(await t()).includes("Ο αριθμός δεν είναι σωστός"), page.url());
  await shoot(page, "phone-blocked");

  // Η Σύνδεση δεν δείχνει μηνύματα, αλλά έχει τον ίδιο επιλογέα χώρας.
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  check("Σύνδεση: ίδιος επιλογέας χώρας, χωρίς μηνύματα", (await page.getByLabel("Χώρα").inputValue()) === "GR");
  await page.locator("#login-phone").fill("12");
  await page.locator("#login-phone").blur();
  check("Σύνδεση: δεν εμφανίζει σφάλμα αριθμού πριν την προσπάθεια", !(await text(page)).includes("Το κινητό στην Ελλάδα"));
  await shoot(page, "phone-login");
} catch (e) {
  check("η ροή ολοκληρώθηκε", false, e.stack || e.message);
} finally {
  check("χωρίς σφάλματα σελίδας", errors.length === 0, errors.join(" | "));
  await b.close();
}
finish();
