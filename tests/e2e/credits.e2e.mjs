// Credits (0110), όλες οι οικονομικές κινήσεις μέσα από την πραγματική
// εφαρμογή, με κάθε βήμα ελεγμένο και στην οθόνη και στη βάση:
// πελάτης χωρίς credits → αγορά πακέτου → αίτημα → ακύρωση με επιστροφή →
// λήξη με επιστροφή → επαγγελματίας χωρίς credits → δώρο → ανάληψη →
// μεταφορά σκάφους (υπολογισμός από τα μίλια) → δωρεάν περίοδος για πελάτες →
// δώρο εγγραφής → αλλαγή τιμής πακέτου → πωλήσεις → ισοζύγιο.
import { as, go, text, click, check, finish, sql, num, pickDay, daysFromToday, iso } from "./lib.mjs";

const ADMIN = "6900002001", MARIA = "6900002002", NIKOS = "6900002003", GIORGOS = "6900002004", ELENI = "6900002006";
const wallet = (name) => num(`select wallet_balance from users where full_name = '${name}'`);
const txns = (name, type) =>
  num(`select count(*) from wallet_transactions t join users u on u.id = t.user_id
       where u.full_name = '${name}' and t.type = '${type}' and t.unit = 'credit'`);
const step = (s) => console.log(`\n== ${s}`);

async function findUser(page, phone) {
  await page.getByPlaceholder("Τηλέφωνο χρήστη").fill(phone);
  await click(page, "Εύρεση");
  await page.waitForTimeout(800);
}

async function correct(page, phone, amount, reason) {
  page.on("dialog", (d) => d.accept());
  await go(page, "/platform/admin/finance");
  await click(page, "Διόρθωση (αφαίρεση)");
  await findUser(page, phone);
  await page.getByPlaceholder("Credits προς αφαίρεση").fill(String(amount));
  await page.getByPlaceholder("Λόγος διόρθωσης (υποχρεωτικό)").fill(reason);
  await click(page, "Καταχώριση αφαίρεσης");
  await page.waitForTimeout(1200);
}

async function setSetting(page, label, value) {
  await go(page, "/platform/admin/settings");
  const row = page.locator("div").filter({ has: page.getByText(label, { exact: true }) }).filter({ has: page.locator("input") }).last();
  await row.locator("input").fill(String(value));
  await row.getByRole("button", { name: "Αποθήκευση" }).click();
  await page.waitForTimeout(1200);
}

// Αναζήτηση στις Κυκλάδες και επιλογή του επαγγελματία με την τιμή `price`.
async function searchAndPick(page, from, to, price) {
  await go(page, "/platform/search");
  await pickDay(page, from);
  await pickDay(page, to);
  const selects = page.locator("select");
  await selects.nth(0).selectOption({ label: "Κυκλάδες" });
  await page.fill("input[placeholder='π.χ. Καλλιθέα']", "Νάξος");
  await page.locator("input[type=number]").fill("4");
  await selects.nth(2).selectOption({ label: "Ναι" });
  await selects.nth(3).selectOption({ label: "Ιστιοπλοϊκό" });
  await page.click("button[type=submit]");
  await page.waitForTimeout(2500);
  await page.locator("div").filter({ hasText: `${price}€` }).filter({ has: page.getByRole("button", { name: "Επιλογή", exact: true }) }).last()
    .getByRole("button", { name: "Επιλογή", exact: true }).click();
  await page.waitForTimeout(500);
}

// Η κατάσταση πριν το σενάριο, για να επανέλθει στο τέλος: τα επόμενα
// σενάρια (π.χ. αντικατάσταση) περιμένουν καθαρή βάση.
sql(`drop table if exists e2e_credits_start;
     create table e2e_credits_start as select id, wallet_balance, now() as t0 from users`);

const maria0 = wallet("Μαρία Πελάτη");
const nikos0 = wallet("Νίκος Αρχικός");

// ---------------------------------------------------------------------------
step("1. Ο διαχειριστής μηδενίζει την πελάτισσα (διόρθωση με λόγο)");
await as(ADMIN, async (page) => {
  await correct(page, MARIA, maria0, "Δοκιμή credits: από το μηδέν");
});
check("η πελάτισσα έχει 0 credits", wallet("Μαρία Πελάτη") === 0);

step("2. Η πελάτισσα χωρίς credits: βλέπει πακέτα, δεν μπορεί να στείλει αίτημα");
await as(MARIA, async (page) => {
  await go(page, "/platform/wallet");
  const t = await text(page);
  check("σελίδα Credits: 0 credits", t.includes("0 credits"));
  check("και τα τρία πακέτα με τις τιμές", t.includes("Starter") && t.includes("90€") && t.includes("Professional") && t.includes("200€") && t.includes("350€"));
  check("η τιμή του ενός credit", t.includes("50€"));
  check("χωρίς λέξη «πορτοφόλι»", !/πορτοφόλ/i.test(t));

  await searchAndPick(page, daysFromToday(10), daysFromToday(12), 250);
  const c = await text(page);
  check("το καλάθι γράφει 1 credit", c.includes("1 credit"));
  await click(page, "Αποστολή αιτημάτων");
  await page.waitForTimeout(2000);
  check("μήνυμα: δεν έχεις αρκετά credits", (await text(page)).includes("Δεν έχεις αρκετά credits"));
});
check("κανένα αίτημα δεν πληρώθηκε", num(`select count(*) from booking_requests where client_id = 'a0000000-0000-0000-0000-000000000002' and fee_paid_at is not null`) === 0);
check("το υπόλοιπο έμεινε 0", wallet("Μαρία Πελάτη") === 0);

step("3. Ο διαχειριστής καταχωρεί αγορά Starter (2 credits, 90€)");
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/finance");
  await findUser(page, MARIA);
  await page.getByLabel("Πακέτο").selectOption("starter");
  check("τα πεδία συμπληρώθηκαν από το πακέτο",
    (await page.getByPlaceholder("Credits", { exact: true }).inputValue()) === "2" && (await page.getByPlaceholder("Ποσό €").inputValue()) === "90");
  await click(page, "Καταχώριση αγοράς");
  await page.waitForTimeout(1200);
  check("επιβεβαίωση με νέο υπόλοιπο", (await text(page)).includes("Νέο υπόλοιπο 2 credits"));
});
check("2 credits στην πελάτισσα", wallet("Μαρία Πελάτη") === 2);
check("η αγορά κρατά τα 90€", num(`select count(*) from wallet_transactions where user_id = 'a0000000-0000-0000-0000-000000000002' and type = 'purchase' and amount = 2 and price_eur = 90`) === 1);

step("4. Η πελάτισσα στέλνει δύο αιτήματα (1 credit το καθένα)");
await as(MARIA, async (page) => {
  await searchAndPick(page, daysFromToday(10), daysFromToday(12), 250);
  await click(page, "Αποστολή αιτημάτων");
  await page.waitForTimeout(2500);
  check("πρώτο αίτημα στάλθηκε", (await text(page)).includes("Το αίτημά σου στάλθηκε"));
  await searchAndPick(page, daysFromToday(20), daysFromToday(22), 300);
  await click(page, "Αποστολή αιτημάτων");
  await page.waitForTimeout(2500);
  check("δεύτερο αίτημα στάλθηκε", (await text(page)).includes("Το αίτημά σου στάλθηκε"));
  await go(page, "/platform/wallet");
  const t = await text(page);
  check("ιστορικό: δύο φορές «Credits για αίτημα»", (t.match(/Credits για αίτημα/g) || []).length === 2);
  check("υπόλοιπο 0 credits", t.includes("0 credits"));
});
check("η βάση: 0 credits, 2 κινήσεις αιτήματος", wallet("Μαρία Πελάτη") === 0 && txns("Μαρία Πελάτη", "request_fee") === 2);

step("5. Ακυρώνει το δεύτερο αίτημα όσο είναι ανοιχτό → επιστροφή");
await as(MARIA, async (page) => {
  page.on("dialog", (d) => d.accept());
  await go(page, "/platform/requests");
  const panels = page.getByRole("button", { name: /Νάξος/ });
  await panels.first().click();
  await page.waitForTimeout(800);
  // Το πιο πρόσφατο είναι πρώτο: αυτό της Ελένης (ημέρα +20).
  await click(page, "Ακύρωση ολόκληρου αιτήματος");
  await page.waitForTimeout(600);
  const confirmBtn = page.getByRole("button", { name: /^(Συνέχεια|Ναι)$/ });
  if (await confirmBtn.count()) await confirmBtn.last().click();
  await page.waitForTimeout(2000);
  const t5 = await text(page);
  check("μήνυμα επιστροφής σε credits", t5.includes("Επιστράφηκε 1 credit"), t5.slice(0, 800));
});
check("επιστροφή 1 credit", wallet("Μαρία Πελάτη") === 1 && txns("Μαρία Πελάτη", "refund_credit") === 1);

step("6. Ο Νίκος χωρίς credits δεν αναλαμβάνει· με δώρο 1 credit αναλαμβάνει");
await as(ADMIN, async (page) => {
  await correct(page, NIKOS, nikos0, "Δοκιμή credits: επαγγελματίας από το μηδέν");
});
await as(NIKOS, async (page) => {
  await go(page, "/platform/requests");
  check("βλέπει ότι η ανάληψη χρειάζεται 1 credit", (await text(page)).includes("1 credit"));
  await click(page, "Διεκδίκηση");
  await page.waitForTimeout(2000);
  check("μήνυμα: δεν έχεις αρκετά credits", (await text(page)).includes("Δεν έχεις αρκετά credits"));
});
check("καμία κράτηση ακόμα", num(`select count(*) from bookings where client_id = 'a0000000-0000-0000-0000-000000000002'`) === 0);
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/finance");
  await click(page, "Δώρο");
  await findUser(page, NIKOS);
  await page.getByPlaceholder("Credits", { exact: true }).fill("1");
  await page.getByPlaceholder("Σημείωση").fill("Δοκιμαστικό credit");
  await click(page, "Καταχώριση δώρου");
  await page.waitForTimeout(1200);
});
check("ο Νίκος έχει 1 credit", wallet("Νίκος Αρχικός") === 1);
await as(NIKOS, async (page) => {
  await go(page, "/platform/requests");
  await click(page, "Διεκδίκηση");
  await page.waitForTimeout(2500);
  await go(page, "/platform/wallet");
  const t = await text(page);
  check("ιστορικό επαγγελματία: δώρο και ανάληψη", t.includes("Πίστωση credits") && t.includes("Credits για ανάληψη"));
  check("η σημείωση του δώρου φαίνεται", t.includes("Δοκιμαστικό credit"));
});
check("η κράτηση επιβεβαιώθηκε", num(`select count(*) from bookings where client_id = 'a0000000-0000-0000-0000-000000000002' and status = 'confirmed'`) === 1);
check("ο Νίκος χρησιμοποίησε 1 credit", wallet("Νίκος Αρχικός") === 0 && txns("Νίκος Αρχικός", "claim_fee") === 1);

step("7. Αίτημα που λήγει χωρίς ανάληψη → επιστροφή");
await as(MARIA, async (page) => {
  await searchAndPick(page, daysFromToday(25), daysFromToday(27), 300);
  await click(page, "Αποστολή αιτημάτων");
  await page.waitForTimeout(2500);
});
check("χρησιμοποιήθηκε το τελευταίο credit", wallet("Μαρία Πελάτη") === 0);
sql(`update booking_requests set expires_at = now() - interval '1 minute' where client_id = 'a0000000-0000-0000-0000-000000000002' and status = 'open'`);
sql(`select expire_stale_booking_requests()`);
check("έληξε και επιστράφηκε 1 credit", wallet("Μαρία Πελάτη") === 1 && txns("Μαρία Πελάτη", "refund_credit") === 2);
await as(MARIA, async (page) => {
  await go(page, "/platform/requests");
  check("η κατάσταση γράφει credits", (await text(page)).includes("Έληξε, τα credits επιστράφηκαν"));
  await page.getByRole("button", { name: /^Ειδοποιήσεις/ }).first().click();
  await page.waitForTimeout(1500);
  const n7 = await text(page);
  check("ειδοποίηση επιστροφής σε credits", n7.includes("επιστράφηκε 1 credit"), n7.slice(0, 800));
});

step("8. Μεταφορά σκάφους: τα credits τα υπολογίζει η πλατφόρμα");
sql(`insert into delivery_availability_windows (skipper_id, crew_role, start_date, end_date)
     values ('b0000000-0000-0000-0000-000000000004', 'skipper', current_date + 1, current_date + 90)`);
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/finance");
  await findUser(page, MARIA);
  await page.getByLabel("Πακέτο").selectOption("pro");
  await click(page, "Καταχώριση αγοράς");
  await page.waitForTimeout(1200);
});
check("αγορά Pro: 1 + 10 = 11 credits", wallet("Μαρία Πελάτη") === 11);
const giorgos0 = wallet("Γιώργος Υποψήφιος");
await as(MARIA, async (page) => {
  await go(page, "/platform/delivery");
  await click(page, "Συνέχεια");
  await page.waitForTimeout(500);
  await page.getByPlaceholder("π.χ. Άλιμος").fill("Λαύριο");
  await page.getByPlaceholder("π.χ. Ρόδος").fill("Μάλτα");
  await page.getByPlaceholder("π.χ. 250").fill("2000");
  await page.getByRole("button", { name: /Επίλεξε|ημερομηνία|Αναχώρηση/i }).first().click().catch(() => {});
  await pickDay(page, daysFromToday(30));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Συνέχεια", exact: true }).last().click();
  await page.waitForTimeout(2500);
  const t = await text(page);
  // 2000 μίλια × 4€ × 5% = 400€ − 50€ = 350€ → 7 credits των 50€
  check("εκτίμηση: 7 credits", t.includes("Credits: 7 credits"), t.slice(0, 500));
  await page.getByPlaceholder("π.χ. 1500").fill("3000");
  await page.getByRole("button", { name: "Επιλογή", exact: true }).first().click();
  await page.getByRole("button", { name: /^Αποστολή σε 1/ }).click();
  await page.waitForTimeout(2500);
  check("στάλθηκε, γράφει 7 credits", (await text(page)).includes("7 credits"));
});
check("η πελάτισσα χρησιμοποίησε 7 credits", wallet("Μαρία Πελάτη") === 4);
await as(GIORGOS, async (page) => {
  await go(page, "/platform/requests");
  check("ο Γιώργος βλέπει ότι χρειάζεται 1 credit", (await text(page)).includes("1 credit"));
  await page.getByRole("button", { name: "Αποδοχή", exact: true }).first().click();
  await page.waitForTimeout(2500);
});
check("ο Γιώργος χρησιμοποίησε 1 credit", wallet("Γιώργος Υποψήφιος") === giorgos0 - 1);
check("η μεταφορά επιβεβαιώθηκε", num(`select count(*) from delivery_bookings where status = 'confirmed'`) === 1);

step("9. Δωρεάν περίοδος για πελάτες: αίτημα πελάτη = 0");
await as(ADMIN, async (page) => {
  await setSetting(page, "Αίτημα πελάτη", 0);
});
check("η ρύθμιση έγινε 0", num(`select value from platform_settings where key = 'client_request_fee'`) === 0);
const maria9 = wallet("Μαρία Πελάτη");
const fees9 = txns("Μαρία Πελάτη", "request_fee");
await as(MARIA, async (page) => {
  await searchAndPick(page, daysFromToday(33), daysFromToday(35), 250);
  check("το καλάθι γράφει χωρίς χρέωση", /Χωρίς χρέωση|0 credits/.test(await text(page)));
  await click(page, "Αποστολή αιτημάτων");
  await page.waitForTimeout(2500);
  check("στάλθηκε", (await text(page)).includes("Το αίτημά σου στάλθηκε"));
});
check("κανένα credit δεν χρησιμοποιήθηκε, καμία κίνηση", wallet("Μαρία Πελάτη") === maria9 && txns("Μαρία Πελάτη", "request_fee") === fees9);
await as(ADMIN, async (page) => {
  await setSetting(page, "Αίτημα πελάτη", 1);
});

step("10. Δώρο εγγραφής: επαγγελματίας 2, πελάτης όσο ορίζει η ρύθμιση");
const signup = (id, role, phone) =>
  sql(`insert into auth.users(id, phone) values ('${id}', '${phone}');
       insert into users (id, role, phone_number, full_name, status) values ('${id}', '${role}', '+${phone}', 'Νέος ${role}', 'active');
       update users set phone_verified_at = now() where id = '${id}';`);
signup("c3000000-0000-0000-0000-000000000001", "skipper", "306911110001");
signup("c3000000-0000-0000-0000-000000000002", "client", "306911110002");
check("νέος επαγγελματίας: 2 credits", num(`select wallet_balance from users where id = 'c3000000-0000-0000-0000-000000000001'`) === 2);
check("νέος πελάτης: 0 credits, καμία κίνηση",
  num(`select wallet_balance from users where id = 'c3000000-0000-0000-0000-000000000002'`) === 0 &&
  num(`select count(*) from wallet_transactions where user_id = 'c3000000-0000-0000-0000-000000000002'`) === 0);
await as(ADMIN, async (page) => {
  await setSetting(page, "Δώρο εγγραφής, πελάτες", 1);
});
signup("c3000000-0000-0000-0000-000000000003", "client", "306911110003");
check("με τη ρύθμιση σε 1: νέος πελάτης 1 credit", num(`select wallet_balance from users where id = 'c3000000-0000-0000-0000-000000000003'`) === 1);

step("11. Αλλαγή τιμής πακέτου από τις Ρυθμίσεις");
await as(ADMIN, async (page) => {
  await setSetting(page, "Starter: τιμή", 95);
  await go(page, "/platform/admin/settings");
  check("οι Ρυθμίσεις δείχνουν την ενότητα Credits και πακέτα", (await text(page)).includes("Starter: τιμή"));
});
await as(MARIA, async (page) => {
  await go(page, "/platform/wallet");
  check("η πελάτισσα βλέπει τη νέα τιμή 95€", (await text(page)).includes("95€"));
});

step("12. Ο διαχειριστής βλέπει πωλήσεις και κινήσεις");
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/finance");
  const t = await text(page);
  const sales = num(`select coalesce(sum(price_eur), 0) from wallet_transactions where type = 'purchase' and created_at > now() - interval '30 days'`);
  check("πωλήσεις 30 ημερών: οι αγορές του σεναρίου (90 + 350) μετράνε", sales >= 440 && t.includes(`${sales}€`));
  check("credits που πουλήθηκαν: 12", t.includes("12 credits"));
  await go(page, "/platform/admin");
  check("η αρχική δείχνει Πωλήσεις", (await text(page)).includes("Πωλήσεις"));
  await go(page, "/platform/admin/user/a0000000-0000-0000-0000-000000000002");
  const u = await text(page);
  check("καρτέλα χρήστη: υπόλοιπο σε credits", u.includes(`${wallet("Μαρία Πελάτη")} credits`));
});

step("13. Ισοζύγιο: κάθε υπόλοιπο = άθροισμα κινήσεων σε credits");
check("κανένα υπόλοιπο εκτός ισοζυγίου",
  num(`select count(*) from users u where u.wallet_balance <>
         coalesce((select sum(amount) from wallet_transactions t where t.user_id = u.id and t.unit = 'credit'), 0)`) === 0);
check("κανένα αρνητικό υπόλοιπο", num(`select count(*) from users where wallet_balance < 0`) === 0);
check("όλα ακέραια credits", num(`select count(*) from wallet_transactions where unit = 'credit' and amount <> round(amount)`) === 0);

// ---------------------------------------------------------------------------
// Επαναφορά: ό,τι δημιούργησε το σενάριο σβήνεται, τα υπόλοιπα γυρνούν με
// κίνηση διόρθωσης (το ισοζύγιο μένει σωστό), οι ρυθμίσεις στις αρχικές.
sql(`
set session_replication_role = replica;
with t as (select min(t0) as t0 from e2e_credits_start)
update wallet_transactions set related_booking_request_id = null, related_booking_id = null,
       related_delivery_role_request_id = null, related_delivery_booking_id = null
 where created_at >= (select t0 from t);
delete from messages where booking_id in (select id from bookings where created_at >= (select min(t0) from e2e_credits_start));
delete from notifications where created_at >= (select min(t0) from e2e_credits_start);
delete from bookings where created_at >= (select min(t0) from e2e_credits_start);
delete from booking_request_pings where booking_request_id in (select id from booking_requests where created_at >= (select min(t0) from e2e_credits_start));
delete from booking_requests where created_at >= (select min(t0) from e2e_credits_start);
delete from delivery_bookings where created_at >= (select min(t0) from e2e_credits_start);
delete from delivery_role_pings where delivery_role_request_id in (select id from delivery_role_requests where created_at >= (select min(t0) from e2e_credits_start));
delete from delivery_role_requests where created_at >= (select min(t0) from e2e_credits_start);
delete from delivery_requests where created_at >= (select min(t0) from e2e_credits_start);
delete from delivery_availability_windows where skipper_id = 'b0000000-0000-0000-0000-000000000004';
delete from wallet_transactions where user_id::text like 'c3000000%';
delete from users where id::text like 'c3000000%';
delete from auth.users where id::text like 'c3000000%';
set session_replication_role = origin;
select set_config('platform.trusted', 'true', false);
insert into wallet_transactions (user_id, type, amount, note)
  select u.id, 'adjustment', s.wallet_balance - u.wallet_balance, 'Επαναφορά δοκιμής'
    from users u join e2e_credits_start s on s.id = u.id where u.wallet_balance <> s.wallet_balance;
update users u set wallet_balance = s.wallet_balance from e2e_credits_start s
 where s.id = u.id and u.wallet_balance <> s.wallet_balance;
delete from notifications where created_at >= (select min(t0) from e2e_credits_start);
update platform_settings set value = 0 where key = 'signup_credits_client';
update platform_settings set value = 90 where key = 'package_starter_price';
update platform_settings set value = 1 where key = 'client_request_fee';
drop table e2e_credits_start;
`);
check("επαναφορά: καμία κράτηση ή αίτημα από το σενάριο", num(`select count(*) from bookings`) === 0 && num(`select count(*) from booking_requests`) === 0);
check("επαναφορά: ισοζύγιο σωστό",
  num(`select count(*) from users u where u.wallet_balance <>
         coalesce((select sum(amount) from wallet_transactions t where t.user_id = u.id and t.unit = 'credit'), 0)`) === 0);

finish();
