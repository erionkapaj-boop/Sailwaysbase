-- Η ακριβής καμπίνα (0130): κουκέτα / ιδιωτική / καμπίνα σκίπερ φτάνει αναλλοίωτη από τον
-- πελάτη στον επαγγελματία (πίνακας, αίτημα, κράτηση, αντικατάσταση). Το private_cabin
-- μένει σε συμφωνία (κουκέτα = false, τα άλλα δύο = true). Παλιές γραμμές διαβάζονται από το boolean.
\i tests/db/helpers.sql

\set SP_KOSTAS 'b0000000-0000-0000-0000-000000000005'

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset

\echo '== ανοιχτό αίτημα: κάθε τιμή αποθηκεύεται όπως επιλέχτηκε'
select pg_temp.act('authenticated', :'CLIENT');
select (post_open_request(current_date + 20, current_date + 22, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 2, false, null, null, null, null, 'bunk')).id as rb \gset
select (post_open_request(current_date + 21, current_date + 23, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 2, true, null, null, null, null, 'private')).id as rp \gset
select (post_open_request(current_date + 22, current_date + 24, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 2, true, null, null, null, null, 'skipper')).id as rs \gset
select pg_temp.act('postgres');
select pg_temp.check('κουκέτα → bunk, private_cabin false',
  (select cabin_kind = 'bunk' and private_cabin = false from booking_requests where id = :'rb'));
select pg_temp.check('ιδιωτική → private, private_cabin true',
  (select cabin_kind = 'private' and private_cabin = true from booking_requests where id = :'rp'));
select pg_temp.check('καμπίνα σκίπερ → skipper (όχι ιδιωτική), private_cabin true',
  (select cabin_kind = 'skipper' and private_cabin = true from booking_requests where id = :'rs'));

\echo '== ο τύπος κερδίζει αν το boolean διαφωνεί· χωρίς τύπο προκύπτει από το boolean'
select pg_temp.act('authenticated', :'CLIENT');
select (post_open_request(current_date + 23, current_date + 25, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 2, false, null, null, null, null, 'skipper')).id as rx \gset
select (post_open_request(current_date + 24, current_date + 26, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 2, true)).id as ro \gset
select (post_open_request(current_date + 25, current_date + 27, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 2, false)).id as rf \gset
select (post_open_request(current_date + 26, current_date + 28, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 2)).id as rn \gset
select pg_temp.act('postgres');
select pg_temp.check('τύπος skipper με false → private_cabin true',
  (select cabin_kind = 'skipper' and private_cabin = true from booking_requests where id = :'rx'));
select pg_temp.check('παλιά κλήση true → private · false → bunk · τίποτα → κενό',
  (select cabin_kind = 'private' from booking_requests where id = :'ro')
  and (select cabin_kind = 'bunk' from booking_requests where id = :'rf')
  and (select cabin_kind is null and private_cabin is null from booking_requests where id = :'rn'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select post_open_request(current_date+30, current_date+31, %L, %L, %L, %L, %L, 2, null, null, null, null, null, %L)', :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 'suite'), 'invalid_request');
select pg_temp.expect(format('insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role, cabin_kind) values (%L, current_date+30, current_date+31, %L, %L, %L, %L, %L)', :'CLIENT', :'cyclades', 'Νάξος', 'Νάξος', 'skipper', 'suite'), '%booking_requests_cabin_kind_check%');

\echo '== απευθείας εισαγωγή από τον πελάτη (αίτημα προς επιλεγμένους)'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role, party_size, private_cabin, cabin_kind)
  values (:'CLIENT', current_date + 40, current_date + 42, :'cyclades', 'Νάξος', 'Νάξος', 'skipper', 2, true, 'skipper');
select pg_temp.act('postgres');
select pg_temp.check('η εισαγωγή κρατά το skipper',
  (select count(*) = 1 from booking_requests where client_id = :'CLIENT' and start_date = current_date + 40 and cabin_kind = 'skipper' and private_cabin));
update booking_requests set private_cabin = false where client_id = :'CLIENT' and start_date = current_date + 40;
select pg_temp.check('αλλαγή μόνο του boolean ξαναυπολογίζει τον τύπο',
  (select cabin_kind = 'bunk' from booking_requests where client_id = :'CLIENT' and start_date = current_date + 40));

\echo '== δημόσιος πίνακας: φαίνεται σε επισκέπτη'
select pg_temp.act('anon');
select pg_temp.check('ο πίνακας επιστρέφει ακριβώς bunk / private / skipper',
  (select cabin_kind = 'bunk' from board_requests() where id = :'rb')
  and (select cabin_kind = 'private' from board_requests() where id = :'rp')
  and (select cabin_kind = 'skipper' from board_requests() where id = :'rs'));

\echo '== η κράτηση παίρνει την ακριβή καμπίνα από το αίτημα'
select pg_temp.act('authenticated', :'KOSTAS');
select claim_board_request(:'rs', :'SP_KOSTAS');
select pg_temp.act('authenticated', :'CLIENT');
select claim_id as c1 from client_list_board_claims(:'rs') limit 1 \gset
select client_choose_board_claim(:'c1');
select pg_temp.act('postgres');
select pg_temp.check('η κράτηση έχει skipper, όχι ιδιωτική',
  (select cabin_kind = 'skipper' and private_cabin from bookings where booking_request_id = :'rs'));

\echo '== η αντικατάσταση κρατά την ακριβή καμπίνα'
select id as old_booking from bookings where booking_request_id = :'rs' \gset
select pg_temp.act('postgres');
insert into bookings (booking_request_id, client_id, skipper_id, start_date, end_date, region_id, departure_point, arrival_point,
                      party_size, private_cabin, crew_role, status, replaces_booking_id, confirmed_at, skipper_claim_fee_amount)
  select booking_request_id, client_id, skipper_id, start_date, end_date, region_id, departure_point, arrival_point,
         party_size, private_cabin, crew_role, 'cancelled_by_skipper', id, now(), 0 from bookings where id = :'old_booking';
select pg_temp.check('κράτηση αντικατάστασης χωρίς τύπο παίρνει skipper από την αρχική',
  (select cabin_kind = 'skipper' from bookings where replaces_booking_id = :'old_booking'));
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role, private_cabin, replaces_booking_id, status)
  select client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role, private_cabin, id, 'cancelled' from bookings where id = :'old_booking';
select pg_temp.check('αίτημα αντικατάστασης χωρίς τύπο παίρνει skipper από την αρχική κράτηση',
  (select cabin_kind = 'skipper' from booking_requests where replaces_booking_id = :'old_booking'));
