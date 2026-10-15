// Διαμονή πληρώματος: μόνο σε πολυήμερο ταξίδι· μία ερώτηση ανά ρόλο («Πού θα μένει ο skipper;» …) με
// κουκέτα, ιδιωτική, skipper cabin και «Δεν ξέρω ακόμα»· σε ημερήσια εκδρομή παραλείπεται· ο επαγγελματίας
// διαβάζει τη διαμονή του (ή «Διαμονή: αδιευκρίνιστη») με το ίδιο εικονίδιο. Ελληνικά και αγγλικά.
import { BASE, as, go, text, check, finish, sql, pickDay, daysFromToday, shoot } from "./lib.mjs";

const MARIA = "a0000000-0000-0000-0000-000000000002";
const CLIENT = MARIA;
const KOSTAS_USER = "a0000000-0000-0000-0000-000000000005";
const SP_KOSTAS = "b0000000-0000-0000-0000-000000000005";
const t0 = sql(`select now()`);
const mariaLocale0 = sql(`select coalesce(locale, '') from users where id = '${MARIA}'`);
const kostasLocale0 = sql(`select coalesce(locale, '') from users where id = '${KOSTAS_USER}'`);

// Ο οδηγός ως τη βοήθεια: χώρα, λιμάνι, ημερομηνίες (from..to), επιβάτες, σκάφος «Δεν ξέρω ακόμα».
async function toRoles(page, from, to) {
  await go(page, "/platform");
  await page.locator("button.sf-cta").click();
  await page.getByRole("button", { name: "Ελλάδα", exact: true }).click();
  await page.waitForTimeout(1500);
  const cont = () => page.locator(".sf-step-footer button").first().click();
  await cont(); await page.waitForTimeout(600);
  await pickDay(page, daysFromToday(from)); await pickDay(page, daysFromToday(to)); await cont(); await page.waitForTimeout(600);
  await cont(); await page.waitForTimeout(600);
  await page.locator("[data-boat-unknown]").click();
  await page.waitForTimeout(600);
}

await as("6900002002", async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cont = () => page.locator(".sf-step-footer button").first();

  // 1. Ημερήσια εκδρομή: η διαμονή παραλείπεται, η βοήθεια είναι το τελευταίο βήμα.
  await toRoles(page, 12, 12);
  await page.locator('[data-role-card="skipper"]').click();
  check("ημερήσια εκδρομή: το τελευταίο βήμα έχει «Ολοκλήρωση», όχι «Συνέχεια»", (await cont().innerText()).trim() === "Ολοκλήρωση", await cont().innerText());
  await cont().click();
  await page.waitForURL(/\/platform\/search\?/);
  const day = new URL(page.url());
  check("ημερήσια εκδρομή: καμία διαμονή στον σύνδεσμο", !day.searchParams.get("cabin"), day.search);
  await page.waitForTimeout(1500);
  check("ημερήσια εκδρομή: η σελίδα αποτελεσμάτων δεν ζητά διαμονή", !(await text(page)).includes("Δεν ξέρω ακόμα"));

  // 2. Πολυήμερο με και τους τέσσερις ρόλους.
  await toRoles(page, 12, 15);
  for (const k of ["skipper", "hostess", "cook", "deckhand"]) await page.locator(`[data-role-card="${k}"]`).click();
  await cont().click();
  await page.waitForTimeout(500);
  const asks = [
    ["Πού θα μένει ο skipper;", "Κουκέτα"],
    ["Πού θα μένει η hostess;", "Ιδιωτική καμπίνα"],
    ["Πού θα μένει ο μάγειρας;", "Skipper cabin"],
    ["Πού θα μένει ο deckhand;", "Δεν ξέρω ακόμα"],
  ];
  for (const [i, [title, pick]] of asks.entries()) {
    const t = await text(page);
    check(`ερώτηση ${i + 1}: «${title}» με τέσσερις επιλογές και εικονίδια`,
      t.includes(title) && (await page.locator("[data-cabin-choice] button").count()) === 4 && (await page.locator("[data-cabin-choice] button svg").count()) >= 4, t.slice(0, 250));
    if (i === 0) await shoot(page, "accommodation");
    await page.locator("[data-cabin-choice]").getByRole("button", { name: pick, exact: true }).click();
    await page.waitForTimeout(500);
    if (i === 3) {
      check("τελευταία ερώτηση: «Ολοκλήρωση»", (await cont().count()) === 1 && (await cont().innerText()).trim() === "Ολοκλήρωση");
      await cont().click();
    }
  }
  await page.waitForURL(/\/platform\/search\?/);
  const multi = new URL(page.url());
  check("σύνδεσμος: κάθε ρόλος με τη δική του διαμονή", multi.searchParams.get("cabin") === "skipper:bunk,hostess:private,cook:skipper,deckhand:unknown", multi.search);
  await page.waitForTimeout(1500);
  check("αποτελέσματα: «Δεν ξέρω ακόμα» εμφανίζεται ως «Διαμονή: αδιευκρίνιστη»", (await text(page)).includes("Διαμονή: αδιευκρίνιστη"), (await text(page)).slice(0, 400));
});

// 3. Ο επαγγελματίας: αίτημα πολυήμερο χωρίς καμπίνα, αίτημα με καμπίνα, και ημερήσιο.
sql(`select set_config('platform.trusted', 'true', false);
     with r as (
       insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role, fee_amount, fee_paid_at, expires_at, party_size, cabin_kind)
       select '${CLIENT}', d.s, d.e, id, 'Σαντορίνη', 'Σαντορίνη', 'skipper', 0, now(), now() + interval '1 day', 2, d.k
       from regions, (values (current_date + 81, current_date + 83, null), (current_date + 85, current_date + 87, 'skipper'), (current_date + 89, current_date + 89, null)) as d(s, e, k)
       where name = 'Κυκλάδες' returning id)
     insert into booking_request_pings (booking_request_id, skipper_id) select id, '${SP_KOSTAS}' from r;`);
await as("6900002005", async (page) => {
  for (const [locale, unknown, skipperCabin] of [["el", "Διαμονή: αδιευκρίνιστη", "Skipper cabin"], ["en", "Accommodation: not specified", "Skipper cabin"]]) {
    await page.context().addCookies([{ name: "sf_locale", value: locale, url: BASE }]);
    await go(page, "/platform/requests");
    await page.waitForTimeout(2500);
    const un = page.locator('[data-cabin="unknown"]');
    const sk = page.locator('[data-cabin="skipper"]');
    check(`${locale}: πολυήμερο χωρίς απάντηση → «${unknown}» με εικονίδιο ερωτηματικού`, (await un.count()) === 1 && (await un.first().innerText()).includes(unknown) && (await un.first().locator("svg").count()) === 1, String(await un.count()));
    check(`${locale}: με καμπίνα → «${skipperCabin}» με το δικό της εικονίδιο`, (await sk.count()) === 1 && (await sk.first().innerText()).includes(skipperCabin) && (await sk.first().locator("svg").count()) === 1);
    check(`${locale}: ημερήσια εκδρομή → καμία διαμονή (σύνολο 2 γραμμές διαμονής για 3 αιτήματα)`, (await page.locator("[data-cabin]").count()) === 2);
    if (locale === "el") await shoot(page, "accommodation-pro");
  }
});

sql(`select set_config('platform.trusted', 'true', false);
     delete from notifications where data ->> 'request_id' in (select id::text from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}');
     delete from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}';`);
sql(`update users set locale = ${mariaLocale0 ? `'${mariaLocale0}'` : "null"} where id = '${MARIA}'`);
sql(`update users set locale = ${kostasLocale0 ? `'${kostasLocale0}'` : "null"} where id = '${KOSTAS_USER}'`);
finish();
