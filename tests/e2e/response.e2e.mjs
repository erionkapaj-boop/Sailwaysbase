// The "professional never answered" rule (migration 0107), in the browser:
// the booking shows the deadline to both sides, and once it passes with no
// answer the client can cancel without it counting against them.
import { as, go, text, check, finish, sql, iso, daysFromToday } from "./lib.mjs";

const CLIENT = "6900002002";
const PRO = "6900002007";
sql(`
  select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
  insert into booking_requests (id, client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role)
    select 'c3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', '${iso(daysFromToday(10))}', '${iso(daysFromToday(12))}',
           id, 'Σύρος', 'Σύρος', 'skipper' from regions where name = 'Κυκλάδες';
  select pay_and_broadcast('c3000000-0000-0000-0000-000000000001', array['b0000000-0000-0000-0000-000000000007'::uuid]);
  select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', false);
  select claim_booking_request('c3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000007');
`);
const bk = sql(`select id from bookings where booking_request_id = 'c3000000-0000-0000-0000-000000000001'`);

await as(PRO, async (page) => {
  await go(page, `/platform/bookings?focus=${bk}`);
  const t = await text(page);
  check("ο επαγγελματίας βλέπει την προθεσμία απάντησης", t.includes("Απάντησε στον πελάτη εδώ μέχρι"));
  check("και το αυτόματο πρώτο μήνυμα του πελάτη", t.includes("Αυτόματο μήνυμα"));
});

await as(CLIENT, async (page) => {
  await go(page, `/platform/bookings?focus=${bk}`);
  const t = await text(page);
  check("ο πελάτης βλέπει την προθεσμία", t.includes("πρέπει να σου απαντήσει στα μηνύματα εδώ μέχρι"));
  check("πριν λήξει δεν υπάρχει κουμπί", !t.includes("Δεν απάντησε: ακύρωση"));
});

sql(`update bookings set confirmed_at = now() - interval '25 hours' where id = '${bk}'`);
await as(CLIENT, async (page) => {
  await go(page, `/platform/bookings?focus=${bk}`);
  await page.getByRole("button", { name: "Δεν απάντησε: ακύρωση" }).click();
  await page.getByRole("button", { name: "Συνέχεια" }).click();
  await page.waitForTimeout(2000);
  check("η κράτηση ακυρώθηκε με ευθύνη του επαγγελματία",
    sql(`select status || ':' || (replacement_closed_at is not null) from bookings where id = '${bk}'`) === "cancelled_by_skipper:true");
});
finish();
