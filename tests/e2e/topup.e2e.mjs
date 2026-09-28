// Αγορά credits επιτόπου: υπενθύμιση όταν μένει 1 credit, και παράθυρο
// αγοράς τη στιγμή που τα credits δεν φτάνουν για μια αποδοχή.
import { as, go, text, click, check, finish, sql, num } from "./lib.mjs";

const PETROS = "6900002007";
const PID = "a0000000-0000-0000-0000-000000000007";
const setBalance = (n) =>
  sql(`select set_config('platform.trusted', 'true', false);
       insert into wallet_transactions (user_id, type, amount, note)
         select id, 'adjustment', ${n} - wallet_balance, 'Δοκιμή' from users where id = '${PID}' and wallet_balance <> ${n};
       update users set wallet_balance = ${n} where id = '${PID}';`);
const w0 = num(`select wallet_balance from users where id = '${PID}'`);

// Ένα ανοιχτό αίτημα πελάτη προς τον Πέτρο.
const req = sql(`select set_config('platform.trusted', 'true', false);
  with r as (
    insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role,
                                  fee_amount, fee_paid_at, expires_at, party_size, private_cabin)
    select 'a0000000-0000-0000-0000-000000000002', current_date + 60, current_date + 62, id, 'Σαντορίνη', 'Σαντορίνη', 'skipper',
           0, now(), now() + interval '1 day', 2, false
      from regions where name = 'Κυκλάδες' returning id)
  insert into booking_request_pings (booking_request_id, skipper_id)
    select id, 'b0000000-0000-0000-0000-000000000007' from r returning booking_request_id;`)
  .split("\n")
  .find((l) => /^[0-9a-f-]{36}$/.test(l));

setBalance(1);
await as(PETROS, async (page) => {
  await go(page, "/platform/requests");
  const t = await text(page);
  check("με 1 credit: υπενθύμιση", t.includes("Σου έμεινε 1 credit"));
  await page.getByRole("button", { name: "Αγορά credits" }).first().click();
  await page.waitForTimeout(1200);
  const s = await text(page);
  check("η υπενθύμιση ανοίγει το παράθυρο αγοράς με τα πακέτα", s.includes("Διαθέσιμα 1 credit") && s.includes("Professional") && s.includes("Αποστολή αιτήματος"));
  await page.getByRole("button", { name: "Κλείσιμο" }).click();
});

setBalance(0);
await as(PETROS, async (page) => {
  await go(page, "/platform/requests");
  check("με 0 credits: «Δεν έχεις credits»", (await text(page)).includes("Δεν έχεις credits"));
  await click(page, "Διεκδίκηση");
  await page.waitForTimeout(1500);
  const s = await text(page);
  check("η διεκδίκηση ανοίγει το παράθυρο: δεν φτάνουν", s.includes("Δεν έχεις αρκετά credits") && s.includes("Χρειάζεσαι 1 credit"));
  check("προτείνεται το δημοφιλές πακέτο",
    (await page.getByRole("radio", { name: /Professional/ }).getAttribute("aria-checked")) === "true");
  await click(page, "Αποστολή αιτήματος");
  await page.waitForTimeout(2000);
  const d = await text(page);
  check("το αίτημα αγοράς καταχωρήθηκε χωρίς να φύγει από τη σελίδα",
    d.includes("Το αίτημά σου καταχωρήθηκε") && page.url().endsWith("/platform/requests"), page.url());
  await click(page, "Εντάξει");
});
check("το αίτημα αγοράς υπάρχει", num(`select count(*) from credit_purchase_requests where user_id = '${PID}' and status = 'pending' and credits = 5`) === 1);
check("η πρόταση του πελάτη δεν αναλήφθηκε", num(`select count(*) from bookings where client_id = 'a0000000-0000-0000-0000-000000000002' and start_date = current_date + 60`) === 0);

// Επαναφορά.
sql(`update credit_purchase_requests set status = 'cancelled', cancelled_by = 'user' where user_id = '${PID}' and status = 'pending';
     delete from booking_request_pings where booking_request_id = '${req}';
     delete from booking_requests where id = '${req}';`);
setBalance(w0);
finish();
