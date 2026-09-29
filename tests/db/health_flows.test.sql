-- Υγεία εφαρμογής, Φάση 2 (0117): λούπες και εγκαταλείψεις.
\i tests/db/helpers.sql

\echo '== πρόσβαση'
select pg_temp.act('anon');
select pg_temp.expect('select * from flow_events', 'permission denied for table flow_events');
select pg_temp.expect('select * from flow_stats(7)', 'permission denied for function flow_stats');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect('select * from admin_flow_stats(7)', 'owner_only');

\echo '== καταγραφή βημάτων'
select pg_temp.act('anon');
select track_flow('register', 'open', 'sess-anon-0001');
select track_flow('register', 'open', 'sess-anon-0001');
select track_flow('register', 'hack', 'sess-anon-0001');
select track_flow('nonsense', 'open', 'sess-anon-0001');
select track_flow('register', 'open', 'x');
select pg_temp.act('postgres');
select pg_temp.check('ένα βήμα μία φορά ανά επίσκεψη· άγνωστα βήματα/ροές/επισκέψεις αγνοούνται',
  (select count(*) = 1 from flow_events));

\echo '== ροή όπου οι περισσότεροι σταματούν'
-- 6 επισκέψεις ξεκινούν αγορά credits, 1 ολοκληρώνει.
select pg_temp.act('authenticated', :'CLIENT');
do $$ begin
  for i in 1..6 loop perform track_flow('topup', 'open', 'sess-topup-000' || i); end loop;
  perform track_flow('topup', 'done', 'sess-topup-0001');
end $$;
-- Αίτημα: 5 ξεκινούν, 3 ολοκληρώνουν — δεν είναι πρόβλημα.
do $$ begin
  for i in 1..5 loop perform track_flow('request', 'picked', 'sess-req-000' || i); end loop;
  for i in 1..5 loop perform track_flow('request', 'send', 'sess-req-000' || i); end loop;
  for i in 1..3 loop perform track_flow('request', 'done', 'sess-req-000' || i); end loop;
end $$;
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('στατιστικά: αγορά 6 → 1',
  (select started = 6 and completed = 1 and stop_step = 'άνοιξε την αγορά' from admin_flow_stats(7) where flow = 'topup'));
select pg_temp.check('στατιστικά: αίτημα 5 → 3, σταματούν στην αποστολή',
  (select started = 5 and completed = 3 and stop_step = 'πάτησε αποστολή' from admin_flow_stats(7) where flow = 'request'));
select admin_run_health_checks() is not null;
select pg_temp.act('postgres');
select pg_temp.check('θέμα για την αγορά credits, με το βήμα όπου σταματούν',
  (select status = 'open' and source = 'flow' and occurrences = 5 and sample->>'stop_step' = 'άνοιξε την αγορά'
     from health_issues where fingerprint = 'flow:topup'));
select pg_temp.check('κανένα θέμα για το αίτημα (60% ολοκληρώνουν)', not exists (select 1 from health_issues where fingerprint = 'flow:request'));
select pg_temp.check('λίγες επισκέψεις (<5) δεν ανοίγουν θέμα', not exists (select 1 from health_issues where fingerprint = 'flow:register'));

-- Περισσότεροι ολοκληρώνουν → το θέμα κλείνει μόνο του.
select pg_temp.act('authenticated', :'CLIENT');
do $$ begin for i in 2..5 loop perform track_flow('topup', 'done', 'sess-topup-000' || i); end loop; end $$;
select pg_temp.act('postgres');
select run_health_checks() is not null;
select pg_temp.check('5 από 6 ολοκλήρωσαν → το θέμα έκλεισε', (select status = 'resolved' from health_issues where fingerprint = 'flow:topup'));

\echo '== «κολλάει»'
select pg_temp.act('authenticated', :'CLIENT');
select report_app_issue('stuck', 'insufficient_wallet', '/platform/search', '3 αποτυχίες σε 2 λεπτά');
select report_app_issue('stuck', 'pingpong', '/platform/requests', '/platform/requests ↔ /platform/wallet');
select report_app_issue('stuck', 'reload_loop', '/platform/bookings', null);
select pg_temp.act('postgres');
select pg_temp.check('ίδια αποτυχία ξανά και ξανά', exists (select 1 from health_issues
  where fingerprint = 'app:stuck:insufficient_wallet@/platform/search' and title like 'Χρήστες κολλάνε%'));
select pg_temp.check('πήγαινε-έλα', exists (select 1 from health_issues where fingerprint = 'app:stuck:pingpong@/platform/requests'
  and title like 'Χρήστες πηγαινοέρχονται%'));
select pg_temp.check('ξαναφόρτωμα', exists (select 1 from health_issues where fingerprint = 'app:stuck:reload_loop@/platform/bookings'));

\echo '== καθαριότητα'
update flow_events set created_at = now() - interval '91 days' where session_id = 'sess-anon-0001';
select run_health_checks() is not null;
select pg_temp.check('βήματα πάνω από 90 ημέρες σβήνονται', not exists (select 1 from flow_events where session_id = 'sess-anon-0001'));
