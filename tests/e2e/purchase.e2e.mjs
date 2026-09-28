// 0113: αίτημα αγοράς credits από τον χρήστη, επιβεβαίωση από τον ιδιοκτήτη.
import { as, go, text, click, check, finish, num, sql } from "./lib.mjs";

const ADMIN = "6900002001", GIORGOS = "6900002004";
const wallet = () => num(`select wallet_balance from users where phone_number = '+30${GIORGOS}'`);
const w0 = wallet();

await as(GIORGOS, async (page) => {
  await go(page, "/platform/wallet");
  await page.getByRole("link", { name: "Αγορά credits" }).click();
  await page.waitForTimeout(1500);
  let t = await text(page);
  check("προεπιλογή: Professional, με ένδειξη Δημοφιλές", t.includes("Δημοφιλές") &&
    (await page.getByRole("radio", { name: /Professional/ }).getAttribute("aria-checked")) === "true");
  check("τιμή ανά credit και έκπτωση", t.includes("40€ το credit") && t.includes("−20%"));
  check("σύνολο 200€", t.includes("Σύνολο · 5 credits") && t.includes("200€"));

  await page.getByRole("radio", { name: /Άλλος αριθμός/ }).click();
  await page.getByLabel("Αριθμός credits").fill("3");
  await page.waitForTimeout(300);
  check("άλλος αριθμός: 3 × 50€ = 150€", (await text(page)).includes("Σύνολο · 3 credits") && (await text(page)).includes("150€"));

  await page.getByRole("radio", { name: /Pro\b/ }).last().click();
  await click(page, "Αποστολή αιτήματος");
  await page.waitForTimeout(2000);
  t = await text(page);
  check("επιβεβαίωση με κωδικό", t.includes("Το αίτημά σου καταχωρήθηκε") && /CR-[0-9A-F]{6}/.test(t));

  await go(page, "/platform/wallet");
  t = await text(page);
  check("στη σελίδα Credits: το αίτημα σε εκκρεμότητα", t.includes("Αίτημα αγοράς σε εκκρεμότητα") && t.includes("350€"));
  check("χωρίς δεύτερο κουμπί αγοράς όσο εκκρεμεί", !(await page.getByRole("link", { name: "Αγορά credits" }).count()));
});
check("τα credits δεν πιστώθηκαν ακόμα", wallet() === w0);
const ref = sql(`select reference from credit_purchase_requests where status = 'pending' order by created_at desc limit 1`);

await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/finance");
  const t = await text(page);
  check("ο ιδιοκτήτης βλέπει το αίτημα στα Οικονομικά", /αιτήματα αγοράς \(1\)/i.test(t.replace(/ΑΙΤΗΜΑΤΑ ΑΓΟΡΑΣ/g, "αιτήματα αγοράς")) && t.includes(ref), t.slice(0, 500));
  await click(page, "Επιβεβαίωση πληρωμής");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Επιβεβαίωση", exact: true }).last().click();
  await page.waitForTimeout(2000);
  check("το αίτημα έφυγε από την εκκρεμότητα", (await text(page)).includes("Κανένα αίτημα σε εκκρεμότητα"));
});
check("πιστώθηκαν 10 credits", wallet() === w0 + 10);

await as(GIORGOS, async (page) => {
  await go(page, "/platform/wallet");
  const t = await text(page);
  check("ο χρήστης βλέπει την αγορά με τον κωδικό", t.includes("Αγορά credits") && t.includes(ref) && t.includes("+10 credits"));
  check("και ξανά το κουμπί αγοράς", (await page.getByRole("link", { name: "Αγορά credits" }).count()) === 1);
});

// Επαναφορά.
sql(`select set_config('platform.trusted', 'true', false);
     insert into wallet_transactions (user_id, type, amount, note)
       select id, 'adjustment', -10, 'Επαναφορά δοκιμής' from users where phone_number = '+30${GIORGOS}';
     update users set wallet_balance = wallet_balance - 10 where phone_number = '+30${GIORGOS}';`);
finish();
