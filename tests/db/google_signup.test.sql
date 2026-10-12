-- Εγγραφή με Google (0121): ο λογαριασμός με επαληθευμένη ταυτότητα Google
-- ξεκινά επαληθευμένος και παίρνει το email της Google, ό,τι κι αν στείλει ο
-- browser. Χωρίς επαληθευμένο email, ή χωρίς Google, τίποτα δεν αλλάζει.
\i tests/db/helpers.sql
\set GCLIENT 'd1000000-0000-0000-0000-000000000001'
\set GPRO    'd1000000-0000-0000-0000-000000000002'
\set GUNVER  'd1000000-0000-0000-0000-000000000003'
\set GPHONE  'd1000000-0000-0000-0000-000000000004'
\set GNOPHONE 'd1000000-0000-0000-0000-000000000005'

select pg_temp.act('postgres');
insert into auth.users (id, phone, email, raw_app_meta_data) values
  (:'GCLIENT', '306900007001', 'giannis@gmail.com', '{"provider":"google","providers":["google"]}'),
  (:'GPRO',    '306900007002', 'maria.pro@gmail.com', '{"provider":"google","providers":["google"]}'),
  (:'GUNVER',  '306900007003', 'xenos@gmail.com', '{"provider":"google","providers":["google"]}'),
  (:'GPHONE',  '306900007004', null, '{"signup": "pending"}'),
  (:'GNOPHONE', null, 'nophone@gmail.com', '{"provider":"google","providers":["google"]}');
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  (:'GCLIENT', 'google', 'g-1', '{"email":"giannis@gmail.com","email_verified":true}'),
  (:'GPRO',    'google', 'g-2', '{"email":"maria.pro@gmail.com","email_verified":true}'),
  (:'GUNVER',  'google', 'g-3', '{"email":"xenos@gmail.com","email_verified":false}'),
  (:'GNOPHONE', 'google', 'g-5', '{"email":"nophone@gmail.com","email_verified":true}');
update platform_settings set value = 2 where key = 'signup_credits_professional';
update platform_settings set value = 0 where key = 'otp_enabled';

\echo '== πελάτης με Google'
select pg_temp.act('authenticated', :'GCLIENT');
select complete_registration('Γιάννης Γκόγκλης', 'attacker@example.com', null, null, true);
select pg_temp.act('postgres');
select pg_temp.check('ξεκινά επαληθευμένος και ενεργός',
  (select phone_verified_at is not null and status = 'active' and role = 'client' from users where id = :'GCLIENT'));
select pg_temp.check('το email του προφίλ είναι της Google, όχι αυτό που έστειλε ο browser',
  (select email = 'giannis@gmail.com' from users where id = :'GCLIENT'));
select pg_temp.check('το τηλέφωνο είναι αυτό του λογαριασμού',
  (select phone_number = '+306900007001' from users where id = :'GCLIENT'));
select pg_temp.check('ο πελάτης δεν παίρνει δώρο (ρύθμιση 0)', (select wallet_balance = 0 from users where id = :'GCLIENT'));

\echo '== επαγγελματίας με Google'
select pg_temp.act('authenticated', :'GPRO');
select complete_registration('Μαρία Επαγγελματίας', null, null, 'skipper', true);
select pg_temp.act('postgres');
select pg_temp.check('επαληθευμένος, σε προσχέδιο μέχρι να συμπληρώσει τα στοιχεία του',
  (select phone_verified_at is not null and status = 'draft' and role = 'skipper' from users where id = :'GPRO'));
select pg_temp.check('παίρνει το δώρο των επαγγελματιών, μία φορά', (select wallet_balance = 2 and signup_bonus_at is not null from users where id = :'GPRO'));
select pg_temp.check('το προφίλ περιμένει έγκριση από τη διαχείριση',
  (select approval_status = 'pending' from skipper_profiles where user_id = :'GPRO'));
select pg_temp.check('το email του προφίλ είναι της Google', (select email = 'maria.pro@gmail.com' from users where id = :'GPRO'));

\echo '== χωρίς επαληθευμένο email, ή χωρίς Google'
select pg_temp.act('authenticated', :'GUNVER');
select complete_registration('Ανεπιβεβαίωτος', null, null, null, true);
select pg_temp.act('authenticated', :'GPHONE');
select complete_registration('Μόνο Τηλέφωνο', null, null, null, true);
select pg_temp.act('postgres');
select pg_temp.check('ταυτότητα Google με ανεπιβεβαίωτο email: μένει ανεπιβεβαίωτος',
  (select phone_verified_at is null from users where id = :'GUNVER'));
select pg_temp.check('εγγραφή μόνο με τηλέφωνο: όπως πριν, ανεπιβεβαίωτος',
  (select phone_verified_at is null from users where id = :'GPHONE'));

\echo '== το τηλέφωνο μένει υποχρεωτικό'
select pg_temp.act('authenticated', :'GNOPHONE');
select pg_temp.expect($$select complete_registration('Χωρίς Τηλέφωνο', null, null, null, true)$$, 'phone_required');

\echo '== ο χρήστης δεν μπορεί να γράψει δική του ταυτότητα Google'
select pg_temp.act('authenticated', :'GPHONE');
select pg_temp.expect($$insert into auth.identities (user_id, provider, identity_data) values ('d1000000-0000-0000-0000-000000000004', 'google', '{"email_verified":true}')$$, 'permission denied%');
select pg_temp.act('postgres');
update platform_settings set value = 2 where key = 'signup_credits_professional';
