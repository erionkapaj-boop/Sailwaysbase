// Ανοιχτά αιτήματα (0124): ο επισκέπτης βλέπει τον πίνακα, ο επαγγελματίας
// διεκδικεί (χωρίς χρέωση), ο πελάτης διαλέγει και χρεώνονται και οι δύο,
// ο διαχειριστής προσθέτει εξωτερικό υποψήφιο.
import { chromium } from "playwright";
import { BASE, as, go, text, click, check, finish, num, sql, shoot } from "./lib.mjs";

const client = "a0000000-0000-0000-0000-000000000002";
const kostasId = "a0000000-0000-0000-0000-000000000005";
const kostasName = "Κώστας Υποψήφιος";
const bal = (id) => num(`select wallet_balance from users where id = '${id}'`);

sql(`select set_config('platform.trusted','true',false);
insert into booking_requests (client_id, origin, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role, party_size, note, fee_amount, fee_paid_at, expires_at, board_open, board_posted_at)
select '${client}', 'client', current_date + 12, current_date + 15, r.id, 'Μύκονος', 'Μύκονος', b.id, 'skipper', 4, 'Οικογένεια με παιδιά', 1, now(), now() + interval '9 days', true, now()
from regions r, boat_types b where r.name = 'Κυκλάδες' and b.name = 'Ιστιοπλοϊκό'`);
const wallets0 = { client: bal(client), kostas: bal(kostasId) };
const reqId = sql(`select id from booking_requests where board_open order by created_at desc limit 1`);

// Επισκέπτης: βλέπει το αίτημα, ανώνυμα.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await go(page, "/platform/board");
  await page.waitForTimeout(1200);
  await shoot(page, "board-guest");
  const body = await text(page);
  check("ο επισκέπτης βλέπει το αίτημα", body.includes("Ανοιχτά αιτήματα") && body.includes("Μύκονος") && body.includes("Οικογένεια με παιδιά"));
  check("χωρίς όνομα πελάτη", !body.includes("Μαρία Πελάτη"));
  await click(page, "Διεκδίκηση");
  await page.waitForTimeout(500);
  check("ζητά εγγραφή μόνο στη διεκδίκηση", (await text(page)).includes("Εγγραφή για διεκδίκηση"));
  check("η διεκδίκηση περιμένει στη συσκευή", (await page.evaluate(() => localStorage.getItem("sf_pending_claim"))) !== null);
  // Αγγλικά: ο πίνακας χωρίς ελληνικά γράμματα (εκτός από το κείμενο του πελάτη).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  const en = await ctx.newPage();
  await go(en, "/platform/board");
  await en.waitForTimeout(1200);
  const enText = await en.evaluate(() => {
    document.querySelectorAll("[data-user-text]").forEach((n) => n.remove());
    return document.body.innerText;
  });
  await shoot(en, "board-guest-en");
  check("αγγλικά: ο πίνακας έχει κάρτα και χωρίς ελληνικά γράμματα", enText.includes("Open requests") && enText.includes("Mykonos") && !/[\u0370-\u03ff]/.test(enText.replace("Αθήνα, Ελλάδα", "")), enText.slice(150, 700));
  await ctx.close();
  await page.close();
}
await browser.close();

// Επαγγελματίας με credit: διεκδικεί, χωρίς χρέωση.
const kostas0 = bal(kostasId);
await as("6900002005", async (page) => {
  await go(page, "/platform/board");
  await page.waitForTimeout(1200);
  await click(page, "Διεκδίκηση");
  await page.waitForTimeout(1500);
  await shoot(page, "board-claimed");
  check("η διεκδίκηση καταχωρήθηκε", (await text(page)).includes("Διεκδίκησες"));
  check("στη βάση, ενεργή", num(`select count(*) from open_request_claims where request_id = '${reqId}' and status = 'active'`) === 1);
  check("χωρίς χρέωση", bal(kostasId) === kostas0);
  await page.getByRole("button", { name: "Οι διεκδικήσεις μου", exact: true }).click();
  await page.waitForTimeout(600);
  check("στις διεκδικήσεις μου", (await text(page)).includes("Ενεργή"));
});

// Πελάτισσα: βλέπει τον ανώνυμο διεκδικητή και διαλέγει.
const client0 = bal(client);
await as("6900002002", async (page) => {
  await go(page, "/platform/requests");
  await page.waitForTimeout(1500);
  await shoot(page, "board-client-panel");
  const body = (await text(page)).toLowerCase();
  check("βλέπει το αίτημα και τον διεκδικητή", body.includes("ανοιχτό αίτημα") && body.includes("δεσμευμένο 1 credit"));
  check("ανώνυμα: όχι όνομα επαγγελματία", !body.includes(kostasName));
  await click(page, "Επιλογή");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Επιλογή", exact: true }).last().click();
  await page.waitForTimeout(2000);
  check("χρεώθηκε 1 credit η πελάτισσα", bal(client) === client0 - 1);
  check("και 1 ο επαγγελματίας", bal(kostasId) === kostas0 - 1);
  check("κράτηση επιβεβαιωμένη", num(`select count(*) from bookings where booking_request_id = '${reqId}' and status = 'confirmed'`) === 1);
});

// Διαχειριστής: εξωτερικός υποψήφιος σε δεύτερο αίτημα.
sql(`select set_config('platform.trusted','true',false);
insert into booking_requests (client_id, origin, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role, fee_amount, fee_paid_at, expires_at, board_open, board_posted_at)
select '${client}', 'client', current_date + 30, current_date + 33, r.id, 'Πάρος', 'Πάρος', b.id, 'hostess', 1, now(), now() + interval '9 days', true, now()
from regions r, boat_types b where r.name = 'Κυκλάδες' and b.name = 'Ιστιοπλοϊκό'`);
await as("6900002001", async (page) => {
  await go(page, "/platform/admin/board");
  await page.waitForTimeout(1500);
  check("η διαχείριση βλέπει τα αιτήματα", (await text(page)).includes("Προσθήκη εξωτερικού υποψηφίου"));
  await shoot(page, "board-admin");
  await page.getByRole("button", { name: "Προσθήκη εξωτερικού υποψηφίου", exact: true }).first().click();
  await page.getByLabel("Όνομα").fill("Δημήτρης Φίλος");
  await page.getByLabel("Τηλέφωνο").fill("+306911111111");
  await click(page, "Προσθήκη");
  await page.waitForTimeout(1500);
  check("προστέθηκε εξωτερικός υποψήφιος", num(`select count(*) from open_request_claims where external_name = 'Δημήτρης Φίλος' and status = 'active'`) === 1);
});

await as("6900002002", async (page) => {
  await go(page, "/platform/board/new");
  await shoot(page, "board-new");
});

// Τα υπόλοιπα τεστ περιμένουν τα credits και τα αιτήματα όπως ήταν: καθαρισμός.
sql(`select set_config('platform.trusted','true',false);
delete from wallet_transactions where related_booking_request_id in (select id from booking_requests where board_open);
delete from messages where booking_id in (select b.id from bookings b join booking_requests r on r.id = b.booking_request_id where r.board_open);
delete from bookings where booking_request_id in (select id from booking_requests where board_open);
delete from notifications where kind like 'board_%' or data ? 'request_id' and data ->> 'request_id' in (select id::text from booking_requests where board_open);
delete from booking_requests where board_open;
update users set wallet_balance = ${wallets0.client} where id = '${client}';
update users set wallet_balance = ${wallets0.kostas} where id = '${kostasId}';`);
check("καθαρισμός: υπόλοιπα και αιτήματα όπως πριν", bal(client) === wallets0.client && bal(kostasId) === wallets0.kostas && num("select count(*) from booking_requests where board_open") === 0);

finish();
