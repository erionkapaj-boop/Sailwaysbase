-- Όριο αιτημάτων ανά λογαριασμό (0133) και αίτημα για πολλούς skippers.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset

create or replace function pg_temp.post(p_start int) returns uuid language sql as $$
  select (post_open_request(current_date + p_start, current_date + p_start + 2,
          (select id from regions where name = 'Κυκλάδες'), 'Νάξος', 'Νάξος',
          (select id from boat_types where name = 'Ιστιοπλοϊκό'), 'skipper', 2, true)).id
$$;

select pg_temp.act('authenticated', :'ADMIN');
select admin_adjust_wallet(:'CLIENT', 50, 'Τεστ');
select (select value from platform_settings where key = 'client_request_fee') as fee \gset

\echo '== προεπιλογή και προνομιούχοι'
select pg_temp.check('προεπιλογή 10 για απλό πελάτη', request_limit_for(:'CLIENT') = 10);
select pg_temp.check('διαχειριστής χωρίς όριο', request_limit_for(:'ADMIN') >= 1000000);

\echo '== προσωπικό όριο: μόνο διαχειριστής το αλλάζει'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select admin_set_request_limit(%L, -1)', :'CLIENT'), 'not_admin');
update users set request_limit = -1 where id = :'CLIENT';
select pg_temp.check('ο ίδιος ο χρήστης δεν μπορεί να βάλει όριο', request_limit_for(:'CLIENT') = 10);
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.expect(format('select admin_set_request_limit(%L, 0)', :'CLIENT'), 'invalid_limit');
select admin_set_request_limit(:'CLIENT', 2);
select pg_temp.check('όριο 2', request_limit_for(:'CLIENT') = 2);

select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.post(100), pg_temp.post(101);
select pg_temp.expect('select pg_temp.post(102)', 'too_many_requests');

\echo '== πολλοί skippers: όλα ή τίποτα'
select pg_temp.expect(format('select post_open_requests(current_date+110, current_date+112, %L, %L, %L, %L, %L, 2, true, null, null, null, null, null, 1)', :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper'), 'too_many_requests');
select pg_temp.act('postgres');
select pg_temp.check('κανένα αίτημα δεν δημιουργήθηκε', (select count(*) from booking_requests where client_id = :'CLIENT' and start_date = current_date + 110) = 0);

\echo '== χωρίς όριο'
select pg_temp.act('authenticated', :'ADMIN');
select admin_set_request_limit(:'CLIENT', -1);
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select post_open_requests(current_date+110, current_date+112, %L, %L, %L, %L, %L, 2, true, null, null, null, null, null, 0)', :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper'), 'invalid_count');
select pg_temp.expect(format('select post_open_requests(current_date+110, current_date+112, %L, %L, %L, %L, %L, 2, true, null, null, null, null, null, 11)', :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper'), 'invalid_count');
select count(*) as made from post_open_requests(current_date+110, current_date+112, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 2, true, null, null, null, null, null, 4) \gset
select pg_temp.act('postgres');
select pg_temp.check('4 ξεχωριστά αιτήματα, ίδια ημερομηνία, χρέωση καθενός',
  :made = 4 and (select count(*) from booking_requests where client_id = :'CLIENT' and start_date = current_date + 110 and fee_amount = :fee) = 4);
select pg_temp.check('δεσμεύονται και τα 4 + τα 2 πριν',
  user_reserved_credits(:'CLIENT') = :fee * 6);

\echo '== ανεπαρκή credits: κανένα αίτημα'
select (wallet_balance - user_reserved_credits(id) - :fee * 2) as drop_by from users where id = :'CLIENT' \gset
select pg_temp.act('authenticated', :'ADMIN');
select admin_adjust_wallet(:'CLIENT', -:drop_by, 'Τεστ');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select post_open_requests(current_date+120, current_date+122, %L, %L, %L, %L, %L, 2, true, null, null, null, null, null, 3)', :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper'), 'insufficient_wallet');
select count(*) as two from post_open_requests(current_date+120, current_date+122, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 2, true, null, null, null, null, null, 2) \gset
select pg_temp.check('2 αιτήματα με ακριβώς 2 διαθέσιμα', :two = 2);
