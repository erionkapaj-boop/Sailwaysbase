-- A cancelled trip with an open replacement offer and two interested
-- candidates, ready for two simultaneous picks (see run.sh step 4).
\i tests/db/helpers.sql
select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role)
  values (:'CLIENT', current_date + 15, current_date + 18, :'cyclades', 'Μύκονος', 'Μύκονος', 'skipper')
  returning id as req \gset
select pay_and_broadcast(:'req', array['b0000000-0000-0000-0000-000000000003']::uuid[]);
select pg_temp.act('authenticated', :'NIKOS');
select (claim_booking_request(:'req', 'b0000000-0000-0000-0000-000000000003')).id as bk \gset
select cancel_booking(:'bk', 'test');
select pg_temp.act('authenticated', :'ADMIN');
select (admin_create_offer(array['b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000005']::uuid[],
        p_replaces_booking_id := :'bk')).id as offer \gset
select pg_temp.act('authenticated', :'GIORGOS');
select respond_to_replacement_offer(:'offer', 'b0000000-0000-0000-0000-000000000004', true);
select pg_temp.act('authenticated', :'KOSTAS');
select respond_to_replacement_offer(:'offer', 'b0000000-0000-0000-0000-000000000005', true);
