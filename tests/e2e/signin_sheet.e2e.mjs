// Ο πελάτης δεν κάνει λογαριασμό στην αρχή. Όλη η ροή (αναζήτηση, επιλογή) γίνεται χωρίς σύνδεση· ο λογαριασμός
// ζητείται μόνο στο «Ολοκλήρωση αιτήματος»: ταμπέλα «Ένα βήμα ακόμα» με ΕΝΑ κουμπί «Συνέχεια με Google», χωρίς
// φόρμες και κωδικούς. Μετά τη σύνδεση επιστρέφει στο ίδιο σημείο με το αίτημα ανέπαφο. Ελληνικά και αγγλικά.
import { chromium } from "playwright";
import { BASE, check, finish, sql, shoot, text, daysFromToday, iso, hydrationOnly } from "./lib.mjs";

const GATEWAY = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL;
const EMAIL = "sheet.client@gmail.com";
const persona = (p) => fetch(`${GATEWAY}/__google/next`, { method: "POST", body: JSON.stringify(p) });
const cleanup = () => {
  try {
    sql(`create temp table _g as select id from users where email = '${EMAIL}';
         delete from wallet_transactions where user_id in (select id from _g);
         delete from notifications where user_id in (select id from _g);
         delete from client_profiles where user_id in (select id from _g);
         delete from users where id in (select id from _g);
         delete from auth.users where email = '${EMAIL}' or id in (select id from _g);`);
  } catch (e) {
    console.log("   (καθαρισμός δεν ολοκληρώθηκε)", String(e.message).slice(0, 120));
  }
};
cleanup();
await persona({ email: EMAIL, name: "Νέος Πελάτης Φόρμας" });

const region = sql(`select id from regions where name = 'Κυκλάδες'`);
const boat = sql(`select id from boat_types where name = 'Ιστιοπλοϊκό'`);
const url = new URLSearchParams({ roles: "skipper", start: iso(daysFromToday(12)), end: iso(daysFromToday(14)), region, point: "Νάξος", arrival: "Νάξος", boat, party: "4", cabin: "skipper:bunk", lang: "en" });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => { if (hydrationOnly(e, page)) return; if (!e.message.startsWith("e2e:")) errors.push(e.message); });
try {
  // Χωρίς σύνδεση: αποτελέσματα και επιλογή.
  await page.goto(`${BASE}/platform/search?${url}`);
  await page.waitForTimeout(2500);
  let t = await text(page);
  check("χωρίς σύνδεση: φαίνονται αποτελέσματα", /διαθέσιμοι? skipper/.test(t) && (await page.getByRole("button", { name: "Επιλογή", exact: true }).count()) > 0, t.slice(0, 300));
  await page.getByRole("button", { name: "Επιλογή", exact: true }).first().click();
  await page.waitForTimeout(500);
  const before = await text(page);
  check("χωρίς σύνδεση: η επιλογή γίνεται, «Ολοκλήρωση αιτήματος» (όχι «Σύνδεση»)", before.includes("Ολοκλήρωση αιτήματος") && !before.includes("Σύνδεση για αποστολή") && before.includes("1 επιλογή"), before.slice(-500));

  // «Ένα βήμα ακόμα».
  await page.getByRole("button", { name: "Ολοκλήρωση αιτήματος", exact: true }).last().click();
  await page.waitForTimeout(500);
  const sheet = page.locator("[data-signin-sheet]");
  check("ταμπέλα «Ένα βήμα ακόμα» με ένα κουμπί «Συνέχεια με Google», χωρίς πεδία", (await sheet.count()) === 1 && (await sheet.innerText()).includes("Ένα βήμα ακόμα") && (await sheet.locator("input").count()) === 0 && (await sheet.getByRole("button", { name: "Συνέχεια με Google" }).count()) === 1);
  check("δεν έφυγε από τη σελίδα (όχι σελίδα σύνδεσης)", page.url().includes("/platform/search"));
  await shoot(page, "signin-sheet");
  await sheet.getByRole("button", { name: "Συνέχεια με Google" }).click();
  await page.waitForURL((u) => u.pathname === "/platform/search", { timeout: 25000 });
  await page.waitForTimeout(3000);
  t = await text(page);
  check("μετά τη Google: πίσω στα αποτελέσματα, χωρίς φόρμα στοιχείων", !t.includes("Στοιχεία λογαριασμού") && page.url().includes("/platform/search"), page.url());
  check("το αίτημα ανέπαφο: η ίδια επιλογή και οι ίδιες ημερομηνίες", t.includes("1 επιλογή") && /διαθέσιμοι? skipper/.test(t), t.slice(0, 400));
  await shoot(page, "signin-after");
} catch (e) {
  check("η ροή ολοκληρώθηκε", false, e.stack || e.message);
}
check("χωρίς σφάλματα σελίδας", errors.length === 0, errors.join(" | "));
check("ο λογαριασμός: πελάτης, επαληθευμένος, με το email της Google, χωρίς κινητό",
  sql(`select concat_ws('|', phone_verified_at is not null, status, role, email, phone_number) from users where email = '${EMAIL}'`) === `t|active|client|${EMAIL}`);
await browser.close();

// Αγγλικά: η ταμπέλα.
{
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  await c.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  const p = await c.newPage();
  try {
    await p.goto(`${BASE}/platform/search?${url}`);
    await p.waitForTimeout(2500);
    await p.getByRole("button", { name: "Select", exact: true }).first().click();
    await p.waitForTimeout(500);
    await p.getByRole("button", { name: /^Complete request$/ }).last().click();
    await p.waitForTimeout(500);
    const s = p.locator("[data-signin-sheet]");
    check("en: «One more step» με «Continue with Google»", (await s.innerText()).includes("One more step") && (await s.getByRole("button", { name: "Continue with Google" }).count()) === 1, await s.innerText().catch(() => ""));
    await shoot(p, "signin-sheet-en");
  } catch (e) {
    check("en: η ροή ολοκληρώθηκε", false, e.stack || e.message);
  }
  await b.close();
}
cleanup();
finish();
