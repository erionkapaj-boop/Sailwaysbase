-- Δεν υπάρχουν δοκιμαστικοί λογαριασμοί (0134): ούτε δοκιμαστικό τηλέφωνο ούτε σήμανση δοκιμής.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
select pg_temp.check('η ενέργεια «σήμανση δοκιμής» δεν υπάρχει πια', not exists (select 1 from pg_proc where proname = 'admin_set_test_account'));

\echo '== απευθείας στη βάση'
select pg_temp.expect($$insert into users (id, role, phone_number, full_name, status) values ('e1000000-0000-0000-0000-000000000001', 'client', '+306980000051', 'Ψεύτικος', 'active')$$, 'test_accounts_disabled');
select pg_temp.expect(format($$update users set is_test_account = true where id = %L$$, :'CLIENT'), 'test_accounts_disabled');
select pg_temp.expect(format($$update users set phone_number = '+306980000052' where id = %L$$, :'CLIENT'), 'test_accounts_disabled');

\echo '== από την εγγραφή'
insert into auth.users (id, email, phone) values ('e1000000-0000-0000-0000-000000000002', 'x@example.com', '+306980000053');
select pg_temp.act('authenticated', 'e1000000-0000-0000-0000-000000000002');
select pg_temp.expect($$select complete_registration('Ψεύτικος', 'x@example.com', '+306980000053', null, true)$$, 'test_accounts_disabled');
select pg_temp.act('postgres');
select pg_temp.check('δεν δημιουργήθηκε λογαριασμός', not exists (select 1 from users where phone_number like '+3069800000%'));
select pg_temp.check('οι κανονικοί λογαριασμοί δεν επηρεάζονται', (select count(*) from users where phone_number like '+3069000020%') > 5);
