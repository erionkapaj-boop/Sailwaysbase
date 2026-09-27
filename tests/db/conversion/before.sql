-- Πριν το 0110: κινήσεις σε ευρώ, με τα παλιά τέλη (15€ αίτημα, 25€ ανάληψη),
-- και πράγματα που μένουν ανοιχτά τη στιγμή της μετατροπής.
\i tests/db/helpers.sql
\set SP_NIKOS  'b0000000-0000-0000-0000-000000000003'
\set SP_GIORGOS 'b0000000-0000-0000-0000-000000000004'
\set SP_ELENI  'b0000000-0000-0000-0000-000000000006'
select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset
insert into delivery_availability_windows (skipper_id, crew_role, start_date, end_date)
  values (:'SP_GIORGOS', 'skipper', current_date + 1, current_date + 90);

-- Κατάθεση 500€ στην πελάτισσα.
select pg_temp.act('authenticated', :'ADMIN');
select admin_credit_wallet(:'CLIENT', 500, 'Τραπεζική κατάθεση');
-- Υπόλοιπα που δεν διαιρούνται ακριβώς με το 50 (στρογγυλοποίηση προς τα πάνω).
select admin_adjust_wallet(:'PETROS', -60, 'δοκιμή');
select admin_credit_wallet(:'KOSTAS', 20, 'δοκιμή');

-- Α: ανοιχτό αίτημα, πληρωμένο 15€.
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 20, current_date + 22, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper')
  returning id as req_a \gset
select (pay_and_broadcast(:'req_a', array[:'SP_ELENI']::uuid[])).fee_amount = 15 as "αίτημα Α: 15€";

-- Β: κράτηση (15€ + 25€), που ο επαγγελματίας ακυρώνει → ανοιχτή υπόθεση αντικατάστασης.
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 25, current_date + 27, :'cyclades', 'Πάρος', 'Πάρος', :'sailboat', 'skipper')
  returning id as req_b \gset
select (pay_and_broadcast(:'req_b', array[:'SP_NIKOS']::uuid[])).status is not null;
select pg_temp.act('authenticated', :'NIKOS');
select (claim_booking_request(:'req_b', :'SP_NIKOS')).id as bk_b \gset
select (cancel_booking(:'bk_b', 'Αρρώστησα')).status;

-- Γ: μεταφορά 2000 μιλίων, 350€ τέλος πελάτη, ανοιχτή.
select pg_temp.act('authenticated', :'CLIENT');
select (create_delivery_request('Λαύριο', 'Μάλτα', 2000, 'fixed', current_date + 30, 0,
        true, true, false, null, true, false)).id as dr \gset
select (create_delivery_role_request(:'dr', 'skipper', 3000, array[:'SP_GIORGOS']::uuid[])).client_fee > 50 as "μεταφορά σε €";

select pg_temp.act('postgres');
select pg_temp.check('πριν: το αίτημα κόστισε 15€', (select fee_amount = 15 from booking_requests where id = :'req_a'));
select pg_temp.check('πριν: η ανάληψη κόστισε 25€', exists (
  select 1 from wallet_transactions where user_id = :'NIKOS' and type = 'claim_fee' and amount = -25));
-- Η κατάσταση πριν τη μετατροπή, για τους ελέγχους μετά.
create table conv_before as
  select id as user_id, wallet_balance from users;
create table conv_ids (k text primary key, id uuid, n numeric);
insert into conv_ids values
  ('req_a', :'req_a', null), ('bk_b', :'bk_b', null), ('dr', :'dr', null),
  ('notif', null, (select count(*) from notifications)),
  ('dr_fee', null, (select client_fee from delivery_role_requests where delivery_request_id = :'dr'));
