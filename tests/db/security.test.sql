-- Security: every attack found in the audit that produced 0097, re-run as the
-- real API roles (anon = anyone on the internet with the public key,
-- authenticated = any signed-up user), plus structural guards that fail when
-- a future migration reopens the same class of hole.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
insert into auth.users (id, phone) values ('e0000000-0000-0000-0000-00000000bad1', '306900009999');
\set EVIL 'e0000000-0000-0000-0000-00000000bad1'

\echo '== δομικοί φύλακες'
-- Functions that run with elevated rights and that anyone can call, but have
-- no check of who is calling. Each one here was reviewed as harmless
-- (read-only, returns nothing private). A new one must be reviewed and
-- either guarded, revoked, or added to this list on purpose.
select pg_temp.check('καμία νέα ανεξέλεγκτη συνάρτηση προσβάσιμη από ανώνυμους: ' || coalesce(string_agg(f, ', '), '—'), count(*) = 0)
from (
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'execute')
    and p.prosrc !~* '(auth\.uid|is_admin|acting_user|my_skipper_profile_id)'
) x
where f not in (
  'admin_coverage_needed()',
  'booking_place(p_departure text, p_port uuid, p_region uuid)',
  'check_login_rate_limit(p_phone text)',
  'has_future_availability(p_skipper_id uuid)',
  'is_approved_professional(p_user_id uuid)',
  'phone_registration_status(p_phone text)',
  'skipper_is_search_visible(p_skipper_id uuid)',
  'skipper_profile_id_of(p_user_id uuid)'
);
select pg_temp.check('κάθε πίνακας έχει row-level security: ' || coalesce(string_agg(relname, ', '), '—'), count(*) = 0)
from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;
select pg_temp.check('καμία πολιτική εγγραφής ανοιχτή σε όλους: ' || coalesce(string_agg(tablename || '.' || policyname, ', '), '—'), count(*) = 0)
from pg_policies where schemaname = 'public' and cmd <> 'SELECT'
  and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true');
select pg_temp.check('οι εσωτερικές συναρτήσεις δεν καλούνται από τον browser', not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('soft_delete_account', 'notify_user', 'notify_admins', 'mark_bookings_completed',
                      'expire_stale_booking_requests', 'expire_stale_delivery_role_requests', 'recalc_user_rating',
                      'close_replacement_offer', 'close_replacement_case', 'replacement_offer_lapsed')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))));
select pg_temp.check('ο διακομιστής (cron, διαγραφή λογαριασμού) μπορεί να τις καλεί', (
  select bool_and(has_function_privilege('service_role', p.oid, 'execute')) from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('soft_delete_account', 'mark_bookings_completed', 'expire_stale_booking_requests')));

\echo '== ανώνυμος επισκέπτης'
select pg_temp.act('anon');
select pg_temp.expect(format('select soft_delete_account(%L, null)', :'SOFIA'), 'permission denied for function soft_delete_account');
select pg_temp.expect(format('select notify_user(%L, %L, %L, %L)', :'CLIENT', 'wallet', '{}', 'https://evil.example'), 'permission denied for function notify_user');
select pg_temp.expect(format('select notify_admins(%L, %L, %L)', 'x', '{}', 'https://evil.example'), 'permission denied for function notify_admins');
select pg_temp.expect('select mark_bookings_completed()', 'permission denied for function mark_bookings_completed');
select pg_temp.expect('select expire_stale_booking_requests()', 'permission denied for function expire_stale_booking_requests');
select pg_temp.expect(format('select clear_login_attempts(%L)', '+306900002003'), 'permission denied for function clear_login_attempts');
select pg_temp.expect($$insert into login_attempts (phone, success) values ('+306900002003', true)$$, 'new row violates row-level security policy%');
select pg_temp.check('ο ανώνυμος δεν βλέπει χρήστες', (select count(*) = 0 from users));
select pg_temp.check('ο ανώνυμος δεν βλέπει κρατήσεις ή πορτοφόλια', (select count(*) = 0 from bookings) and (select count(*) = 0 from wallet_transactions));

\echo '== νέος χρήστης μετά την εγγραφή (χωρίς ακόμα γραμμή users)'
select pg_temp.act('authenticated', :'EVIL');
select pg_temp.expect(format($$insert into users (id, role, is_staff_admin, wallet_balance, phone_number, full_name, status)
  values (%L, 'admin', true, 1000000, '+306900009999', 'Evil', 'active')$$, :'EVIL'), 'new row violates row-level security policy%');
select pg_temp.act('postgres');
select pg_temp.check('δεν έγινε admin', not exists (select 1 from users where id = :'EVIL'));
-- The legitimate path still works, and still lands as a plain client.
select pg_temp.act('authenticated', :'EVIL');
select complete_registration('Νέος', 'neos@example.com', '+306900009999', null, false);
select pg_temp.act('postgres');
select pg_temp.check('η κανονική εγγραφή δουλεύει και δίνει απλό πελάτη, προς επαλήθευση',
  (select role = 'client' and not is_staff_admin and phone_verified_at is null from users where id = :'EVIL'));

\echo '== συνδεδεμένος χρήστης: αλλαγές στη δική του γραμμή'
select pg_temp.act('authenticated', :'EVIL');
update users set role = 'admin', is_staff_admin = true, wallet_balance = 99999, phone_verified_at = now(),
                 status = 'active', photo_reviewed_at = now() where id = :'EVIL';
update users set full_name = 'Νέος Χρήστης' where id = :'EVIL';
select pg_temp.act('postgres');
select pg_temp.check('ρόλος/admin/πορτοφόλι/επαλήθευση δεν αλλάζουν από τον ίδιο',
  (select role = 'client' and not is_staff_admin and wallet_balance < 1000 and phone_verified_at is null and photo_reviewed_at is null
   from users where id = :'EVIL'));
select pg_temp.check('το όνομα αλλάζει κανονικά', (select full_name = 'Νέος Χρήστης' from users where id = :'EVIL'));

select pg_temp.act('authenticated', :'EVIL');
insert into skipper_profiles (user_id, full_name, price_per_day, approval_status, rating_avg, rating_count, tier)
  values (:'EVIL', 'Evil', 210, 'approved', 5, 100, 'high');
update skipper_profiles set approval_status = 'approved', rating_avg = 5, rating_count = 99 where user_id = :'EVIL';
update skipper_profiles set price_per_day = 260 where user_id = :'EVIL';
select pg_temp.act('postgres');
select pg_temp.check('νέος επαγγελματίας ξεκινά σε αναμονή, χωρίς βαθμολογίες',
  (select approval_status = 'pending' and rating_count = 0 and rating_avg is null and tier = 'medium' from skipper_profiles where user_id = :'EVIL'));
select pg_temp.check('η τιμή του αλλάζει κανονικά', (select price_per_day = 260 from skipper_profiles where user_id = :'EVIL'));

select pg_temp.act('authenticated', :'CLIENT');
update client_profiles set rating_avg = 5, rating_count = 40 where user_id = :'CLIENT';
select pg_temp.act('postgres');
select pg_temp.check('ο πελάτης δεν φτιάχνει αξιολογήσεις για τον εαυτό του', (select rating_count = 0 from client_profiles where user_id = :'CLIENT'));

\echo '== συνδεδεμένος χρήστης: δεδομένα άλλων'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select soft_delete_account(%L, null)', :'SOFIA'), 'permission denied for function soft_delete_account');
select pg_temp.check('βλέπει μόνο τη δική του γραμμή users', (select count(*) = 1 and bool_and(id = :'CLIENT') from users));
select pg_temp.check('δεν βλέπει πορτοφόλια άλλων', not exists (select 1 from wallet_transactions where user_id <> :'CLIENT'));
select pg_temp.check('δεν βλέπει ονόματα επαγγελματιών πριν την κράτηση', (select count(*) = 0 from skipper_profiles));
select clear_login_attempts('+306900002003');
select pg_temp.act('postgres');
select pg_temp.check('δεν ξεκλειδώνει τη σύνδεση άλλου τηλεφώνου', not exists (select 1 from login_attempts where phone = '+306900002003' and success));
select pg_temp.check('ξεκλειδώνει μόνο το δικό του', exists (select 1 from login_attempts where phone = '+306900002002' and success));

\echo '== αιτήματα κράτησης: οι όροι είναι της πλατφόρμας'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role,
                              fee_amount, fee_paid_at, claim_fee_amount, origin, status, expires_at)
  values (:'CLIENT', current_date + 20, current_date + 22, :'cyclades', 'Πάρος', 'Πάρος', 'skipper',
          0, now(), 0, 'admin_direct', 'matched', '2030-01-01')
  returning id as req \gset
select pg_temp.act('postgres');
select pg_temp.check('τέλος, πληρωμή, χρέωση skipper, προέλευση, κατάσταση: επιβάλλονται από την πλατφόρμα',
  (select fee_amount = 15 and fee_paid_at is null and claim_fee_amount is null and origin = 'client' and status = 'open'
          and expires_at < now() + interval '7 days' from booking_requests where id = :'req'));
select pg_temp.act('authenticated', :'CLIENT');
update booking_requests set fee_amount = 0, claim_fee_amount = 0, status = 'matched' where id = :'req';
select pg_temp.act('postgres');
select pg_temp.check('ο πελάτης δεν αλλάζει αίτημα απευθείας', (select fee_amount = 15 and status = 'open' from booking_requests where id = :'req'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('η κανονική πληρωμή δουλεύει (15€)', (pay_and_broadcast(:'req', array['b0000000-0000-0000-0000-000000000004']::uuid[])).fee_amount = 15);

\echo '== κριτικές: ο αξιολογούμενος μόνο απαντά'
select pg_temp.act('authenticated', :'GIORGOS');
select (claim_booking_request(:'req', 'b0000000-0000-0000-0000-000000000004')).id as bk \gset
select pg_temp.act('postgres');
update bookings set start_date = current_date - 10, end_date = current_date - 8, status = 'completed' where id = :'bk';
alter table reviews disable trigger user;
insert into reviews (booking_id, reviewer_id, reviewee_id, rating, comment) values (:'bk', :'CLIENT', :'GIORGOS', 1, 'Κακός')
  returning id as rv \gset
alter table reviews enable trigger user;
select pg_temp.act('authenticated', :'GIORGOS');
update reviews set rating = 5, comment = 'Εξαιρετικός!', reply = 'Ευχαριστώ για την κριτική' where id = :'rv';
select pg_temp.act('postgres');
select pg_temp.check('ο βαθμός και το σχόλιο μένουν ως είχαν', (select rating = 1 and comment = 'Κακός' from reviews where id = :'rv'));
select pg_temp.check('η απάντηση αποθηκεύεται', (select reply = 'Ευχαριστώ για την κριτική' from reviews where id = :'rv'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format($$insert into reviews (booking_id, reviewer_id, reviewee_id, rating) values (%L, %L, %L, 1)$$,
  :'bk', :'CLIENT', :'KOSTAS'), 'reviewee_not_participant');

\echo '== ξένα μηνύματα/ειδοποιήσεις (τώρα που υπάρχουν δεδομένα)'
-- These only check the caller once there is something to read, so they are
-- tested here, after bookings and notifications exist.
select pg_temp.act('postgres');
insert into messages (booking_id, sender_id, content) values (:'bk', :'GIORGOS', 'Ιδιωτικό μήνυμα');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select * from my_conversations(%L)', :'CLIENT'), 'not_admin');
select pg_temp.expect(format('select * from my_notification_counts(%L)', :'CLIENT'), 'not_admin');
select pg_temp.check('δεν διαβάζει μηνύματα κράτησης όπου δεν συμμετέχει', (select count(*) = 0 from messages));
