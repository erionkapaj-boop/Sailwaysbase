-- Στοιχεία σκάφους στα αιτήματα (0127): μοντέλο, μήκος σε πόδια, έτος.
-- Προαιρετικά· ελέγχονται τα όρια· φαίνονται στον δημόσιο πίνακα· περνούν στην
-- κράτηση. Μετά το τεστ το run.sh ελέγχει ότι κάθε υπόλοιπο ισούται με το
-- άθροισμα των κινήσεών του.
\i tests/db/helpers.sql

\set SP_KOSTAS 'b0000000-0000-0000-0000-000000000005'

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset

\echo '== αίτημα πληρώματος με στοιχεία σκάφους'
select pg_temp.act('authenticated', :'CLIENT');
select (post_open_request(current_date + 20, current_date + 22, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 4, true, 'Σημείωση',
        '  Lagoon 42  ', 42, 2019)).id as r1 \gset
select (post_open_request(current_date + 25, current_date + 27, :'cyclades', 'Πάρος', 'Πάρος', :'sailboat', 'hostess', 2, null, null)).id as r2 \gset
select pg_temp.act('postgres');
select pg_temp.check('αποθηκεύτηκαν, με καθαρισμένο όνομα μοντέλου',
  (select boat_model = 'Lagoon 42' and boat_length_ft = 42 and boat_year = 2019 from booking_requests where id = :'r1'));
select pg_temp.check('χωρίς στοιχεία σκάφους το αίτημα μένει έγκυρο',
  (select boat_model is null and boat_length_ft is null and boat_year is null and board_open from booking_requests where id = :'r2'));

\echo '== όρια τιμών'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select post_open_request(current_date+30, current_date+31, %L, %L, %L, %L, %L, 2, null, null, %L, 5, 2019)', :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 'X'), 'invalid_boat');
select pg_temp.expect(format('select post_open_request(current_date+30, current_date+31, %L, %L, %L, %L, %L, 2, null, null, %L, 40, 1800)', :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 'X'), 'invalid_boat');
select pg_temp.expect(format('select post_open_request(current_date+30, current_date+31, %L, %L, %L, %L, %L, 2, null, null, %L, 40, 2019)', :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', repeat('x', 61)), 'invalid_boat');
select pg_temp.expect(format('insert into booking_requests (client_id, start_date, end_date, region_id, crew_role, boat_length_ft) values (%L, current_date+30, current_date+31, %L, %L, 500)', :'CLIENT', :'cyclades', 'skipper'), '%booking_requests_boat_check%');

\echo '== δημόσιος πίνακας: φαίνονται σε επισκέπτη'
select pg_temp.act('anon');
select pg_temp.check('ο πίνακας επιστρέφει μοντέλο, μήκος, έτος',
  (select count(*) = 1 from board_requests() where id = :'r1' and boat_model = 'Lagoon 42' and boat_length_ft = 42 and boat_year = 2019));

\echo '== η κράτηση παίρνει τα στοιχεία από το αίτημα'
select pg_temp.act('authenticated', :'KOSTAS');
select claim_board_request(:'r1', :'SP_KOSTAS');
select pg_temp.act('authenticated', :'CLIENT');
select claim_id as c1 from client_list_board_claims(:'r1') limit 1 \gset
select client_choose_board_claim(:'c1');
select pg_temp.act('postgres');
select pg_temp.check('η κράτηση έχει Lagoon 42, 42 πόδια, 2019',
  (select boat_model = 'Lagoon 42' and boat_length_ft = 42 and boat_year = 2019 from bookings where booking_request_id = :'r1'));

\echo '== μεταφορά σκάφους'
select pg_temp.act('authenticated', :'CLIENT');
select (create_delivery_request('Λαύριο', 'Λευκάδα', 300, 'fixed', current_date + 30, 0, true, true, false, null, true, false, null,
        'Bavaria 46', 46, 2015)).id as d1 \gset
select (create_delivery_request('Λαύριο', 'Κέρκυρα', 300, 'fixed', current_date + 31, 0, true, true, false, null, true, false)).id as d2 \gset
select pg_temp.expect(format('select create_delivery_request(%L, %L, 300, %L, current_date + 30, 0, true, true, false, null, true, false, null, %L, 46, 3000)', 'Α', 'Β', 'fixed', 'X'), 'invalid_boat');
select (create_open_delivery_role_request(:'d1', 'skipper', 900)).id as dr1 \gset
select pg_temp.act('postgres');
select pg_temp.check('η μεταφορά αποθηκεύει τα στοιχεία· χωρίς στοιχεία μένει έγκυρη',
  (select boat_model = 'Bavaria 46' and boat_length_ft = 46 and boat_year = 2015 from delivery_requests where id = :'d1')
  and (select boat_model is null from delivery_requests where id = :'d2'));
select pg_temp.act('anon');
select pg_temp.check('ο πίνακας μεταφορών επιστρέφει τα στοιχεία σκάφους',
  (select count(*) = 1 from delivery_board_requests() where id = :'dr1' and boat_model = 'Bavaria 46' and boat_length_ft = 46 and boat_year = 2015));
select pg_temp.act('authenticated', :'KOSTAS');
select claim_delivery_board_request(:'dr1', :'SP_KOSTAS');
select pg_temp.act('authenticated', :'CLIENT');
select claim_id as dc1 from client_list_delivery_claims(:'dr1') limit 1 \gset
select client_choose_delivery_claim(:'dc1');
select pg_temp.act('postgres');
select pg_temp.check('η κράτηση μεταφοράς έχει Bavaria 46, 46 πόδια, 2015',
  (select boat_model = 'Bavaria 46' and boat_length_ft = 46 and boat_year = 2015 from delivery_bookings where delivery_role_request_id = :'dr1'));

\echo '== πρόσκληση μεταφοράς σε επαγγελματία: φαίνεται, με τα στοιχεία σκάφους, χωρίς σημειώσεις'
\set SP_GIORGOS 'b0000000-0000-0000-0000-000000000004'
select pg_temp.act('postgres');
insert into delivery_availability_windows (skipper_id, crew_role, start_date, end_date) values (:'SP_GIORGOS', 'skipper', current_date + 1, current_date + 90);
select pg_temp.act('authenticated', :'CLIENT');
select (create_delivery_request('Πειραιάς', 'Κως', 200, 'fixed', current_date + 40, 0, true, true, false, null, true, false, 'Μυστική σημείωση',
        'Lagoon 40', 40, 2010)).id as d3 \gset
select (create_delivery_role_request(:'d3', 'skipper', 700, array[:'SP_GIORGOS']::uuid[])).id as rr3 \gset
select pg_temp.act('authenticated', :'GIORGOS');
select pg_temp.check('ο επαγγελματίας βλέπει την πρόσκληση με Lagoon 40, 40 πόδια, 2010',
  (select count(*) = 1 from list_my_delivery_pings() where (request).boat_model = 'Lagoon 40' and (request).boat_length_ft = 40 and (request).boat_year = 2010));
select pg_temp.check('οι σημειώσεις μένουν κρυφές πριν την κράτηση',
  (select count(*) = 1 from list_my_delivery_pings() where (request).notes is null and (request).origin_point = 'Πειραιάς'));
