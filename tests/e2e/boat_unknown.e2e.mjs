// «Δεν ξέρω ακόμα» στον τύπο σκάφους (0131): κουτί με ερωτηματικό δίπλα στους τύπους· πάτημα → οι οθόνες
// μάρκας/μοντέλου/ποδιών/έτους προσπερνιούνται και ακολουθεί η βοήθεια· τα αποτελέσματα δεν φιλτράρουν ανά
// σκάφος και ο επαγγελματίας διαβάζει «Σκάφος: δεν έχει οριστεί». Ελληνικά και αγγλικά.
import { BASE, as, go, text, check, finish, sql, pickDay, daysFromToday, shoot } from "./lib.mjs";

const MARIA = "6900002002";
const CLIENT = "a0000000-0000-0000-0000-000000000002";
const SP_KOSTAS = "b0000000-0000-0000-0000-000000000005";
const KOSTAS_USER = "a0000000-0000-0000-0000-000000000005";
const t0 = sql(`select now()`);
const locale0 = sql(`select coalesce(locale, '') from users where id = '${KOSTAS_USER}'`);

await as(MARIA, async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/platform");
  await page.locator("[data-home-search]").click();
  await page.getByRole("button", { name: "Ελλάδα", exact: true }).click();
  await page.waitForTimeout(1500);
  const cont = () => page.locator(".sf-step-footer button").first().click();
  await cont(); await page.waitForTimeout(600); // λιμάνι
  await pickDay(page, daysFromToday(12)); await pickDay(page, daysFromToday(14)); await cont(); await page.waitForTimeout(600);
  await cont(); await page.waitForTimeout(600); // επιβάτες
  let t = await text(page);
  check("οθόνη σκάφους: τύποι και «Δεν ξέρω ακόμα» στο ίδιο πλέγμα, με εικονίδιο",
    t.includes("Με τι σκάφος θα ταξιδέψεις;") && (await page.locator("[data-boat-unknown]").count()) === 1 &&
    (await page.locator("[data-boat-unknown] svg").count()) === 1 && (await page.locator("button[aria-pressed]").count()) >= 5, t.slice(0, 300));
  await shoot(page, "boat-unknown");
  await page.locator("[data-boat-unknown]").click();
  await page.waitForTimeout(600);
  t = await text(page);
  check("πάτημα: πάει κατευθείαν στη βοήθεια, χωρίς μάρκα/μοντέλο/πόδια/έτος",
    t.includes("Ποια βοήθεια θα ήθελες στο ταξίδι σου;") && !t.includes("Τι μάρκα;"), t.slice(0, 200));
  await page.getByLabel("Πίσω").first().click();
  await page.waitForTimeout(500);
  check("πίσω: ξανά η οθόνη σκάφους, το κουτί μένει επιλεγμένο", (await page.locator("[data-boat-unknown]").getAttribute("aria-pressed")) === "true");
  await page.getByLabel("Μπροστά").first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Skipper/ }).click();
  await cont(); await page.waitForTimeout(500);
  await page.locator("[data-cabin-choice] button").first().click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Ολοκλήρωση" }).click();
  await page.waitForURL(/\/platform\/search\?/);
  const url = new URL(page.url());
  check("ο σύνδεσμος έχει boat=unknown και κανένα στοιχείο σκάφους", url.searchParams.get("boat") === "unknown" && !url.searchParams.get("bm") && !url.searchParams.get("bl"), url.search);
  await page.waitForTimeout(2500);
  t = await text(page);
  check("η σύνοψη γράφει «Σκάφος: δεν έχει οριστεί»", t.includes("Σκάφος: δεν έχει οριστεί"), t.slice(0, 400));
  // Αποτελέσματα: περιοχή με επαγγελματίες (Κυκλάδες), χωρίς τύπο σκάφους.
  const q = new URLSearchParams({ roles: "skipper", start: url.searchParams.get("start"), end: url.searchParams.get("end"), region: sql(`select id from regions where name = 'Κυκλάδες'`), point: "Νάξος", arrival: "Νάξος", boat: "unknown", party: "4", cabin: "skipper:bunk" });
  await go(page, `/platform/search?${q}`);
  await page.waitForTimeout(2500);
  t = await text(page);
  check("αποτελέσματα χωρίς φίλτρο σκάφους", /διαθέσιμοι? skipper/.test(t) && (await page.getByRole("button", { name: "Επιλογή", exact: true }).count()) > 0, t.slice(0, 400));
  await shoot(page, "boat-unknown-results");
});

// Αίτημα χωρίς τύπο σκάφους στον επαγγελματία.
sql(`select set_config('platform.trusted', 'true', false);
     with r as (
       insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role,
                                     fee_amount, fee_paid_at, expires_at, party_size, cabin_kind)
       select '${CLIENT}', current_date + 71, current_date + 73, id, 'Σαντορίνη', 'Σαντορίνη', 'skipper',
              0, now(), now() + interval '1 day', 2, 'bunk' from regions where name = 'Κυκλάδες' returning id)
     insert into booking_request_pings (booking_request_id, skipper_id) select id, '${SP_KOSTAS}' from r;`);
await as("6900002005", async (page) => {
  for (const [locale, label] of [["el", "Σκάφος: δεν έχει οριστεί"], ["en", "Boat: not set"]]) {
    await page.context().addCookies([{ name: "sf_locale", value: locale, url: BASE }]);
    await go(page, "/platform/requests");
    await page.waitForTimeout(2500);
    const t = await text(page);
    check(`${locale}: ο επαγγελματίας διαβάζει «${label}»`, t.includes(label), t.slice(0, 300));
    if (locale === "el") await shoot(page, "boat-unknown-pro");
  }
});

sql(`select set_config('platform.trusted', 'true', false);
     delete from notifications where data ->> 'request_id' in (select id::text from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}');
     delete from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}';`);
sql(`update users set locale = ${locale0 ? `'${locale0}'` : "null"} where id = '${KOSTAS_USER}'`);
finish();
