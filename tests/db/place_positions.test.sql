-- Θέσεις μερών (0128): διαβάζονται από όλους, γράφονται μόνο από διαχειριστή.
-- Μετά το τεστ το run.sh ελέγχει ότι κάθε υπόλοιπο ισούται με το άθροισμα των κινήσεών του.
\i tests/db/helpers.sql

select pg_temp.act('postgres');

\echo '== ο διαχειριστής ορίζει και διορθώνει θέση'
select pg_temp.act('authenticated', :'ADMIN');
select admin_set_place_position('Αθήνα – Άλιμος', 37.9087, 23.7117);
select admin_set_place_position('Λαύριο', 37.7133, 24.0583);
select admin_set_place_position('Λαύριο', 37.72, 24.07);
select pg_temp.act('postgres');
select pg_temp.check('μία γραμμή ανά μέρος, η τελευταία τιμή κερδίζει',
  (select count(*) = 2 from place_positions) and (select lat = 37.72 and lng = 24.07 and updated_by is not null from place_positions where place_key = 'Λαύριο'));

\echo '== δημόσια ανάγνωση'
select pg_temp.act('anon');
select pg_temp.check('ο επισκέπτης διαβάζει τις θέσεις', (select count(*) = 2 from place_positions_public()));
select pg_temp.expect($$select * from place_positions$$, 'permission denied%');
select pg_temp.expect($$select admin_set_place_position('Πάρος', 37.08, 25.15)$$, 'permission denied%');

\echo '== μόνο διαχειριστής γράφει'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect($$select admin_set_place_position('Πάρος', 37.08, 25.15)$$, 'not_admin');
select pg_temp.expect($$select admin_reset_place_position('Λαύριο')$$, 'not_admin');
select pg_temp.expect($$insert into place_positions (place_key, lat, lng) values ('Πάρος', 37, 25)$$, 'permission denied%');

\echo '== έλεγχος τιμών'
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.expect($$select admin_set_place_position('', 37.08, 25.15)$$, 'invalid_value');
select pg_temp.expect($$select admin_set_place_position('Πάρος', 99, 25.15)$$, 'invalid_value');
select pg_temp.expect($$select admin_set_place_position('Πάρος', 37.08, 200)$$, 'invalid_value');
select pg_temp.expect($$select admin_set_place_position('Πάρος', null, 25.15)$$, 'invalid_value');

\echo '== επαναφορά στην αυτόματη θέση'
select admin_reset_place_position('Λαύριο');
select pg_temp.act('postgres');
select pg_temp.check('η διόρθωση σβήνεται', (select count(*) = 1 from place_positions) and not exists (select 1 from place_positions where place_key = 'Λαύριο'));
