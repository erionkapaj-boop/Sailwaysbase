// When a client first picks a professional, the card shows reliability and
// response rate (0109) next to the rating.
import { as, go, text, check, finish, sql, iso, daysFromToday } from "./lib.mjs";

// Enough history for Eleni: 3 answered offers.
sql(`
  insert into booking_requests (id, client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role, status, expires_at)
  select ('c9000000-0000-0000-0000-00000000000' || g)::uuid, 'a0000000-0000-0000-0000-000000000002', current_date + 60, current_date + 61,
         (select id from regions where name = 'Κυκλάδες'), 'x', 'x', 'skipper', 'expired_unclaimed', now() - interval '1 day'
    from generate_series(1, 3) g;
  insert into booking_request_pings (booking_request_id, skipper_id, status, declined_at)
  select ('c9000000-0000-0000-0000-00000000000' || g)::uuid, 'b0000000-0000-0000-0000-000000000006', 'pending', now()
    from generate_series(1, 3) g;
`);
const start = iso(daysFromToday(20)), end = iso(daysFromToday(22));
const region = sql(`select id from regions where name = 'Κυκλάδες'`);
const boat = sql(`select id from boat_types where name = 'Ιστιοπλοϊκό'`);
await as("6900002002", async (page) => {
  await go(page, `/platform/search?start=${start}&end=${end}&region=${region}&boat=${boat}&roles=skipper&party=2&cabin=true`);
  const t = await text(page);
  check("η κάρτα δείχνει ανταπόκριση", /100% ανταπόκριση/.test(t), t.slice(0, 300));
});
finish();
