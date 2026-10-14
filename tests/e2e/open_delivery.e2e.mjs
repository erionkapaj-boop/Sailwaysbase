// Ανοιχτή μεταφορά σκάφους (0126): ο πελάτης την αφήνει ανοιχτή (με ή χωρίς
// διαθέσιμους), ο επαγγελματίας τη διεκδικεί από τον δημόσιο πίνακα, ο πελάτης
// διαλέγει και ο επαγγελματίας χρεώνεται μόνο τότε.
import { chromium } from "playwright";
import { BASE, as, go, text, click, check, finish, sql, num, pickDay, daysFromToday, iso, shoot } from "./lib.mjs";

const MARIA = "6900002002", KOSTAS = "6900002005";
const CLIENT = "a0000000-0000-0000-0000-000000000002";
const KOSTAS_ID = "a0000000-0000-0000-0000-000000000005";
const SP_GIORGOS = "b0000000-0000-0000-0000-000000000004";
const trusted = (q) => sql(`select set_config('platform.trusted','true',false); ${q}`);
const bal = (id) => num(`select wallet_balance from users where id = '${id}'`);
const t0 = sql(`select now()`);
const wallets0 = { client: bal(CLIENT), kostas: bal(KOSTAS_ID) };

// Ένας διαθέσιμος για μεταφορές (ώστε να υπάρχει λίστα και να δοκιμαστεί το «άφησε ανοιχτό»).
trusted(`delete from request_drafts where user_id = '${CLIENT}';
         insert into delivery_availability_windows (skipper_id, crew_role, start_date, end_date) values ('${SP_GIORGOS}', 'skipper', current_date + 1, current_date + 90)`);

async function fillForm(page, from, to, miles, days) {
  await go(page, "/platform/delivery");
  await click(page, "Συνέχεια");
  await page.waitForTimeout(500);
  await page.getByPlaceholder("π.χ. Άλιμος").fill(from);
  await page.getByPlaceholder("π.χ. Ρόδος").fill(to);
  await page.getByPlaceholder("π.χ. 250").fill(String(miles));
  await page.getByRole("button", { name: /Επίλεξε|ημερομηνία|Αναχώρηση/i }).first().click().catch(() => {});
  await pickDay(page, daysFromToday(days));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Συνέχεια", exact: true }).last().click();
  await page.waitForTimeout(2500);
}

await as(MARIA, async (page) => {
  console.log("\n== 1. Υπάρχει διαθέσιμος skipper, ο πελάτης δεν θέλει κανέναν: άφησε το ανοιχτό");
  await fillForm(page, "Λαύριο", "Μάλτα", 2000, 30);
  await page.getByPlaceholder("π.χ. 1500").fill("3000");
  let t = await text(page);
  check("υπάρχει λίστα και η επιλογή «άφησε ανοιχτό»", t.includes("Διαθέσιμοι για μεταφορές") && t.includes("Άφησε το αίτημα ανοιχτό"), t.slice(0, 400));
  await page.locator("[data-leave-open]").first().click();
  await page.waitForTimeout(400);
  await shoot(page, "open-delivery-leave");
  t = await text(page);
  check("εξηγεί ότι θα μείνει ανοιχτό, και υπάρχει η ολοκλήρωση", t.includes("Το αίτημά σου θα μείνει ανοιχτό") && t.includes("Ολοκλήρωση αιτήματος"));
  await click(page, "Ολοκλήρωση αιτήματος");
  await page.waitForTimeout(2500);
  await shoot(page, "open-delivery-done");
  t = await text(page);
  check("επιβεβαίωση: το αίτημα είναι ανοιχτό, χωρίς αποστολή", t.includes("είναι ανοιχτό") && num(`select count(*) from delivery_role_requests where board_open and status = 'open' and not exists (select 1 from delivery_role_pings p where p.delivery_role_request_id = delivery_role_requests.id)`) === 1, t.slice(0, 500));
  check("ο πελάτης χρεώθηκε το τέλος μία φορά (7 credits)", bal(CLIENT) === wallets0.client - 7);

  console.log("\n== 2. Καμία διαθέσιμη hostess: το αίτημα είναι έτοιμο και ολοκληρώνεται");
  await fillForm(page, "Λαύριο", "Σκιάθος", 120, 45);
  await page.getByRole("button", { name: "+ Ναύτης", exact: true }).click().catch(() => {});
  await page.waitForTimeout(800);
  await page.locator("input[type=number]").last().fill("500");
  t = await text(page);
  check("για τον ναύτη: «Το αίτημά σου είναι έτοιμο», όχι «κανείς»", t.includes("Το αίτημά σου είναι έτοιμο") && !/Κανείς δεν έχει δηλώσει/.test(t.split("Ναύτης").pop() || ""), t.slice(-600));
});

console.log("\n== 3. Ο πίνακας: ο επισκέπτης βλέπει τη μεταφορά");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await go(page, "/platform/board");
  await page.locator("[data-board-kind=delivery]").click();
  await page.waitForTimeout(1500);
  const t = await text(page);
  check("η μεταφορά φαίνεται στον πίνακα (Μεταφορές)", t.includes("Λαύριο → Μάλτα") && t.includes("3000€"), t.slice(0, 500));
  await shoot(page, "open-delivery-board");
  await page.close();
}
await browser.close();

const kostas0 = bal(KOSTAS_ID);
await as(KOSTAS, async (page) => {
  console.log("\n== 4. Ο επαγγελματίας διεκδικεί, χωρίς χρέωση");
  await go(page, "/platform/board");
  await page.locator("[data-board-kind=delivery]").click();
  await page.waitForTimeout(1500);
  await click(page, "Διεκδίκηση");
  await page.waitForTimeout(1800);
  check("η διεκδίκηση καταχωρήθηκε", (await text(page)).includes("Διεκδίκησες"));
  check("χωρίς χρέωση", bal(KOSTAS_ID) === kostas0 && num(`select count(*) from delivery_open_claims where status = 'active'`) === 1);
});

await as(MARIA, async (page) => {
  console.log("\n== 5. Ο πελάτης διαλέγει");
  await go(page, "/platform/delivery/requests");
  await page.waitForTimeout(1200);
  const t = (await text(page)).toLowerCase();
  check("βλέπει τον διεκδικητή", t.includes("ανοιχτό αίτημα") && t.includes("διεκδικητές"));
  await shoot(page, "open-delivery-claims");
  await click(page, "Επιλογή");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Επιλογή", exact: true }).last().click();
  await page.waitForTimeout(2200);
  check("η μεταφορά επιβεβαιώθηκε με τον Κώστα", num(`select count(*) from delivery_bookings where status = 'confirmed' and skipper_id = 'b0000000-0000-0000-0000-000000000005'`) === 1);
  check("ο Κώστας χρεώθηκε μία φορά (το τέλος του), ο πελάτης καμία νέα χρέωση",
    bal(KOSTAS_ID) < kostas0 && bal(CLIENT) === wallets0.client - 7 - num(`select client_fee from delivery_role_requests where crew_role = 'deckhand' and board_open limit 1`) );
});

// Καθαρισμός: τα επόμενα τεστ περιμένουν τα credits και τα δεδομένα όπως ήταν.
trusted(`delete from request_drafts where user_id = '${CLIENT}';
         delete from delivery_availability_windows where skipper_id = '${SP_GIORGOS}' and created_at >= '${t0}';
         delete from wallet_transactions where related_delivery_role_request_id in (select rr.id from delivery_role_requests rr join delivery_requests d on d.id = rr.delivery_request_id where d.client_id = '${CLIENT}' and d.created_at >= '${t0}');
         delete from notifications where data ->> 'request_id' in (select rr.id::text from delivery_role_requests rr join delivery_requests d on d.id = rr.delivery_request_id where d.client_id = '${CLIENT}' and d.created_at >= '${t0}');
         delete from delivery_bookings where delivery_request_id in (select id from delivery_requests where client_id = '${CLIENT}' and created_at >= '${t0}');
         delete from delivery_requests where client_id = '${CLIENT}' and created_at >= '${t0}';
         update users set wallet_balance = ${wallets0.client} where id = '${CLIENT}';
         update users set wallet_balance = ${wallets0.kostas} where id = '${KOSTAS_ID}';`);
check("καθαρισμός: υπόλοιπα και δεδομένα όπως πριν",
  bal(CLIENT) === wallets0.client && bal(KOSTAS_ID) === wallets0.kostas &&
  num(`select count(*) from delivery_requests where client_id = '${CLIENT}' and created_at >= '${t0}'`) === 0);

finish();
