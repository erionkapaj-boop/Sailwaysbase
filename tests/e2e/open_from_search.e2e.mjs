// Αίτημα που μένει ανοιχτό από την αναζήτηση (0125): δεν απορρίπτεται ποτέ
// επειδή δεν υπάρχει διαθέσιμος επαγγελματίας. Τρεις περιπτώσεις:
//   1. η αναζήτηση δεν βρίσκει κανέναν → «Το αίτημά σου είναι έτοιμο», ολοκλήρωση, ανοιχτό αίτημα
//   2. βρίσκει, ο πελάτης δεν θέλει κανέναν → «Άφησε το αίτημα ανοιχτό»
//   3. ζητά 2 θέσεις, διαλέγει 1 → 1 αίτημα στον επαγγελματία + 1 ανοιχτό
import { as, go, text, click, check, finish, sql, num, daysFromToday, iso, shoot } from "./lib.mjs";

const MARIA = "6900002002";
const CLIENT = "a0000000-0000-0000-0000-000000000002";
const region = () => sql(`select id from regions where name = 'Κυκλάδες'`);
const boat = sql(`select id from boat_types where name = 'Ιστιοπλοϊκό'`);
const trusted = (q) => sql(`select set_config('platform.trusted', 'true', false); ${q}`);
const t0 = sql(`select now()`);
const wallet0 = num(`select wallet_balance from users where id = '${CLIENT}'`);

// Αρκετά credits για τις τέσσερις θέσεις του σεναρίου, με κίνηση στο ιστορικό ώστε το υπόλοιπο να συμφωνεί.
trusted(`update users set wallet_balance = wallet_balance + 6 where id = '${CLIENT}';
         insert into wallet_transactions (user_id, type, amount, note) values ('${CLIENT}', 'adjustment', 6, 'e2e open_from_search');`);
trusted(`delete from request_drafts where user_id = '${CLIENT}'`);

function url(role, from, to, withBoat) {
  const q = new URLSearchParams({
    roles: role, start: iso(daysFromToday(from)), end: iso(daysFromToday(to)), region: region(),
    point: "Νάξος", arrival: "Νάξος", boat: withBoat ? boat : "", party: "4", cabin: "true",
  });
  return `/platform/search?${q}`;
}
const openRows = (role) => num(`select count(*) from booking_requests where client_id = '${CLIENT}' and board_open and crew_role = '${role}' and status = 'open'`);

await as(MARIA, async (page) => {
  console.log("\n== 1. Καμία διαθέσιμη hostess: το αίτημα είναι έτοιμο και ολοκληρώνεται");
  await go(page, url("hostess", 200, 203, false));
  await page.waitForTimeout(1500);
  let t = await text(page);
  await shoot(page, "open-zero");
  check("θετικό μήνυμα: το αίτημα είναι έτοιμο", t.includes("Το αίτημά σου είναι έτοιμο"), t.slice(0, 500));
  check("δεν λέει ότι δεν βρέθηκε κανείς", !/Κανένας διαθέσιμος|δεν υπάρχουν|Δεν έχουμε/.test(t));
  check("υπάρχει η ολοκλήρωση, με ένα ανοιχτό αίτημα", t.includes("Ολοκλήρωση αιτήματος") && t.includes("Ανοιχτό αίτημα"));
  await click(page, "Ολοκλήρωση αιτήματος");
  await page.waitForTimeout(2500);
  await shoot(page, "open-done");
  t = await text(page);
  check("επιβεβαίωση: το αίτημα είναι ανοιχτό", t.includes("Το αίτημά σου είναι ανοιχτό") && t.includes("Μένει ανοιχτό μέχρι την ημερομηνία έναρξης"), t.slice(0, 600));
  check("στη βάση: ανοιχτό, δεσμευμένο, χωρίς αποστολή σε κανέναν",
    openRows("hostess") === 1 &&
    num(`select count(*) from booking_requests r where r.client_id = '${CLIENT}' and r.board_open and r.crew_role = 'hostess' and r.fee_paid_at is not null and r.client_charged_at is null and r.expires_at = (r.start_date + 1)::timestamptz and not exists (select 1 from booking_request_pings p where p.booking_request_id = r.id)`) === 1);

  console.log("\n== 2. Βρέθηκαν skippers, ο πελάτης τους αφήνει και κρατά το αίτημα ανοιχτό");
  await go(page, url("skipper", 12, 14, true));
  await page.waitForTimeout(2000);
  t = await text(page);
  check("υπάρχουν διαθέσιμοι και η επιλογή «άφησε ανοιχτό»", /διαθέσιμοι? skipper/.test(t) && t.includes("Άφησε το αίτημα ανοιχτό"), t.slice(0, 400));
  check("δεν υπάρχει ολοκλήρωση πριν από οποιαδήποτε απόφαση", !t.includes("Ολοκλήρωση αιτήματος"));
  await page.locator("[data-leave-open]").click();
  await page.waitForTimeout(500);
  t = await text(page);
  await page.locator("[data-leave-open], [data-no-results]").first().scrollIntoViewIfNeeded().catch(() => {});
  await shoot(page, "open-leave");
  check("εξηγεί ότι θα μείνει ανοιχτό", t.includes("Το αίτημά σου θα μείνει ανοιχτό") && t.includes("Ολοκλήρωση αιτήματος"));
  await click(page, "Ολοκλήρωση αιτήματος");
  await page.waitForTimeout(2500);
  check("το αίτημα skipper είναι ανοιχτό, χωρίς αποστολή", (await text(page)).includes("Το αίτημά σου είναι ανοιχτό") &&
    num(`select count(*) from booking_requests r where r.client_id = '${CLIENT}' and r.board_open and r.crew_role = 'skipper' and not exists (select 1 from booking_request_pings p where p.booking_request_id = r.id)`) === 1);

  console.log("\n== 3. Δύο θέσεις, μία επιλογή: 1 αίτημα σε επαγγελματία, 1 ανοιχτό");
  await go(page, url("skipper", 20, 22, true));
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /^Περισσότερες θέσεις/ }).click();
  await page.getByRole("button", { name: "Επιλογή", exact: true }).first().click();
  await page.waitForTimeout(500);
  t = await text(page);
  await shoot(page, "open-mixed");
  check("η σύνοψη λέει ότι η άλλη θέση μένει ανοιχτή", t.includes("Η άλλη θέση μένει ανοιχτή") && t.includes("1 επιλογή"), t.slice(-900));
  await click(page, "Ολοκλήρωση αιτήματος");
  await page.waitForTimeout(3000);
  t = await text(page);
  check("στάλθηκαν 2 αιτήματα, το ένα ανοιχτό", t.includes("Στάλθηκαν 2 αιτήματα") && t.includes("ανοιχτό"), t.slice(0, 500));
  check("στη βάση: ένα με αποστολή, ένα στον πίνακα",
    num(`select count(*) from booking_requests r where r.client_id = '${CLIENT}' and r.crew_role = 'skipper' and r.start_date = '${iso(daysFromToday(20))}' and not r.board_open and exists (select 1 from booking_request_pings p where p.booking_request_id = r.id)`) === 1 &&
    num(`select count(*) from booking_requests r where r.client_id = '${CLIENT}' and r.crew_role = 'skipper' and r.start_date = '${iso(daysFromToday(20))}' and r.board_open`) === 1);
  await go(page, "/platform/requests");
  await page.waitForTimeout(1500);
  check("στα Αιτήματα φαίνονται και οι δύο μορφές", (await text(page)).toLowerCase().includes("ανοιχτό αίτημα"));
});

// Καθαρισμός: τα επόμενα τεστ περιμένουν τα credits και τα αιτήματα όπως ήταν.
trusted(`delete from request_drafts where user_id = '${CLIENT}';
         delete from wallet_transactions where related_booking_request_id in (select id from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}');
         delete from notifications where data ->> 'request_id' in (select id::text from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}');
         delete from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}';
         delete from wallet_transactions where user_id = '${CLIENT}' and note = 'e2e open_from_search';
         update users set wallet_balance = ${wallet0} where id = '${CLIENT}';`);
check("καθαρισμός: υπόλοιπο, αιτήματα και αποστολές όπως πριν", num(`select wallet_balance from users where id = '${CLIENT}'`) === wallet0 && num(`select count(*) from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}'`) === 0);

finish();
