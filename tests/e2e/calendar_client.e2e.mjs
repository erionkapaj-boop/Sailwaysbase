// Το ημερολόγιο του επαγγελματία όπως το βλέπει ο πελάτης, σε όλους τους
// ρόλους. Ο επαγγελματίας δηλώνει μέσα από την οθόνη του· ο πελάτης ψάχνει
// μέσα από τη δική του αναζήτηση. Ό,τι δηλώνεται πρέπει να φαίνεται σωστά
// στην άλλη πλευρά: περιοχή, απουσία, κράτηση, αλλαγή περιοχής.
//
//   Νίκος: skipper (250€/ημέρα) και μάγειρας (220€) — δεύτερη ιδιότητα
//   Άννα: hostess (215€)
import { as, go, text, click, check, finish, sql, num, daysFromToday, iso } from "./lib.mjs";

const NIKOS = "6900002003", MARIA = "6900002002", ANNA = "6900002010";
const SP_NIKOS = "b0000000-0000-0000-0000-000000000003";
const ANNA_UID = "c1000000-0000-0000-0000-000000000010", SP_ANNA = "c2000000-0000-0000-0000-000000000010";
const step = (s) => console.log(`\n== ${s}`);
const trusted = (q) => sql(`select set_config('platform.trusted', 'true', false); ${q}`);
const region = (name) => sql(`select id from regions where name = '${name}'`);
const boat = sql(`select id from boat_types where name = 'Ιστιοπλοϊκό'`);

// ---------------------------------------------------------------------------
// Κατάσταση πριν: κρατιέται για επαναφορά. Οι άλλοι επαγγελματίες βγαίνουν
// προσωρινά από το ημερολόγιο, ώστε κάθε αποτέλεσμα να είναι μόνο δικό μας.
sql(`drop table if exists e2e_cal_w, e2e_cal_r, e2e_cal_b, e2e_cal_t, e2e_cal_u;
     create table e2e_cal_u as select id, wallet_balance from users;
     create table e2e_cal_w as select * from availability_windows;
     create table e2e_cal_r as select * from availability_window_regions;
     create table e2e_cal_b as select * from availability_blocks;
     create table e2e_cal_t as select now() as t0;
     delete from availability_windows; delete from availability_blocks;`);


// Αναζήτηση πελάτη μέσα από την οθόνη: πόσοι βρέθηκαν και ποιες τιμές.
async function search(page, role, regionName, from, to) {
  const q = new URLSearchParams({
    roles: role,
    start: iso(daysFromToday(from)),
    end: iso(daysFromToday(to)),
    region: region(regionName),
    point: "Λιμάνι",
    arrival: "Λιμάνι",
    boat: role === "skipper" ? boat : "",
    party: "2",
    cabin: "false",
  });
  await go(page, `/platform/search?${q}`);
  await page.waitForTimeout(1200);
  const t = await text(page);
  const m = t.match(/(\d+) διαθέσιμ(ος|οι)/);
  return { count: m ? Number(m[1]) : /Κανένας διαθέσιμος/.test(t) ? 0 : -1, text: t };
}
const has = (r, price) => r.count > 0 && r.text.includes(`${price}€`);

const MONTH_GEN = ["Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου",
  "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου"];
async function pickIn(page, dlg, n) {
  const d = daysFromToday(n);
  const target = dlg.locator(`button.sf-cal-day[aria-label="${d.getDate()} ${MONTH_GEN[d.getMonth()]} ${d.getFullYear()}"]`);
  for (let i = 0; i < 4 && !(await target.count()); i++) {
    await dlg.getByRole("button", { name: "Επόμενος μήνας" }).first().click();
    await page.waitForTimeout(250);
  }
  await target.first().click();
}
// Νέα περίοδος από την οθόνη του επαγγελματία: διαθέσιμος σε περιοχές, ή απουσία.
async function declare(page, from, to, what) {
  await click(page, "+ Νέα περίοδος");
  await page.waitForTimeout(400);
  const dlg = page.getByRole("dialog");
  await pickIn(page, dlg, from);
  await pickIn(page, dlg, to);
  if (what === "absence") await dlg.getByRole("radio", { name: "Απουσία" }).click();
  else for (const r of what) await dlg.getByRole("button", { name: r, exact: true }).click();
  await click(page, "Αποθήκευση");
  await page.waitForTimeout(1500);
}

try {
  trusted(`
    insert into auth.users (id, phone) values ('${ANNA_UID}', '30${ANNA}') on conflict do nothing;
    insert into users (id, role, phone_number, full_name, status, phone_verified_at, photo_reviewed_at)
      values ('${ANNA_UID}', 'skipper', '+30${ANNA}', 'Άννα Hostess', 'active', now(), now()) on conflict do nothing;
    insert into skipper_profiles (id, user_id, role, full_name, price_per_day, approval_status, years_experience, gender, date_of_birth)
      values ('${SP_ANNA}', '${ANNA_UID}', 'hostess', 'Άννα Hostess', 215, 'approved', 4, 'female', '1992-01-01') on conflict do nothing;
    insert into user_languages (user_id, language_id) select '${ANNA_UID}', id from languages where name = 'Ελληνικά' on conflict do nothing;
    insert into skipper_secondary_roles (skipper_id, role, price_per_day, approval_status)
      values ('${SP_NIKOS}', 'cook', 220, 'approved');`);

  // -------------------------------------------------------------------------
  step("1. Ο Νίκος δηλώνει: Ιόνιο, μετά Κυκλάδες, απουσία στη μέση");
  await as(NIKOS, async (page) => {
    await go(page, "/platform/availability");
    await declare(page, 10, 20, ["Ιόνιο"]);
    await declare(page, 21, 30, ["Κυκλάδες"]);
    await declare(page, 14, 15, "absence");
    const t = await text(page);
    check("η λίστα του: Ιόνιο, Κυκλάδες, απουσία", t.includes("Ιόνιο") && t.includes("Κυκλάδες") && t.includes("Απουσία"));
  });

  step("2. Η Άννα (hostess) δηλώνει: Σαρωνικός, και αργότερα όλες τις περιοχές");
  await as(ANNA, async (page) => {
    await go(page, "/platform/availability");
    check("η hostess έχει την ίδια οθόνη", (await text(page)).includes("+ Νέα περίοδος"));
    await declare(page, 10, 20, ["Σαρωνικός"]);
    await declare(page, 25, 28, ["Όλες"]);
  });

  // -------------------------------------------------------------------------
  step("3. Ο πελάτης ψάχνει — ό,τι δηλώθηκε, αυτό βλέπει");
  await as(MARIA, async (page) => {
    let r = await search(page, "skipper", "Ιόνιο", 11, 13);
    check("skipper · Ιόνιο · πριν την απουσία: ο Νίκος (250€)", r.count === 1 && has(r, 250), r.text.slice(0, 400));
    r = await search(page, "skipper", "Ιόνιο", 13, 16);
    check("skipper · Ιόνιο · πάνω στην απουσία: κανείς", r.count === 0);
    r = await search(page, "skipper", "Ιόνιο", 16, 20);
    check("skipper · Ιόνιο · μετά την απουσία: ο Νίκος", r.count === 1 && has(r, 250));
    r = await search(page, "skipper", "Κυκλάδες", 22, 24);
    check("skipper · Κυκλάδες · τις μέρες των Κυκλάδων: ο Νίκος", r.count === 1 && has(r, 250));
    r = await search(page, "skipper", "Ιόνιο", 22, 24);
    check("skipper · Ιόνιο · τις μέρες των Κυκλάδων: κανείς", r.count === 0);
    r = await search(page, "skipper", "Ιόνιο", 19, 22);
    check("ταξίδι που περνά από Ιόνιο σε Κυκλάδες: κανείς (δεν είναι μία περιοχή)", r.count === 0);
    r = await search(page, "skipper", "Σαρωνικός", 11, 13);
    check("skipper · Σαρωνικός: κανείς (ο Νίκος δεν είναι εκεί)", r.count === 0);

    r = await search(page, "cook", "Ιόνιο", 11, 13);
    check("μάγειρας · Ιόνιο: ο Νίκος ως μάγειρας (220€) — ίδιο ημερολόγιο", r.count === 1 && has(r, 220));
    r = await search(page, "cook", "Ιόνιο", 14, 15);
    check("μάγειρας · απουσία: κανείς", r.count === 0);

    r = await search(page, "hostess", "Σαρωνικός", 12, 14);
    check("hostess · Σαρωνικός: η Άννα (215€)", r.count === 1 && has(r, 215));
    r = await search(page, "hostess", "Ιόνιο", 12, 14);
    check("hostess · Ιόνιο: κανείς", r.count === 0);
    r = await search(page, "hostess", "Κρήτη", 25, 27);
    check("hostess · Κρήτη στις μέρες «Όλες»: η Άννα", r.count === 1 && has(r, 215));
    r = await search(page, "deckhand", "Ιόνιο", 11, 13);
    check("ναύτης · κανένας δηλωμένος: κανείς", r.count === 0);
  });

  // -------------------------------------------------------------------------
  step("4. Κράτηση: ο πελάτης στέλνει, ο Νίκος αναλαμβάνει");
  await as(MARIA, async (page) => {
    await search(page, "skipper", "Ιόνιο", 11, 13);
    await page.getByRole("button", { name: "Επιλογή", exact: true }).first().click();
    await click(page, "Αποστολή αιτημάτων");
    await page.waitForTimeout(2500);
    check("το αίτημα στάλθηκε", (await text(page)).includes("Το αίτημά σου στάλθηκε"));
  });
  await as(NIKOS, async (page) => {
    await go(page, "/platform/requests");
    await click(page, "Διεκδίκηση");
    await page.waitForTimeout(2500);
    await go(page, "/platform/availability");
    const d = daysFromToday(12);
    const pad = (n) => String(n).padStart(2, "0");
    const prefix = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}:`;
    const cell = page.locator(`button.sf-cal-day[aria-label^="${prefix}"]`);
    for (let i = 0; i < 3 && !(await cell.count()); i++) {
      await page.getByRole("button", { name: "Επόμενος μήνας" }).first().click();
      await page.waitForTimeout(300);
    }
    const label = await cell.first().getAttribute("aria-label");
    check("στο ημερολόγιό του η μέρα φαίνεται ως κράτηση", /κράτηση/.test(label || ""), label);
  });
  await as(MARIA, async (page) => {
    let r = await search(page, "skipper", "Ιόνιο", 12, 12);
    check("μετά την κράτηση: ο Νίκος δεν εμφανίζεται εκείνες τις μέρες", r.count === 0);
    r = await search(page, "cook", "Ιόνιο", 11, 13);
    check("ούτε ως μάγειρας (ένας άνθρωπος, μία δουλειά)", r.count === 0);
    r = await search(page, "skipper", "Ιόνιο", 16, 18);
    check("τις υπόλοιπες μέρες του Ιονίου εμφανίζεται κανονικά", r.count === 1 && has(r, 250));
  });

  // -------------------------------------------------------------------------
  step("5. Ο Νίκος αλλάζει περιοχή: το Ιόνιο γίνεται Σαρωνικός");
  await as(NIKOS, async (page) => {
    await go(page, "/platform/availability");
    await page.getByRole("button", { name: /Ιόνιο/ }).first().click();
    await page.waitForTimeout(500);
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: "Ιόνιο", exact: true }).click();
    await dlg.getByRole("button", { name: "Σαρωνικός", exact: true }).click();
    await click(page, "Αποθήκευση");
    await page.waitForTimeout(1500);
  });
  await as(MARIA, async (page) => {
    let r = await search(page, "skipper", "Ιόνιο", 16, 18);
    check("ο πελάτης δεν τον βρίσκει πια στο Ιόνιο", r.count === 0);
    r = await search(page, "skipper", "Σαρωνικός", 16, 18);
    check("τον βρίσκει στον Σαρωνικό", r.count === 1 && has(r, 250));
    r = await search(page, "skipper", "Σαρωνικός", 14, 15);
    check("η απουσία ισχύει και μετά την αλλαγή", r.count === 0);
    r = await search(page, "skipper", "Σαρωνικός", 11, 13);
    check("και η κράτηση", r.count === 0);
  });

  // -------------------------------------------------------------------------
  step("6. Ο Νίκος ακυρώνει την απουσία");
  await as(NIKOS, async (page) => {
    await go(page, "/platform/availability");
    await page.getByRole("button", { name: /Απουσία/ }).last().click();
    await page.waitForTimeout(500);
    await click(page, "Ακύρωση απουσίας");
    await page.waitForTimeout(1500);
  });
  await as(MARIA, async (page) => {
    const r = await search(page, "skipper", "Σαρωνικός", 14, 15);
    check("οι μέρες ξανανοίγουν για τον πελάτη", r.count === 1 && has(r, 250));
  });
} finally {
  // Επαναφορά.
  sql(`
set session_replication_role = replica;
delete from messages where booking_id in (select id from bookings where created_at >= (select t0 from e2e_cal_t));
delete from notifications where created_at >= (select t0 from e2e_cal_t);
update wallet_transactions set related_booking_request_id = null, related_booking_id = null where created_at >= (select t0 from e2e_cal_t);
delete from bookings where created_at >= (select t0 from e2e_cal_t);
delete from booking_request_pings where booking_request_id in (select id from booking_requests where created_at >= (select t0 from e2e_cal_t));
delete from booking_requests where created_at >= (select t0 from e2e_cal_t);
delete from wallet_transactions where created_at >= (select t0 from e2e_cal_t);
update users u set wallet_balance = s.wallet_balance from e2e_cal_u s where s.id = u.id and u.wallet_balance <> s.wallet_balance;
delete from availability_windows; delete from availability_blocks;
insert into availability_windows select * from e2e_cal_w;
insert into availability_window_regions select * from e2e_cal_r;
insert into availability_blocks select * from e2e_cal_b;
delete from skipper_secondary_roles where skipper_id = '${SP_NIKOS}' and role = 'cook';
delete from user_languages where user_id = '${ANNA_UID}';
delete from skipper_profiles where id = '${SP_ANNA}';
delete from users where id = '${ANNA_UID}';
delete from auth.users where id = '${ANNA_UID}';
set session_replication_role = origin;
drop table e2e_cal_w, e2e_cal_r, e2e_cal_b, e2e_cal_t, e2e_cal_u;`);
}
finish();
