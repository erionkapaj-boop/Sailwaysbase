// 0112: ο υπάλληλος βλέπει μόνο τα καθημερινά· ο ιδιοκτήτης όλα, και βάζει
// credits και στον δικό του λογαριασμό (επαγγελματίας με is_owner, όπως ο
// λογαριασμός του ιδιοκτήτη στην παραγωγή).
import { as, go, text, click, check, finish, sql, num } from "./lib.mjs";

const SOFIA = "6900002008", NIKOS = "6900002003";
const trusted = (q) => sql(`select set_config('platform.trusted', 'true', false); ${q}`);
trusted(`update users set is_staff_admin = true where phone_number = '+${"30" + SOFIA}';
         update users set is_owner = true, is_staff_admin = true where phone_number = '+${"30" + NIKOS}';`);

await as(SOFIA, async (page) => {
  await go(page, "/platform/admin");
  await page.getByRole("button", { name: /μενού|Μενού|menu/i }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  const t = await text(page);
  check("υπάλληλος: βλέπει τη διαχείριση", t.includes("Εκκρεμότητες"));
  check("υπάλληλος: όχι Οικονομικά, Ρυθμίσεις, Δοκιμές στο μενού",
    !t.includes("Οικονομικά") && !t.includes("Ρυθμίσεις") && !t.includes("Ghost Mode"), t.slice(0, 600));
  check("υπάλληλος: όχι πωλήσεις", !t.includes("Πωλήσεις"));
  await go(page, "/platform/admin/finance");
  check("υπάλληλος: τα Οικονομικά κλειστά", (await text(page)).includes("Πρόσβαση μόνο για τον ιδιοκτήτη"));
  await go(page, "/platform/admin/settings");
  check("υπάλληλος: οι Ρυθμίσεις κλειστές", (await text(page)).includes("Πρόσβαση μόνο για τον ιδιοκτήτη"));
  await go(page, "/platform/admin/user/a0000000-0000-0000-0000-000000000002?tab=actions");
  const a = await text(page);
  check("υπάλληλος: σε πελάτη, χωρίς διαγραφή και προχωρημένες ρυθμίσεις",
    !a.includes("Διαγραφή λογαριασμού") && !a.includes("Δικαιώματα διαχειριστή"), a.slice(0, 600));
});

const n0 = num(`select wallet_balance from users where phone_number = '+30${NIKOS}'`);
await as(NIKOS, async (page) => {
  await go(page, "/platform/admin/finance");
  await page.getByPlaceholder("Τηλέφωνο χρήστη").fill(NIKOS);
  await click(page, "Εύρεση");
  await page.waitForTimeout(800);
  await page.getByLabel("Πακέτο").selectOption("professional");
  await click(page, "Καταχώριση αγοράς");
  await page.waitForTimeout(1500);
  const t = await text(page);
  check("ιδιοκτήτης: αγορά 5 credits στον δικό του λογαριασμό", t.includes(`Νέο υπόλοιπο ${n0 + 5} credits`), t.slice(0, 600));
});
check("και στη βάση", num(`select wallet_balance from users where phone_number = '+30${NIKOS}'`) === n0 + 5);

// Επαναφορά για τα επόμενα σενάρια.
trusted(`update users set is_staff_admin = false where phone_number = '+30${SOFIA}';
         update users set is_owner = false, is_staff_admin = false where phone_number = '+30${NIKOS}';
         insert into wallet_transactions (user_id, type, amount, note)
           select id, 'adjustment', -5, 'Επαναφορά δοκιμής' from users where phone_number = '+30${NIKOS}';
         update users set wallet_balance = wallet_balance - 5 where phone_number = '+30${NIKOS}';`);

finish();
