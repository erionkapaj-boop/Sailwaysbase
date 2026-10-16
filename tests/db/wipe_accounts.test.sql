-- Πλήρες format (scripts/sql/wipe_all_accounts.sql): μένει μόνο ο λογαριασμός του ιδιοκτήτη, όλα τα δεδομένα
-- δραστηριότητας σβήνουν, οι λίστες και οι ρυθμίσεις μένουν. Πρώτα τρέχουν δύο πλήρεις ροές για να υπάρχουν
-- πραγματικά δεδομένα (αιτήματα, κρατήσεις, μηνύματα, credits, αντικαταστάσεις).
\i tests/db/replacement_flow.test.sql
\i tests/db/other_flows.test.sql

select pg_temp.act('postgres');
\set body `cat scripts/sql/wipe_all_accounts.sql`

\echo '== χωρίς ιδιοκτήτη με αυτό το τηλέφωνο: σταματά χωρίς να σβήσει τίποτα'
select count(*) as users0 from users \gset
select count(*) as bookings0 from bookings \gset
select pg_temp.expect(:'body', 'wipe aborted: expected exactly one owner account, found 0');
select pg_temp.check('τίποτα δεν σβήστηκε', (select count(*) from users) = :users0 and (select count(*) from bookings) = :bookings0 and :bookings0 > 0);

\echo '== ο ιδιοκτήτης είναι ο διαχειριστής Admin (a…01)'
select set_config('platform.trusted', 'true', false);
update users set is_owner = true, phone_number = '+306983427643', wallet_balance = 7 where id = :'ADMIN';
insert into wallet_transactions (user_id, amount, type, note, unit) values (:'ADMIN', 7, 'deposit', 'δοκιμή', 'credit');
select count(*) as regions0 from regions \gset
select count(*) as ports0 from ports \gset
select count(*) as settings0 from platform_settings \gset
select count(*) as languages0 from languages \gset
select count(*) as boats0 from boat_types \gset
select pg_temp.check('πριν: πολλοί λογαριασμοί και δεδομένα', :users0 > 5 and (select count(*) from messages) > 0 and (select count(*) from wallet_transactions) > 5);

\echo '== η αναφορά τρέχει'
\o /dev/null
\i scripts/sql/wipe_all_accounts_report.sql
\o
\echo '== το format'
\i scripts/sql/wipe_all_accounts.sql

select pg_temp.check('μένει ένας λογαριασμός (public.users)', (select count(*) from users) = 1);
select pg_temp.check('μένει ένας λογαριασμός (auth.users)', (select count(*) from auth.users) = 1);
select pg_temp.check('είναι ο ιδιοκτήτης', (select id from users) = :'ADMIN' and (select is_owner from users));
select pg_temp.check('υπόλοιπο 0 και καμία κίνηση credits', (select wallet_balance from users) = 0 and (select count(*) from wallet_transactions) = 0);
select pg_temp.check('καμία κράτηση, αίτημα, μήνυμα, αξιολόγηση, ειδοποίηση',
  (select count(*) from bookings) + (select count(*) from booking_requests) + (select count(*) from messages)
  + (select count(*) from reviews) + (select count(*) from notifications) + (select count(*) from delivery_requests)
  + (select count(*) from admin_actions) + (select count(*) from push_outbox) = 0);
select pg_temp.check('οι λίστες και οι ρυθμίσεις έμειναν',
  (select count(*) from regions) = :regions0 and (select count(*) from ports) = :ports0
  and (select count(*) from platform_settings) = :settings0 and (select count(*) from languages) = :languages0
  and (select count(*) from boat_types) = :boats0 and :regions0 > 0 and :settings0 > 0);
select pg_temp.check('δεν έμεινε προφίλ άλλου', (select count(*) from skipper_profiles where user_id <> :'ADMIN') = 0 and (select count(*) from client_profiles where user_id <> :'ADMIN') = 0);
select pg_temp.check('πορτοφόλι συνεπές: υπόλοιπο = άθροισμα κινήσεων', (select wallet_balance from users) = coalesce((select sum(amount) from wallet_transactions), 0));

\echo '== η εφαρμογή δουλεύει μετά: νέος πελάτης εγγράφεται κανονικά'
select pg_temp.act('postgres');
insert into auth.users (id, email, phone) values ('a0000000-0000-0000-0000-0000000000ff', 'new@example.com', '+306911111111');
select pg_temp.act('authenticated', 'a0000000-0000-0000-0000-0000000000ff');
select complete_registration('Νέος Πελάτης', 'new@example.com', '+306911111111', null, true);
select pg_temp.act('postgres');
select pg_temp.check('νέα εγγραφή: δύο λογαριασμοί και προφίλ πελάτη', (select count(*) from users) = 2 and (select count(*) from client_profiles where user_id = 'a0000000-0000-0000-0000-0000000000ff') = 1);
