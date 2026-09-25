// The whole skipper-replacement journey through the real UI, one role at a
// time, with every step checked both on screen and in the database:
// client books → skipper accepts → skipper cancels → admin offers to five →
// three show interest, one declines, one withdraws → client picks → admin
// sees it completed. Then a second trip: admin withdraws and closes a case
// without a replacement, and the client's fee comes back.
import { as, go, text, click, check, finish, sql, num, pickDay, daysFromToday, iso } from "./lib.mjs";

const MARIA = "6900002002", ADMIN = "6900002001", NIKOS = "6900002003";
const GIORGOS = "6900002004", KOSTAS = "6900002005", ELENI = "6900002006", PETROS = "6900002007";
const wallet = (name) => num(`select wallet_balance from users where full_name = '${name}'`);
const start = daysFromToday(15), end = daysFromToday(18);
const step = (s) => console.log(`\n== ${s}`);

const maria0 = wallet("Μαρία Πελάτη");

step("1. Η πελάτισσα ψάχνει και στέλνει αίτημα στον Νίκο");
await as(MARIA, async (page) => {
  await go(page, "/platform/search");
  await pickDay(page, start);
  await pickDay(page, end);
  const selects = page.locator("select");
  await selects.nth(0).selectOption({ label: "Κυκλάδες" });
  await page.fill("input[placeholder='π.χ. Καλλιθέα']", "Μύκονος");
  await page.locator("input[type=number]").fill("4");
  await selects.nth(2).selectOption({ label: "Ναι" });
  await selects.nth(3).selectOption({ label: "Ιστιοπλοϊκό" });
  await page.click("button[type=submit]");
  await page.waitForTimeout(2500);
  const t = await text(page);
  check("6 διαθέσιμοι στις Κυκλάδες (όχι ο skipper του Ιονίου)", t.includes("6 διαθέσιμοι"), t.slice(0, 300));
  check("τα αποτελέσματα είναι ανώνυμα", !/Νίκος|Γιώργος|Κώστας|Ελένη/.test(await page.content()));
  await page.locator("div").filter({ hasText: "250€" }).filter({ has: page.getByRole("button", { name: "Επιλογή", exact: true }) }).last()
    .getByRole("button", { name: "Επιλογή", exact: true }).click();
  await click(page, "Αποστολή αιτημάτων");
  await page.waitForTimeout(2500);
  check("επιβεβαίωση αποστολής", (await text(page)).includes("Το αίτημά σου στάλθηκε"));
});
check("το αίτημα πήγε στον Νίκο", num(`select count(*) from booking_request_pings p join skipper_profiles s on s.id = p.skipper_id where s.full_name = 'Νίκος Αρχικός'`) === 1);
check("χρεώθηκε 15€ τέλος αιτήματος", wallet("Μαρία Πελάτη") === maria0 - 15);

step("2. Ο Νίκος αποδέχεται");
await as(NIKOS, async (page) => {
  await go(page, "/platform/requests");
  await click(page, "Διεκδίκηση");
  await page.waitForTimeout(2500);
});
check("η κράτηση επιβεβαιώθηκε", num(`select count(*) from bookings where status = 'confirmed'`) === 1);

step("3. Ο Νίκος ακυρώνει (ο λόγος είναι υποχρεωτικός)");
await as(NIKOS, async (page) => {
  await go(page, "/platform/bookings");
  await page.getByText("Μύκονος (Κυκλάδες)").first().click();
  await page.waitForTimeout(800);
  await click(page, "Ακύρωση κράτησης");
  await page.waitForTimeout(500);
  check("χωρίς λόγο η ακύρωση μπλοκάρεται", (await text(page)).includes("είναι υποχρεωτικός"));
  await page.fill("input[placeholder^='Λόγος ακύρωσης']", "Αρρώστησα, δεν μπορώ να βγω.");
  await click(page, "Ακύρωση κράτησης");
  await page.waitForTimeout(500);
  await click(page, "Συνέχεια");
  await page.waitForTimeout(2500);
});
check("ακυρώθηκε με τον λόγο", sql(`select cancellation_reason from bookings where status = 'cancelled_by_skipper'`) === "Αρρώστησα, δεν μπορώ να βγω.");
check("η πελάτισσα δεν πήρε επιστροφή (η πλατφόρμα ψάχνει αντικαταστάτη)", wallet("Μαρία Πελάτη") === maria0 - 15);

step("4. Η πελάτισσα βλέπει ότι ψάχνουμε αντικαταστάτη");
await as(MARIA, async (page) => {
  await go(page, "/platform/bookings");
  check("μήνυμα αναζήτησης αντικαταστάτη", (await text(page)).includes("δεν χρειάζεται να πληρώσεις ξανά"));
});

step("5. Ο admin ανοίγει την υπόθεση και στέλνει πρόταση σε 5");
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/replacements");
  await page.getByText("Μύκονος · Μαρία Πελάτη").first().click();
  await page.waitForTimeout(3000);
  const t = await text(page);
  check("φαίνεται ποιος ακύρωσε", t.includes("ακύρωσε Νίκος Αρχικός"));
  check("φαίνεται ο λόγος στο ιστορικό", t.includes("Αρρώστησα"));
  const list = t.slice(t.indexOf("Ποιοι είναι ελεύθεροι"), t.indexOf("Σημείωμα"));
  check("ο Νίκος δεν προτείνεται ξανά", !list.includes("Νίκος"), list);
  check("ο skipper του Ιονίου δεν προτείνεται", !list.includes("Ιόνιος"), list);
  const boxes = page.locator("input[type=checkbox]");
  check("5 υποψήφιοι", (await boxes.count()) === 5);
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
  await page.fill("input[placeholder^='π.χ. Ναύλο']", "Ο αρχικός skipper ακύρωσε.");
  await page.getByRole("button", { name: /Αποστολή πρότασης/ }).click();
  await page.waitForTimeout(3000);
  check("επιβεβαίωση αποστολής", (await text(page)).includes("Η πρόταση στάλθηκε σε 5"));
});
check("5 παραλήπτες στη βάση", num(`select count(*) from booking_request_pings p join booking_requests r on r.id = p.booking_request_id where r.origin = 'admin_replacement'`) === 5);

step("6. Υποψήφιοι: 3 δηλώνουν ενδιαφέρον, 1 αρνείται, μετά 1 ανακαλεί");
for (const phone of [GIORGOS, KOSTAS, ELENI]) {
  await as(phone, async (page) => {
    await go(page, "/platform/requests");
    check(`${phone}: η χρέωση γίνεται μόνο αν τον επιλέξει ο πελάτης`, (await text(page)).includes("Αν σε επιλέξει ο πελάτης, χρεώνεσαι 25€"));
    await click(page, "Δήλωση ενδιαφέροντος");
    await page.waitForTimeout(2500);
    const t = await text(page);
    check(`${phone}: περιμένει τον πελάτη και μπορεί να ανακαλέσει`, t.includes("Δήλωσες ενδιαφέρον") && t.includes("Ανάκληση διαθεσιμότητας"));
  });
}
await as(PETROS, async (page) => {
  await go(page, "/platform/requests");
  await click(page, "Δεν με ενδιαφέρει");
  await page.waitForTimeout(2000);
});
await as(ELENI, async (page) => {
  await go(page, "/platform/requests");
  await click(page, "Ανάκληση διαθεσιμότητας");
  await page.waitForTimeout(2500);
  check("μετά την ανάκληση δεν μένει τίποτα εκκρεμές", (await text(page)).includes("Δεν υπάρχουν εκκρεμή αιτήματα"));
});
check("κανείς υποψήφιος δεν χρεώθηκε για δήλωση ενδιαφέροντος", num(`select count(*) from wallet_transactions where type = 'claim_fee'`) === 1);

step("7. Ο admin παρακολουθεί");
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/replacements");
  await page.getByText("Μύκονος · Μαρία Πελάτη").first().click();
  await page.waitForTimeout(2500);
  const t = await text(page);
  check("στάδιο: αναμονή επιλογής πελάτη, 2 υποψήφιοι", t.includes("Αναμονή επιλογής πελάτη") && t.includes("2 υποψήφιοι"));
  check("φαίνεται ποιος αρνήθηκε και ποιος αποσύρθηκε", t.includes("Απέρριψε") && t.includes("μετά αποσύρθηκε"));
});

step("8. Η πελάτισσα διαλέγει ανώνυμα");
const kostas0 = wallet("Κώστας Υποψήφιος");
await as(MARIA, async (page) => {
  await go(page, "/platform/requests");
  check("η πρόταση του admin δεν φαίνεται ως «δικό της αίτημα»", !(await text(page)).includes("Τέλος 0€"));
  await go(page, "/platform/bookings");
  const t = await text(page);
  check("βλέπει 2 υποψήφιους με προθεσμία", t.includes("Βρέθηκαν 2 διαθέσιμοι αντικαταστάτες") && t.includes("Διάλεξε έως"));
  check("και το συνολικό κόστος", t.includes("1120€ για 4 ημέρες"));
  check("κανένα όνομα ή τηλέφωνο υποψηφίου", !/Γιώργος|Κώστας|690000200[4-8]/.test(await page.content()));
  await page.locator("div").filter({ hasText: "280€" }).filter({ has: page.getByRole("button", { name: "Επιβεβαίωση", exact: true }) }).last()
    .getByRole("button", { name: "Επιβεβαίωση", exact: true }).click();
  await click(page, "Ναι, αυτόν");
  await page.waitForTimeout(3000);
  check("μετά την επιλογή βλέπει τον νέο skipper", (await text(page)).includes("Κώστας Υποψήφιος"));
});
check("ακριβώς ένας νέος επιβεβαιωμένος skipper", num(`select count(*) from bookings where status = 'confirmed'`) === 1);
check("ο επιλεγμένος χρεώθηκε 25€ μία φορά", wallet("Κώστας Υποψήφιος") === kostas0 - 25);
check("η πελάτισσα δεν ξαναπλήρωσε", wallet("Μαρία Πελάτη") === maria0 - 15);

step("9. Ο admin βλέπει την υπόθεση ολοκληρωμένη");
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/replacements");
  check("καμία ενεργή εκκρεμότητα", (await text(page)).includes("Καμία υπόθεση δεν περιμένει εσένα"));
  await click(page, "Δες τις ολοκληρωμένες");
  await page.waitForTimeout(2000);
  check("ολοκληρωμένη με τον νέο skipper", (await text(page)).includes("νέος: Κώστας Υποψήφιος"));
});

step("10. Δεύτερο ταξίδι: απόσυρση και κλείσιμο χωρίς αντικαταστάτη");
sql(`
  select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
  insert into booking_requests (id, client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role)
    select 'c2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', '${iso(daysFromToday(25))}', '${iso(daysFromToday(27))}',
           id, 'Νάξος', 'Νάξος', 'skipper' from regions where name = 'Κυκλάδες';
  select pay_and_broadcast('c2000000-0000-0000-0000-000000000001', array['b0000000-0000-0000-0000-000000000007'::uuid]);
  select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false);
  select set_config('e2e.bk', (claim_booking_request('c2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000007')).id::text, false);
  select cancel_booking(current_setting('e2e.bk')::uuid, 'Βλάβη στο αυτοκίνητο');
  select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
  select admin_create_offer(array['b0000000-0000-0000-0000-000000000004']::uuid[], p_replaces_booking_id := current_setting('e2e.bk')::uuid);
  select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
  select respond_to_replacement_offer((select id from booking_requests where origin = 'admin_replacement' and status = 'open'),
                                      'b0000000-0000-0000-0000-000000000004', true);
`);
const maria1 = wallet("Μαρία Πελάτη");
await as(ADMIN, async (page) => {
  await go(page, "/platform/admin/replacements");
  await page.getByText("Νάξος · Μαρία Πελάτη").first().click();
  await page.waitForTimeout(2000);
  await click(page, "Απόσυρση πρότασης");
  await page.waitForTimeout(500);
  check("η απόσυρση ζητά επιβεβαίωση", (await text(page)).includes("Ο υποψήφιος θα ενημερωθεί"));
  await click(page, "Απόσυρση");
  await page.waitForTimeout(2500);
  check("η υπόθεση γυρίζει στον admin", (await text(page)).includes("Η πρόταση αποσύρθηκε"));
  await page.getByText("Νάξος · Μαρία Πελάτη").first().click();
  await page.waitForTimeout(2500);
  await page.fill("input[placeholder^='Λόγος (π.χ.']", "Κανείς διαθέσιμος για Νάξο");
  await click(page, "Κλείσιμο χωρίς αντικαταστάτη");
  await page.waitForTimeout(500);
  await click(page, "Ναι, κλείσιμο");
  await page.waitForTimeout(2500);
  check("η υπόθεση έκλεισε", (await text(page)).includes("Η υπόθεση έκλεισε"));
});
check("ο υποψήφιος ενημερώθηκε για την απόσυρση", num(`select count(*) from notifications where user_id = 'a0000000-0000-0000-0000-000000000004' and kind = 'replacement_offer_closed'`) === 1);
check("η πελάτισσα πήρε πίσω τα 15€", wallet("Μαρία Πελάτη") === maria1 + 15);
await as(MARIA, async (page) => {
  await go(page, "/platform/bookings");
  check("η πελάτισσα βλέπει ότι δεν βρέθηκε αντικαταστάτης", (await text(page)).includes("Δεν βρέθηκε αντικαταστάτης"));
});

finish();
