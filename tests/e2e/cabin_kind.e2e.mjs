// Η ακριβής καμπίνα στο αίτημα που βλέπει ο επαγγελματίας (αίτημα προς εκείνον): κουκέτα, ιδιωτική,
// καμπίνα σκίπερ — η κάθε κάρτα γράφει ακριβώς την επιλογή του πελάτη, με το ίδιο εικονίδιο. Ελληνικά και αγγλικά.
import { BASE, as, go, check, finish, sql, shoot } from "./lib.mjs";

const CLIENT = "a0000000-0000-0000-0000-000000000002";
const SP_KOSTAS = "b0000000-0000-0000-0000-000000000005";
const t0 = sql(`select now()`);
// Η εναλλαγή γλώσσας αποθηκεύεται στο προφίλ: η αρχική γλώσσα του επαγγελματία επανέρχεται στο τέλος.
const locale0 = sql(`select coalesce(locale, '') from users where id = 'a0000000-0000-0000-0000-000000000005'`);
const kinds = ["bunk", "private", "skipper"];
for (const [i, kind] of kinds.entries()) {
  sql(`select set_config('platform.trusted', 'true', false);
       with r as (
         insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role,
                                       fee_amount, fee_paid_at, expires_at, party_size, cabin_kind)
         select '${CLIENT}', current_date + ${61 + i * 3}, current_date + ${63 + i * 3}, id, 'Σαντορίνη', 'Σαντορίνη', 'skipper',
                0, now(), now() + interval '1 day', 2, '${kind}' from regions where name = 'Κυκλάδες' returning id)
       insert into booking_request_pings (booking_request_id, skipper_id) select id, '${SP_KOSTAS}' from r;`);
}

const labels = { el: { bunk: "Κουκέτα", private: "Ιδιωτική καμπίνα", skipper: "Καμπίνα σκίπερ" }, en: { bunk: "Bunk", private: "Private cabin", skipper: "Skipper cabin" } };
const hints = { el: { bunk: "Κοινός χώρος με κουκέτες.", private: "Μεγάλη καμπίνα, συνήθως με τουαλέτα.", skipper: "Μικρή καμπίνα, ένα κρεβάτι στην πλώρη." },
                en: { bunk: "Shared space with bunk beds.", private: "Large cabin, usually with a toilet.", skipper: "Small cabin, one berth in the bow." } };
await as("6900002005", async (page) => {
  await go(page, "/platform/requests");
  await page.waitForTimeout(2500);
  const all = page.locator("[data-cabin]");
  check("ο επαγγελματίας βλέπει τις τρεις καμπίνες στα αιτήματά του", (await all.count()) === 3, String(await all.count()));
  for (const kind of kinds) {
    const el = page.locator(`[data-cabin="${kind}"]`);
    const txt = await el.first().innerText();
    check(`${kind}: γράφει «${labels.el[kind]}» και την περιγραφή της, με εικονίδιο`,
      (await el.count()) === 1 && txt.includes(labels.el[kind]) && txt.includes(hints.el[kind]) && (await el.first().locator("svg").count()) === 1, txt);
    for (const other of kinds.filter((k) => k !== kind)) check(`${kind}: δεν γράφει «${labels.el[other]}»`, !txt.includes(labels.el[other]));
  }
  await shoot(page, "cabin-pings");
  await page.context().addCookies([{ name: "sf_locale", value: "en", url: BASE }]);
  await go(page, "/platform/requests");
  await page.waitForTimeout(2500);
  for (const kind of kinds) {
    const txt = await page.locator(`[data-cabin="${kind}"]`).first().innerText();
    check(`en ${kind}: «${labels.en[kind]}» και περιγραφή`, txt.includes(labels.en[kind]) && txt.includes(hints.en[kind]), txt);
  }
});

sql(`select set_config('platform.trusted', 'true', false);
     delete from notifications where data ->> 'request_id' in (select id::text from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}');
     delete from booking_requests where client_id = '${CLIENT}' and created_at >= '${t0}';`);
sql(`update users set locale = ${locale0 ? `'${locale0}'` : "null"} where id = 'a0000000-0000-0000-0000-000000000005'`);
check("επανήλθε η γλώσσα του επαγγελματία", sql(`select coalesce(locale, '') from users where id = 'a0000000-0000-0000-0000-000000000005'`) === locale0);
finish();
