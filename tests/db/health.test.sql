-- Υγεία εφαρμογής (0116): οι έλεγχοι βρίσκουν μόνοι τους ό,τι κόλλησε, κλείνουν
-- μόνοι τους όταν διορθωθεί, και τα σφάλματα των χρηστών φτάνουν χωρίς
-- προσωπικά στοιχεία. Μόνο ο ιδιοκτήτης τα βλέπει.
\i tests/db/helpers.sql
select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select set_config('platform.trusted', 'true', false);
update users set is_staff_admin = true where id = :'SOFIA';
select set_config('platform.trusted', '', false);

\echo '== πρόσβαση'
select pg_temp.act('anon');
select pg_temp.expect('select * from health_issues', 'permission denied for table health_issues');
select pg_temp.expect('select * from health_events', 'permission denied for table health_events');
select pg_temp.expect('select run_health_checks()', 'permission denied for function run_health_checks');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('ο χρήστης δεν βλέπει θέματα', (select count(*) = 0 from health_issues));
select pg_temp.expect('select * from admin_health_issues()', 'owner_only');
select pg_temp.act('authenticated', :'SOFIA');
select pg_temp.expect('select * from admin_health_issues()', 'owner_only');
select pg_temp.expect('select admin_run_health_checks()', 'owner_only');

\echo '== καθαρή βάση: κανένα θέμα'
select pg_temp.act('authenticated', :'ADMIN');
select admin_run_health_checks() is not null;
select pg_temp.check('χωρίς προβλήματα, χωρίς θέματα', (select count(*) = 0 from admin_health_issues()));

\echo '== τρία πράγματα κολλάνε'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role)
  values (:'CLIENT', current_date + 20, current_date + 22, :'cyclades', 'Πάρος', 'Πάρος', 'skipper') returning id as req \gset
select (pay_and_broadcast(:'req', array['b0000000-0000-0000-0000-000000000004']::uuid[])).id is not null;
select pg_temp.act('authenticated', :'GIORGOS');
select (claim_booking_request(:'req', 'b0000000-0000-0000-0000-000000000004')).id as bk \gset
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role)
  values (:'CLIENT', current_date + 25, current_date + 26, :'cyclades', 'Νάξος', 'Νάξος', 'skipper') returning id as req2 \gset
select (pay_and_broadcast(:'req2', array['b0000000-0000-0000-0000-000000000005']::uuid[])).id is not null;
select pg_temp.act('postgres');
-- 1. πληρωμένο αίτημα χωρίς αποδέκτες 2. κράτηση που τελείωσε 3. υπόλοιπο ≠ κινήσεις
delete from booking_request_pings where booking_request_id = :'req2';
update bookings set start_date = current_date - 6, end_date = current_date - 4 where id = :'bk';
select set_config('platform.trusted', 'true', false);
update users set wallet_balance = wallet_balance + 7 where id = :'KOSTAS';
select set_config('platform.trusted', '', false);
select run_health_checks();
select pg_temp.check('βρέθηκε το πληρωμένο αίτημα χωρίς αποδέκτες',
  (select status = 'open' and occurrences = 1 and affected_users = 1 and sample->'ids' ? :'req2'
     from health_issues where fingerprint = 'data:paid_request_no_pings'));
select pg_temp.check('βρέθηκε η κράτηση που δεν έκλεισε', exists (select 1 from health_issues where fingerprint = 'data:booking_not_completed' and status = 'open'));
select pg_temp.check('βρέθηκε το υπόλοιπο που δεν ταιριάζει', exists (select 1 from health_issues where fingerprint = 'data:wallet_mismatch' and status = 'open'));
select pg_temp.check('ο ιδιοκτήτης ειδοποιήθηκε, ο υπάλληλος όχι',
  (select count(*) = 3 from notifications where kind = 'admin_health_issue' and user_id = :'ADMIN')
  and not exists (select 1 from notifications where kind = 'admin_health_issue' and user_id = :'SOFIA'));
select run_health_checks();
select pg_temp.check('δεύτερος έλεγχος: καμία διπλή ειδοποίηση',
  (select count(*) = 3 from notifications where kind = 'admin_health_issue' and user_id = :'ADMIN'));
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('ο ιδιοκτήτης τα βλέπει', (select count(*) = 3 from admin_health_issues()));

\echo '== διορθώνονται: κλείνουν μόνα τους'
select pg_temp.act('postgres');
select mark_bookings_completed();
select set_config('platform.trusted', 'true', false);
update users set wallet_balance = wallet_balance - 7 where id = :'KOSTAS';
select set_config('platform.trusted', '', false);
select run_health_checks();
select pg_temp.check('η κράτηση έκλεισε → το θέμα έκλεισε', (select status = 'resolved' from health_issues where fingerprint = 'data:booking_not_completed'));
select pg_temp.check('το υπόλοιπο διορθώθηκε → το θέμα έκλεισε', (select status = 'resolved' from health_issues where fingerprint = 'data:wallet_mismatch'));
select pg_temp.check('το αίτημα χωρίς αποδέκτες μένει ανοιχτό', (select status = 'open' from health_issues where fingerprint = 'data:paid_request_no_pings'));

\echo '== «λύθηκε» από τον ιδιοκτήτη, αλλά ξαναφαίνεται'
select pg_temp.act('authenticated', :'ADMIN');
select admin_resolve_health_issue('data:paid_request_no_pings');
select pg_temp.check('σημειώθηκε λυμένο', (select count(*) = 0 from admin_health_issues()));
select admin_run_health_checks() is not null;
select pg_temp.check('ξανανοίγει, μετρά την επανεμφάνιση',
  (select status = 'open' and reopened_count = 1 from health_issues where fingerprint = 'data:paid_request_no_pings'));
select pg_temp.expect($$select admin_resolve_health_issue('data:booking_not_completed')$$, 'issue_not_open');
select pg_temp.act('authenticated', :'CLIENT');
select cancel_booking_request(:'req2');

\echo '== σφάλματα από τον browser'
select pg_temp.act('authenticated', :'CLIENT');
select report_app_issue('error', 'weird_code', '/platform/booking/8a6f0c1e-1111-4222-8333-944445555666?x=1',
  'κάτι έσπασε για τον +30 694 123 4567 και maria@example.com');
select report_app_issue('error', 'weird_code', '/platform/booking/8a6f0c1e-1111-4222-8333-944445555666', 'πάλι');
select pg_temp.act('authenticated', :'NIKOS');
select report_app_issue('error', 'weird_code', '/platform/booking/0a6f0c1e-1111-4222-8333-944445555666', 'τρίτο');
select pg_temp.act('anon');
select report_app_issue('crash', '<script>alert(1)</script>', '/platform/login', 'TypeError: x is undefined');
select pg_temp.act('postgres');
select pg_temp.check('ίδιο σημείο, ένα θέμα: 2 φορές, 2 χρήστες (η επανάληψη μέσα στο λεπτό δεν μετρά)',
  (select occurrences = 2 and affected_users = 2 and area = '/platform/booking/:id'
     from health_issues where fingerprint = 'app:error:weird_code@/platform/booking/:id'));
select pg_temp.check('χωρίς τηλέφωνα και email στα στοιχεία',
  not exists (select 1 from health_events where detail ~ '694|maria@'));
select pg_temp.check('ο κωδικός καθαρίζεται από σύμβολα', exists (select 1 from health_issues where fingerprint = 'app:crash:scriptalert1script@/platform/login'));
select pg_temp.check('ανώνυμο σφάλμα καταγράφεται χωρίς χρήστη', exists (select 1 from health_events where user_id is null and page = '/platform/login'));
select pg_temp.act('authenticated', :'CLIENT');
do $$ begin for i in 1..40 loop perform report_app_issue('error', 'flood_' || i, '/platform', 'x'); end loop; end $$;
select pg_temp.act('postgres');
select pg_temp.check('ένας χρήστης: έως 30 γεγονότα την ώρα',
  (select count(*) <= 30 from health_events where user_id = :'CLIENT'));
select pg_temp.check('η διαχείριση το μετρά στο μενού',
  (select (admin_overview()->>'health_open')::int >= 1 from (select pg_temp.act('authenticated', :'ADMIN')) x));
