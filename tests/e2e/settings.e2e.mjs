// Ρυθμίσεις: αλλαγές που δεν αποθηκεύτηκαν δεν χάνονται σιωπηλά και
// φαίνονται καθαρά· ό,τι αποθηκεύεται φαίνεται αμέσως στη σελίδα Credits.
import { as, go, text, check, finish, sql, num } from "./lib.mjs";

const ADMIN = "6900002001", MARIA = "6900002002";
const setting = (k) => num(`select value from platform_settings where key = '${k}'`);
const row = (page, label) =>
  page.locator("div").filter({ has: page.getByText(label, { exact: true }) }).filter({ has: page.locator("input") }).last();

await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/settings");
  await row(page, "Τιμή ενός credit").locator("input").fill("70");
  await row(page, "Starter: τιμή").locator("input").fill("130");
  await page.waitForTimeout(300);
  let t = await text(page);
  check("η αλλαγή που δεν αποθηκεύτηκε φαίνεται", t.includes("Δεν έχει αποθηκευτεί"));
  check("μπάρα: 2 αλλαγές δεν έχουν αποθηκευτεί", t.includes("2 αλλαγές δεν έχουν αποθηκευτεί"));

  await row(page, "Τιμή ενός credit").getByRole("button", { name: "Αποθήκευση" }).click();
  await page.waitForTimeout(1200);
  t = await text(page);
  check("αποθηκεύτηκε η τιμή του credit", setting("credit_price_eur") === 70);
  check("η άλλη αλλαγή δεν χάθηκε", (await row(page, "Starter: τιμή").locator("input").inputValue()) === "130");
  check("και η μπάρα λέει 1", t.includes("1 αλλαγή δεν έχει αποθηκευτεί"));

  await page.getByRole("button", { name: "Αποθήκευση όλων" }).click();
  await page.waitForTimeout(1500);
  t = await text(page);
  check("αποθήκευση όλων: και το Starter", setting("package_starter_price") === 130);
  check("η μπάρα έφυγε", !t.includes("δεν έχει αποθηκευτεί") && !t.includes("δεν έχουν αποθηκευτεί"));
  check("η προεπισκόπηση δείχνει τις νέες τιμές", t.includes("1 credit · 70€") && t.includes("Starter · 2 credits · 130€"));

  // Αποτυχία: το μήνυμα εμφανίζεται δίπλα στη ρύθμιση, όχι στην κορυφή.
  await row(page, "Τιμή ενός credit").locator("input").fill("0");
  await row(page, "Τιμή ενός credit").getByRole("button", { name: "Αποθήκευση" }).click();
  await page.waitForTimeout(1200);
  const errText = await row(page, "Τιμή ενός credit").innerText();
  check("το σφάλμα φαίνεται κάτω από τη ρύθμιση", /εκτός επιτρεπτών ορίων/.test(errText), errText);
  check("και η τιμή δεν άλλαξε", setting("credit_price_eur") === 70);
});

await as(MARIA, async (page) => {
  await go(page, "/platform/wallet/buy");
  const t = await text(page);
  check("η αγορά δείχνει τις νέες τιμές", t.includes("70€") && t.includes("130€"));
});

sql(`update platform_settings set value = 50 where key = 'credit_price_eur';
     update platform_settings set value = 90 where key = 'package_starter_price';`);
finish();
