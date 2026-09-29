// Credits από την αρχή ως το τέλος, με δύο ανθρώπους ταυτόχρονα: ο
// επαγγελματίας (ή ο πελάτης) κρατά το παράθυρο αγοράς ανοιχτό, ο
// ιδιοκτήτης επιβεβαιώνει ή απορρίπτει την πληρωμή από άλλη συσκευή, και η
// ενέργεια που είχε ξεκινήσει συνεχίζει χωρίς να χαθεί.
//
//   Α. 0 credits → διεκδίκηση → αγορά → επιβεβαίωση → «Συνέχεια» → κράτηση
//   Β. 0 credits → αγορά → απόρριψη → νέα επιλογή, η πρόταση μένει
//   Γ. 0 credits → αγορά → στο μεταξύ την παίρνει άλλος → καμία χρέωση
//   Δ. 1 credit → διεκδίκηση αμέσως → «Δεν έχεις credits»
//   Ε. πελάτης 0 credits → αποστολή → αγορά → επιβεβαίωση → οι επιλογές του
//      έμειναν, τα αιτήματα φεύγουν
import { chromium } from "playwright";
import { BASE, text, check, finish, sql, num, pickDay, daysFromToday, pickPlace } from "./lib.mjs";
import { TEST_PIN } from "./gateway.mjs";

const U = {
  admin: ["6900002001", "a0000000-0000-0000-0000-000000000001"],
  maria: ["6900002002", "a0000000-0000-0000-0000-000000000002"],
  giorgos: ["6900002004", "a0000000-0000-0000-0000-000000000004"],
  kostas: ["6900002005", "a0000000-0000-0000-0000-000000000005"],
  eleni: ["6900002006", "a0000000-0000-0000-0000-000000000006"],
  petros: ["6900002007", "a0000000-0000-0000-0000-000000000007"],
  sofia: ["6900002008", "a0000000-0000-0000-0000-000000000008"],
};
const SP = (uid) => uid.replace("a0000000", "b0000000");
const bal = (who) => num(`select wallet_balance from users where id = '${U[who][1]}'`);
const step = (s) => console.log(`\n== ${s}`);
const trusted = (q) => sql(`select set_config('platform.trusted', 'true', false); ${q}`);
const setBalance = (who, n) =>
  trusted(`insert into wallet_transactions (user_id, type, amount, note)
             select id, 'adjustment', ${n} - wallet_balance, 'Δοκιμή' from users where id = '${U[who][1]}' and wallet_balance <> ${n};
           update users set wallet_balance = ${n} where id = '${U[who][1]}';`);

// Αίτημα πελάτη προς συγκεκριμένους επαγγελματίες (ήδη πληρωμένο από τον πελάτη).
function openRequest(days, ...pros) {
  const out = trusted(`
    with r as (
      insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role,
                                    fee_amount, fee_paid_at, expires_at, party_size, private_cabin)
      select '${U.maria[1]}', current_date + ${days}, current_date + ${days + 2}, id, 'Σαντορίνη', 'Σαντορίνη', 'skipper',
             0, now(), now() + interval '1 day', 2, false
        from regions where name = 'Κυκλάδες' returning id)
    insert into booking_request_pings (booking_request_id, skipper_id)
      select r.id, s from r, unnest(array[${pros.map((p) => `'${SP(U[p][1])}'::uuid`).join(",")}]) s returning booking_request_id;`);
  return out.split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l));
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
async function login(who, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${who}: ${e.message}`));
  await page.goto(`${BASE}/platform/login`);
  await page.waitForLoadState("networkidle");
  await page.locator("input").nth(0).fill(U[who][0]);
  await page.locator("input").nth(1).fill(TEST_PIN);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
  return page;
}
async function go(page, path) {
  await page.goto(BASE + path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
}
const btn = (page, name) => page.getByRole("button", { name, exact: true });
const lastRef = (who) => sql(`select reference from credit_purchase_requests where user_id = '${U[who][1]}' order by created_at desc limit 1`);

// Ο ιδιοκτήτης επιβεβαιώνει ή απορρίπτει ένα αίτημα αγοράς από τα Οικονομικά.
async function ownerHandles(admin, ref, confirm) {
  await go(admin, "/platform/admin/finance");
  const row = admin.locator("div").filter({ hasText: ref }).filter({ has: admin.getByRole("button", { name: "Απόρριψη" }) }).last();
  await row.getByRole("button", { name: confirm ? "Επιβεβαίωση πληρωμής" : "Απόρριψη", exact: true }).click();
  await admin.waitForTimeout(400);
  await btn(admin, confirm ? "Επιβεβαίωση" : "Απόρριψη").last().click();
  await admin.waitForTimeout(1500);
}
// Περιμένει ώσπου το κείμενο να εμφανιστεί (το παράθυρο ελέγχει κάθε 5").
async function waitFor(page, needle, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await text(page)).includes(needle)) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

sql(`drop table if exists e2e_journeys_start;
     create table e2e_journeys_start as select id, wallet_balance, now() as t0 from users`);
const admin = await login("admin");

try {
  // -------------------------------------------------------------------------
  step("Α. 0 credits → διεκδίκηση → αγορά → επιβεβαίωση → συνέχεια");
  setBalance("petros", 0);
  const reqA = openRequest(60, "petros");
  const petros = await login("petros");
  await go(petros, "/platform/requests");
  await btn(petros, "Διεκδίκηση").first().click();
  await petros.waitForTimeout(1200);
  check("Α: το παράθυρο λέει τι λείπει", (await text(petros)).includes("Χρειάζεσαι 1 credit · διαθέσιμα 0 credits"));
  await btn(petros, "Αποστολή αιτήματος").click();
  await petros.waitForTimeout(1500);
  check("Α: περιμένει την πληρωμή, στην ίδια σελίδα",
    (await text(petros)).includes("Αναμονή επιβεβαίωσης της πληρωμής") && petros.url().endsWith("/platform/requests"));
  await ownerHandles(admin, lastRef("petros"), true);
  check("Α: μόλις πιστωθούν, το παράθυρο το δείχνει μόνο του", await waitFor(petros, "Τα credits πιστώθηκαν"));
  await btn(petros, "Συνέχεια: Διεκδίκηση").click();
  await petros.waitForTimeout(2500);
  check("Α: η κράτηση επιβεβαιώθηκε", num(`select count(*) from bookings b join booking_requests r on r.id = b.booking_request_id where r.id = '${reqA}' and b.status = 'confirmed'`) === 1);
  check("Α: 5 credits αγορά − 1 διεκδίκηση = 4", bal("petros") === 4);
  await petros.context().close();

  // -------------------------------------------------------------------------
  step("Β. 0 credits → αγορά → απόρριψη → η πρόταση μένει");
  setBalance("kostas", 0);
  const reqB = openRequest(64, "kostas");
  const kostas = await login("kostas");
  await go(kostas, "/platform/requests");
  await btn(kostas, "Διεκδίκηση").first().click();
  await kostas.waitForTimeout(1200);
  await kostas.getByRole("radio", { name: /Starter/ }).click();
  await btn(kostas, "Αποστολή αιτήματος").click();
  await kostas.waitForTimeout(1500);
  await ownerHandles(admin, lastRef("kostas"), false);
  check("Β: μετά την απόρριψη το παράθυρο το λέει και προσφέρει ξανά επιλογή",
    (await waitFor(kostas, "Το αίτημα αγοράς δεν ολοκληρώθηκε")) && (await text(kostas)).includes("Αποστολή αιτήματος"));
  await kostas.keyboard.press("Escape");
  await kostas.waitForTimeout(500);
  check("Β: καμία χρέωση, η πρόταση είναι ακόμα εκεί",
    bal("kostas") === 0 && (await btn(kostas, "Διεκδίκηση").count()) > 0 &&
    num(`select count(*) from booking_requests where id = '${reqB}' and status = 'open'`) === 1);
  await kostas.context().close();

  // -------------------------------------------------------------------------
  step("Γ. 0 credits → αγορά → στο μεταξύ την παίρνει άλλος");
  setBalance("eleni", 0);
  const reqC = openRequest(68, "eleni", "giorgos");
  const eleni = await login("eleni");
  await go(eleni, "/platform/requests");
  await btn(eleni, "Διεκδίκηση").first().click();
  await eleni.waitForTimeout(1200);
  await btn(eleni, "Αποστολή αιτήματος").click();
  await eleni.waitForTimeout(1500);
  const giorgos = await login("giorgos");
  await go(giorgos, "/platform/requests");
  await btn(giorgos, "Διεκδίκηση").first().click();
  await giorgos.waitForTimeout(2500);
  check("Γ: ο άλλος την ανέλαβε", num(`select count(*) from bookings b join booking_requests r on r.id = b.booking_request_id where r.id = '${reqC}'`) === 1);
  await giorgos.context().close();
  await ownerHandles(admin, lastRef("eleni"), true);
  check("Γ: πιστώθηκαν", await waitFor(eleni, "Τα credits πιστώθηκαν"));
  await btn(eleni, "Συνέχεια: Διεκδίκηση").click();
  await eleni.waitForTimeout(2500);
  const tC = await text(eleni);
  check("Γ: σαφές μήνυμα ότι η πρόταση έκλεισε", /έκλεισε|δεν απευθύνεται|καλύφθηκε/.test(tC), tC.slice(0, 500));
  check("Γ: τα credits της έμειναν ανέπαφα (5)", bal("eleni") === 5);
  await eleni.context().close();

  // -------------------------------------------------------------------------
  step("Δ. 1 credit → διεκδίκηση αμέσως");
  setBalance("sofia", 1);
  const reqD = openRequest(72, "sofia");
  const sofia = await login("sofia");
  await go(sofia, "/platform/requests");
  check("Δ: υπενθύμιση με 1 credit", (await text(sofia)).includes("Σου έμεινε 1 credit"));
  await btn(sofia, "Διεκδίκηση").first().click();
  await sofia.waitForTimeout(2500);
  check("Δ: χωρίς παράθυρο αγοράς, η κράτηση έγινε", !(await text(sofia)).includes("Δεν έχεις αρκετά credits") &&
    num(`select count(*) from bookings b join booking_requests r on r.id = b.booking_request_id where r.id = '${reqD}' and b.status = 'confirmed'`) === 1);
  await go(sofia, "/platform/requests");
  check("Δ: τώρα λέει «Δεν έχεις credits»", bal("sofia") === 0 && (await text(sofia)).includes("Δεν έχεις credits"));
  await sofia.context().close();

  // -------------------------------------------------------------------------
  step("Ε. πελάτης 0 credits → αποστολή → αγορά → επιβεβαίωση → συνέχεια");
  setBalance("maria", 0);
  const maria = await login("maria", { width: 1280, height: 900 });
  await go(maria, "/platform/search");
  await pickDay(maria, daysFromToday(36));
  await pickDay(maria, daysFromToday(38));
  const selects = maria.locator("select");
  await pickPlace(maria, "Νάξος");
  await maria.locator("input[type=number]").fill("4");
  await selects.nth(1).selectOption({ label: "Ναι" });
  await selects.nth(2).selectOption({ label: "Ιστιοπλοϊκό" });
  await maria.click("button[type=submit]");
  await maria.waitForTimeout(2500);
  await maria.locator("div").filter({ hasText: "260€" }).filter({ has: btn(maria, "Επιλογή") }).last().getByRole("button", { name: "Επιλογή", exact: true }).click();
  await btn(maria, "Αποστολή αιτημάτων").click();
  await maria.waitForTimeout(1200);
  check("Ε: παράθυρο αγοράς στον πελάτη", (await text(maria)).includes("Χρειάζεσαι 1 credit"));
  await maria.getByRole("radio", { name: /Starter/ }).click();
  await btn(maria, "Αποστολή αιτήματος").click();
  await maria.waitForTimeout(1500);
  await ownerHandles(admin, lastRef("maria"), true);
  check("Ε: πιστώθηκαν", await waitFor(maria, "Τα credits πιστώθηκαν"));
  await btn(maria, "Συνέχεια: Αποστολή αιτημάτων").click();
  await maria.waitForTimeout(3000);
  check("Ε: οι επιλογές έμειναν και το αίτημα στάλθηκε", (await text(maria)).includes("Το αίτημά σου στάλθηκε"));
  check("Ε: 2 credits − 1 = 1", bal("maria") === 1);
  await maria.context().close();

  check("χωρίς σφάλματα σελίδας", errors.length === 0, errors.join(" | "));
} catch (e) {
  check("η ροή ολοκληρώθηκε", false, e.stack || e.message);
} finally {
  await browser.close();
  // Επαναφορά για τα επόμενα σενάρια.
  sql(`
set session_replication_role = replica;
update wallet_transactions set related_booking_request_id = null, related_booking_id = null
 where created_at >= (select min(t0) from e2e_journeys_start);
delete from messages where booking_id in (select id from bookings where created_at >= (select min(t0) from e2e_journeys_start));
delete from notifications where created_at >= (select min(t0) from e2e_journeys_start);
delete from bookings where created_at >= (select min(t0) from e2e_journeys_start);
delete from booking_request_pings where booking_request_id in (select id from booking_requests where created_at >= (select min(t0) from e2e_journeys_start));
delete from booking_requests where created_at >= (select min(t0) from e2e_journeys_start);
update credit_purchase_requests set status = 'cancelled', cancelled_by = 'user' where status = 'pending';
set session_replication_role = origin;
select set_config('platform.trusted', 'true', false);
insert into wallet_transactions (user_id, type, amount, note)
  select u.id, 'adjustment', s.wallet_balance - u.wallet_balance, 'Επαναφορά δοκιμής'
    from users u join e2e_journeys_start s on s.id = u.id where u.wallet_balance <> s.wallet_balance;
update users u set wallet_balance = s.wallet_balance from e2e_journeys_start s
 where s.id = u.id and u.wallet_balance <> s.wallet_balance;
drop table e2e_journeys_start;`);
}
finish();
