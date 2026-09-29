-- 0119: μέρη που δεν βρέθηκαν στο πεδίο «Από πού ξεκινά το ταξίδι;».
\i tests/db/helpers.sql
select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset

\echo '== πρόσβαση'
select pg_temp.act('anon');
select pg_temp.expect('select * from place_search_misses', 'permission denied for table place_search_misses');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect('select * from admin_place_misses(30)', 'owner_only');

\echo '== καταγραφή'
select pg_temp.act('anon');
select log_place_miss('Μαρμαρίς', :'cyclades', 'sess-miss-0001');
select log_place_miss('μαρμαρις', :'cyclades', 'sess-miss-0002');
select log_place_miss('Μαρμαρίς', :'cyclades', 'sess-miss-0001');
select log_place_miss('Γούβα 6944123456 x@y.gr', null, 'sess-miss-0003');
select log_place_miss('α', null, 'sess-miss-0004');
select pg_temp.act('authenticated', :'CLIENT');
select log_place_miss('Φετιγιέ', null, 'sess-miss-0005');
select pg_temp.act('postgres');
select pg_temp.check('ίδια επίσκεψη, ίδιο κείμενο: μία φορά', (select count(*) = 2 from place_search_misses where place_miss_key(query) = 'μαρμαρισ'));
select pg_temp.check('χωρίς τηλέφωνα και email', not exists (select 1 from place_search_misses where query ~ '[0-9]{4}|@'));
select pg_temp.check('πολύ μικρό κείμενο αγνοείται', not exists (select 1 from place_search_misses where query = 'α'));
select pg_temp.check('χωρίς χρήστη', not exists (select 1 from information_schema.columns where table_name = 'place_search_misses' and column_name = 'user_id'));

\echo '== ο ιδιοκτήτης βλέπει ομαδοποιημένα'
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('Μαρμαρίς: 2 φορές, Κυκλάδες',
  (select times = 2 and regions = 'Κυκλάδες' from admin_place_misses(30) where place_miss_key(query) = 'μαρμαρισ'));
select pg_temp.check('Γούβα καταγράφηκε καθαρό', exists (select 1 from admin_place_misses(30) where query = 'Γούβα'));
