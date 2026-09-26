-- A platform a few years in: 20,000 clients, 2,000 professionals, 60,000
-- requests, 25,000 bookings, 300,000 notifications, 100,000 messages,
-- 120,000 wallet movements. Loaded on top of tests/db/seed.sql, whose actors
-- get a heavy history of their own: Μαρία (client) 300 requests, 3,000
-- notifications, 1,000 wallet movements; Κώστας (professional) 2,000 open
-- offers in his inbox; the admin 5,000 notifications.
--
-- Triggers are off while loading (session_replication_role = replica): this
-- is data that already happened, not actions to re-run. Constraints still
-- hold — the bookings are laid out so no professional is ever double-booked.
--
--   psql -d <db> -f tests/perf/scale.sql
\set ON_ERROR_STOP 1
set session_replication_role = replica;
set synchronous_commit = off;

create temp table lk as
select (select array_agg(id) from regions) as regions,
       (select array_agg(id) from boat_types) as boats;

-- uuid from a label and a number, the same on every run
create function pg_temp.u(label text, i int) returns uuid language sql immutable as
  $$ select md5(label || i)::uuid $$;

\echo '== people'
insert into auth.users (id, phone)
select pg_temp.u('client', i), '30695' || lpad(i::text, 7, '0') from generate_series(1, 20000) i
union all
select pg_temp.u('pro', i), '30684' || lpad(i::text, 7, '0') from generate_series(1, 2000) i;

insert into users (id, role, phone_number, full_name, status, phone_verified_at, photo_reviewed_at, wallet_balance, created_at, email)
select pg_temp.u('client', i), 'client'::user_role, '+30695' || lpad(i::text, 7, '0'), 'Πελάτης ' || i, 'active',
       now(), now(), 0, now() - (i % 900) * interval '1 day', 'client' || i || '@example.com'
  from generate_series(1, 20000) i
union all
select pg_temp.u('pro', i), 'skipper'::user_role, '+30684' || lpad(i::text, 7, '0'), 'Επαγγελματίας ' || i,
       case when i % 97 = 0 then 'suspended'::user_status else 'active' end,
       now(), now(), 0, now() - (i % 900) * interval '1 day', 'pro' || i || '@example.com'
  from generate_series(1, 2000) i;

insert into client_profiles (user_id)
select pg_temp.u('client', i) from generate_series(1, 20000) i;

insert into skipper_profiles (id, user_id, role, full_name, price_per_day, approval_status, years_experience,
                              rating_avg, rating_count, tier)
select pg_temp.u('sp', i), pg_temp.u('pro', i),
       (array['skipper','skipper','skipper','hostess','cook','deckhand'])[1 + i % 6]::crew_role,
       'Επαγγελματίας ' || i, 210 + (i % 40) * 10,
       case when i % 50 = 0 then 'pending' else 'approved' end::skipper_approval_status,
       i % 25, 3.5 + (i % 15) / 10.0, i % 40,
       (array['low','medium','high'])[1 + i % 3]::skipper_tier
  from generate_series(1, 2000) i;

-- Two availability windows each (past-to-future), two regions each.
insert into availability_windows (id, skipper_id, start_date, end_date)
select pg_temp.u('win', i * 2 + w), pg_temp.u('sp', i),
       current_date - 30 + w * 70, current_date + 60 + w * 70
  from generate_series(1, 2000) i, generate_series(0, 1) w;
insert into availability_window_regions (window_id, region_id)
select pg_temp.u('win', i * 2 + w), lk.regions[1 + (i + r) % array_length(lk.regions, 1)]
  from generate_series(1, 2000) i, generate_series(0, 1) w, generate_series(0, 1) r, lk
on conflict do nothing;
insert into skipper_boat_types (skipper_id, boat_type_id)
select pg_temp.u('sp', i), lk.boats[1 + (i + b) % array_length(lk.boats, 1)]
  from generate_series(1, 2000) i, generate_series(0, 1) b, lk
on conflict do nothing;

\echo '== requests, offers, bookings'
-- Requests 1..25000 became bookings; the rest are open, expired or cancelled.
-- Booking k: professional 1 + k % 2000, its (k / 2000)-th slot of 28 days,
-- from ~10 months ago to 2 months ahead — never overlapping for one person.
insert into booking_requests (id, client_id, start_date, end_date, region_id, departure_point, arrival_point,
                              boat_type_id, crew_role, fee_amount, fee_paid_at, status, expires_at, created_at, origin,
                              party_size, private_cabin)
select pg_temp.u('req', i),
       case when i <= 300 then 'a0000000-0000-0000-0000-000000000002'::uuid else pg_temp.u('client', 1 + i % 20000) end,
       d.start_date, d.start_date + 3,
       lk.regions[1 + i % array_length(lk.regions, 1)], 'Λιμάνι ' || (i % 60), 'Λιμάνι ' || (i % 60),
       lk.boats[1 + i % array_length(lk.boats, 1)], 'skipper', 15, d.created_at,
       case when i <= 25000 then 'matched'
            when d.start_date > current_date and i % 4 = 0 then 'open'
            when i % 4 = 1 then 'cancelled'
            else 'expired_unclaimed' end::booking_request_status,
       d.created_at + interval '48 hours', d.created_at, 'client', 2 + i % 8, i % 2 = 0
  from generate_series(1, 60000) i, lk,
       lateral (select current_date - 300 + ((i - 1) / 2000) % 13 * 28 + (case when i > 25000 then i % 30 else 0 end) as start_date) s,
       lateral (select s.start_date, (s.start_date - 20)::timestamptz as created_at) d;

-- Every request offered to 3 professionals; plus Κώστας's 2,000 open offers.
insert into booking_request_pings (booking_request_id, skipper_id, sent_at, status)
select pg_temp.u('req', i), pg_temp.u('sp', 1 + (i + p * 7) % 2000),
       (select created_at from booking_requests where id = pg_temp.u('req', i)),
       case when i <= 25000 and p = 0 then 'claimed' when i <= 25000 then 'missed' else 'pending' end::ping_status
  from generate_series(1, 60000) i, generate_series(0, 2) p
on conflict do nothing;
insert into booking_request_pings (booking_request_id, skipper_id, sent_at, status)
select pg_temp.u('req', i), 'b0000000-0000-0000-0000-000000000005', now() - interval '1 hour', 'pending'
  from generate_series(40001, 42000) i
on conflict do nothing;
update booking_requests set status = 'open', expires_at = now() + interval '1 day', start_date = current_date + 30, end_date = current_date + 33
 where id in (select pg_temp.u('req', i) from generate_series(40001, 42000) i);

insert into bookings (id, booking_request_id, client_id, skipper_id, start_date, end_date, region_id, departure_point,
                      arrival_point, boat_type_id, crew_role, skipper_claim_fee_amount, skipper_claim_paid_at,
                      confirmed_at, status, created_at, party_size, private_cabin, trip_root_id,
                      cancelled_at, cancellation_reason)
select pg_temp.u('bk', i), r.id, r.client_id, pg_temp.u('sp', 1 + (i - 1) % 2000), r.start_date, r.end_date,
       r.region_id, r.departure_point, r.arrival_point, r.boat_type_id, 'skipper', 25, r.created_at,
       r.created_at, st.status, r.created_at, r.party_size, r.private_cabin, pg_temp.u('bk', i),
       case when st.status::text like 'cancelled%' then r.created_at + interval '2 days' end,
       case when st.status::text like 'cancelled%' then 'Άλλαξαν τα σχέδια' end
  from generate_series(1, 25000) i
  join booking_requests r on r.id = pg_temp.u('req', i)
  cross join lateral (select case
      when i % 23 = 0 then 'cancelled_by_client'
      when i % 31 = 0 then 'cancelled_by_skipper'
      when r.end_date < current_date then 'completed'
      else 'confirmed' end::booking_status as status) st;
-- A cancelled-by-professional booking is a closed replacement case by now.
update bookings set replacement_closed_at = cancelled_at + interval '3 days', replacement_closed_reason = 'Ιστορικό'
 where status = 'cancelled_by_skipper';

\echo '== messages, reviews'
insert into messages (booking_id, sender_id, content, sent_at, read_at)
select b.id, case when m % 2 = 0 then b.client_id else sp.user_id end,
       'Μήνυμα ' || m || ' για την κράτηση', b.created_at + m * interval '1 hour', b.created_at + m * interval '2 hour'
  from bookings b join skipper_profiles sp on sp.id = b.skipper_id, generate_series(1, 4) m;

insert into reviews (booking_id, reviewer_id, reviewee_id, rating, comment, created_at,
                     rating_safety, rating_seamanship, rating_professionalism, rating_cleanliness, rating_communication, rating_hospitality)
select b.id, b.client_id, sp.user_id, 4, 'Πολύ καλός', b.end_date + 1, 4, 4, 5, 4, 4, 4
  from bookings b join skipper_profiles sp on sp.id = b.skipper_id
 where b.status = 'completed' and abs(hashtext(b.id::text)) % 5 < 3;

\echo '== notifications, wallet'
insert into notifications (user_id, kind, data, link, read_at, created_at, email_status)
select case when i <= 3000 then 'a0000000-0000-0000-0000-000000000002'::uuid
            when i <= 5000 then 'a0000000-0000-0000-0000-000000000005'::uuid
            when i <= 10000 then 'a0000000-0000-0000-0000-000000000001'::uuid
            when i % 2 = 0 then pg_temp.u('client', 1 + i % 20000)
            else pg_temp.u('pro', 1 + i % 2000) end,
       (array['request_received','booking_confirmed','review_prompt','wallet','booking_cancelled'])[1 + i % 5],
       jsonb_build_object('port', 'Λιμάνι ' || (i % 60), 'start', current_date, 'end', current_date + 3),
       '/platform/bookings',
       case when i % 10 < 7 then now() - (i % 500) * interval '1 hour' end,
       now() - (i % 700) * interval '1 day', 'before_email'
  from generate_series(1, 300000) i;

insert into wallet_transactions (user_id, type, amount, related_booking_request_id, created_at)
select case when i <= 1000 then 'a0000000-0000-0000-0000-000000000002'::uuid else pg_temp.u('client', 1 + i % 20000) end,
       'request_fee', -15, pg_temp.u('req', 1 + i % 60000), now() - (i % 700) * interval '1 day'
  from generate_series(1, 120000) i;
-- Keep every balance equal to its ledger (tests/db/wallet_check.sql).
insert into wallet_transactions (user_id, type, amount, created_at)
select user_id, 'deposit', -sum(amount) + 100, now() - interval '800 days'
  from wallet_transactions group by user_id having sum(amount) < 0;
update users u set wallet_balance = l.total
  from (select user_id, sum(amount) total from wallet_transactions group by user_id) l
 where l.user_id = u.id;

set session_replication_role = origin;
analyze;
\echo '== done'
select (select count(*) from users) users, (select count(*) from booking_requests) requests,
       (select count(*) from booking_request_pings) pings, (select count(*) from bookings) bookings,
       (select count(*) from notifications) notifications, (select count(*) from messages) messages,
       (select count(*) from wallet_transactions) wallet;
