-- Δεν υπάρχει «δοκιμαστικός κόσμος» (0135): φεύγουν η στήλη, οι έλεγχοι και τα φίλτρα, και η σειρά +3069800000NN
-- ελευθερώνεται για κανονική εγγραφή. Οι αναζητήσεις και οι κρατήσεις δουλεύουν όπως πριν.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
select pg_temp.check('δεν υπάρχει η στήλη is_test_account', not exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'is_test_account'));
select pg_temp.check('δεν υπάρχουν οι συναρτήσεις του δοκιμαστικού κόσμου',
  not exists (select 1 from pg_proc where proname in ('in_test_world', 'is_test_phone', 'guard_same_world', 'guard_test_phone_admin', 'guard_no_test_accounts', 'admin_set_test_account')));
select pg_temp.check('καμία συνάρτηση δεν αναφέρεται στον δοκιμαστικό κόσμο',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and (p.prosrc ilike '%in_test_world%' or p.prosrc ilike '%is_test_account%' or p.prosrc ilike '%is_test_phone%')));

\echo '== η σειρά +3069800000NN είναι κανονικοί αριθμοί'
insert into auth.users (id, email, phone) values ('e1000000-0000-0000-0000-000000000002', 'x@example.com', '+306980000053');
select pg_temp.act('authenticated', 'e1000000-0000-0000-0000-000000000002');
select complete_registration('Κανονικός Πελάτης', 'x@example.com', '+306980000053', null, true);
select pg_temp.act('postgres');
select pg_temp.check('η εγγραφή γίνεται', (select count(*) from users where phone_number = '+306980000053') = 1);

\echo '== οι αναζητήσεις δουλεύουν χωρίς το φίλτρο κόσμων'
select pg_temp.act('authenticated', :'CLIENT');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset
select count(*) as found from search_available_skippers(current_date + 10, current_date + 12, :'cyclades', :'sailboat') \gset
select pg_temp.act('postgres');
select pg_temp.check('η αναζήτηση επιστρέφει επαγγελματίες', :found > 0);
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('η λίστα λογαριασμών της διαχείρισης δουλεύει', (select count(*) from admin_list_accounts()) > 5);
