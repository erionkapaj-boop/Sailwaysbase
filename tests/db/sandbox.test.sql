-- Test phones (+306980000001..99) have a well-known password, so anyone can be
-- them. They must live in their own world: never admin, never meeting a real
-- account.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset
select set_config('platform.trusted', 'true', false);
insert into auth.users (id, phone) values
  ('e0000000-0000-0000-0000-000000000001', '306980000051'),
  ('e0000000-0000-0000-0000-000000000002', '306980000052');
insert into users (id, role, phone_number, full_name, status, phone_verified_at, photo_reviewed_at) values
  ('e0000000-0000-0000-0000-000000000001', 'client',  '+306980000051', 'Δοκιμαστικός Πελάτης', 'active', now(), now()),
  ('e0000000-0000-0000-0000-000000000002', 'skipper', '+306980000052', 'Δοκιμαστικός Skipper', 'active', now(), now());
insert into skipper_profiles (id, user_id, role, full_name, price_per_day, approval_status, years_experience)
  values ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'skipper', 'Δοκιμαστικός Skipper', 250, 'approved', 3);
with w as (insert into availability_windows (skipper_id, start_date, end_date)
           values ('f0000000-0000-0000-0000-000000000002', current_date, current_date + 60) returning id)
  insert into availability_window_regions select w.id, :'cyclades' from w;
insert into skipper_boat_types (skipper_id, boat_type_id) values ('f0000000-0000-0000-0000-000000000002', :'sailboat');
select set_config('platform.trusted', '', false);
\set TCLIENT 'e0000000-0000-0000-0000-000000000001'
\set TPRO    'e0000000-0000-0000-0000-000000000002'
\set TSP     'f0000000-0000-0000-0000-000000000002'
\set SP_ELENI 'b0000000-0000-0000-0000-000000000006'

\echo '== ποτέ admin'
select pg_temp.expect(format('update users set is_staff_admin = true where id = %L', :'TPRO'), 'test_phone_cannot_be_admin');
select pg_temp.expect(format('update users set role = %L where id = %L', 'admin', :'TCLIENT'), 'test_phone_cannot_be_admin');
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.expect(format('select admin_set_staff_admin(%L, true)', :'TPRO'), 'test_phone_cannot_be_admin');

\echo '== η αναζήτηση δείχνει μόνο τον ίδιο κόσμο'
select pg_temp.act('anon');
select pg_temp.check('ανώνυμος: δεν βλέπει τον δοκιμαστικό skipper', not exists (
  select 1 from search_available_skippers(current_date + 10, current_date + 12, :'cyclades', :'sailboat') where id = :'TSP'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('πραγματικός πελάτης: δεν βλέπει τον δοκιμαστικό skipper', not exists (
  select 1 from search_available_skippers(current_date + 10, current_date + 12, :'cyclades', :'sailboat') where id = :'TSP'));
select pg_temp.check('πραγματικός πελάτης: βλέπει κανονικά τους πραγματικούς', exists (
  select 1 from search_available_skippers(current_date + 10, current_date + 12, :'cyclades', :'sailboat')));
select pg_temp.act('authenticated', :'TCLIENT');
select pg_temp.check('δοκιμαστικός πελάτης: βλέπει μόνο τον δοκιμαστικό skipper', (
  select array_agg(id) = array[:'TSP'::uuid]
    from search_available_skippers(current_date + 10, current_date + 12, :'cyclades', :'sailboat')));
select pg_temp.expect('select search_available_skippers_all(current_date, current_date, null, null)', 'permission denied%');

\echo '== ούτε αίτημα ούτε κράτηση ανάμεσα στους δύο κόσμους'
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'TCLIENT', current_date + 10, current_date + 12, :'cyclades', 'Σύρος', 'Σύρος', :'sailboat', 'skipper')
  returning id as treq \gset
select pg_temp.expect(format('select pay_and_broadcast(%L, array[%L]::uuid[])', :'treq', :'SP_ELENI'), 'test_account_mismatch');
select pg_temp.act('postgres');
select pg_temp.check('ο δοκιμαστικός πελάτης δεν χρεώθηκε', not exists (
  select 1 from wallet_transactions where related_booking_request_id = :'treq'));
select pg_temp.act('authenticated', :'TCLIENT');
select pg_temp.check('μέσα στον ίδιο κόσμο όλα δουλεύουν',
  (pay_and_broadcast(:'treq', array[:'TSP']::uuid[])).fee_paid_at is not null);
select pg_temp.act('authenticated', :'TPRO');
select pg_temp.check('ο δοκιμαστικός skipper αποδέχεται', (claim_booking_request(:'treq', :'TSP')).status = 'confirmed');

select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 30, current_date + 32, :'cyclades', 'Σύρος', 'Σύρος', :'sailboat', 'skipper')
  returning id as rreq \gset
select pg_temp.expect(format('select pay_and_broadcast(%L, array[%L]::uuid[])', :'rreq', :'TSP'), 'test_account_mismatch');
