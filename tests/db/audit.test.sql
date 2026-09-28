-- The fixes from docs/AUDIT.md (migration 0106). Each block names the finding
-- number it covers. Every action runs as the real API role.
\i tests/db/helpers.sql

\set SP_NIKOS   'b0000000-0000-0000-0000-000000000003'
\set SP_GIORGOS 'b0000000-0000-0000-0000-000000000004'
\set SP_KOSTAS  'b0000000-0000-0000-0000-000000000005'
\set SP_ELENI   'b0000000-0000-0000-0000-000000000006'
\set NEWBIE     'd0000000-0000-0000-0000-000000000001'
\set OTPUSER    'd0000000-0000-0000-0000-000000000002'

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset

-- =============================================================================
\echo '== #4 #5 #48 #50 εγγραφή: τηλέφωνο/επαλήθευση από τη βάση, δώρο με την επαλήθευση'
insert into auth.users (id, phone, raw_app_meta_data)
  values (:'NEWBIE', '306912345678', '{"signup": "pending"}'),
         (:'OTPUSER', '306912345679', '{}');
update platform_settings set value = 3 where key = 'signup_credits_client';
select pg_temp.act('authenticated', :'NEWBIE');
select pg_temp.expect($$select complete_registration('Νέα Πελάτισσα', 'not-an-email', '+306900000001', null, true)$$, 'invalid_email');
select complete_registration('Νέα Πελάτισσα', 'nea@example.com', '+306900000001', null, true);
select pg_temp.act('postgres');
select pg_temp.check('το τηλέφωνο είναι αυτό της σύνδεσης, όχι όποιο στείλει ο browser',
  (select phone_number = '+306912345678' from users where id = :'NEWBIE'));
select pg_temp.check('χωρίς SMS ο λογαριασμός μένει ανεπιβεβαίωτος (ό,τι κι αν λέει ο browser)',
  (select phone_verified_at is null from users where id = :'NEWBIE'));
select pg_temp.check('κανένα δώρο πριν την επαλήθευση', (select wallet_balance = 0 from users where id = :'NEWBIE'));
select pg_temp.act('authenticated', :'ADMIN');
select admin_verify_user(:'NEWBIE');
select pg_temp.act('postgres');
select pg_temp.check('το δώρο (όσα credits ορίζει η ρύθμιση) δίνεται με την επαλήθευση', (select wallet_balance = 3 and signup_bonus_at is not null from users where id = :'NEWBIE'));
update users set phone_verified_at = null where id = :'NEWBIE';
update users set phone_verified_at = now() where id = :'NEWBIE';
select pg_temp.check('και μόνο μία φορά', (select wallet_balance = 3 from users where id = :'NEWBIE'));
update platform_settings set value = 0 where key = 'signup_credits_client';

update platform_settings set value = 1 where key = 'otp_enabled';
select pg_temp.act('authenticated', :'OTPUSER');
select complete_registration('Με SMS', null, null, null, false);
select pg_temp.act('postgres');
select pg_temp.check('με ανοιχτό OTP: επαληθευμένος αμέσως· πελάτης χωρίς δώρο (ρύθμιση 0)',
  (select phone_verified_at is not null and wallet_balance = 0 from users where id = :'OTPUSER'));
update platform_settings set value = 0 where key = 'otp_enabled';

\echo '== #6 #7 #8 ζωντανός λογαριασμός: όνομα, email, αλλαγή PIN'
select coalesce(email, '') as maria_email, full_name as maria_name from users where id = :'CLIENT' \gset
update users set pin_change_required = true where id = :'CLIENT';
select pg_temp.act('authenticated', :'CLIENT');
select complete_registration('Άλλο Όνομα', 'hacker@example.com', null, null, true);
update users set full_name = 'Άλλο Όνομα', pin_change_required = false where id = :'CLIENT';
select pg_temp.act('postgres');
select pg_temp.check('η ξανα-εγγραφή δεν αλλάζει email/όνομα ζωντανού λογαριασμού',
  (select coalesce(email, '') = :'maria_email' and full_name = :'maria_name' from users where id = :'CLIENT'));
select pg_temp.check('το «πρέπει να αλλάξεις PIN» δεν σβήνει χωρίς αλλαγή PIN',
  (select pin_change_required from users where id = :'CLIENT'));
update auth.users set encrypted_password = 'new-hash' where id = :'CLIENT';
select pg_temp.check('σβήνει μόνο του όταν αλλάξει πραγματικά το PIN', (select not pin_change_required from users where id = :'CLIENT'));

\echo '== #31 κλείσιμο συνδέσεων (μόνο ο server)'
insert into auth.sessions (user_id) values (:'CLIENT'), (:'CLIENT');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select revoke_user_sessions(%L)', :'CLIENT'), 'permission denied%');
select pg_temp.act('service_role');
select revoke_user_sessions(:'CLIENT');
select pg_temp.act('postgres');
select pg_temp.check('όλες οι συνδέσεις έκλεισαν', not exists (select 1 from auth.sessions where user_id = :'CLIENT'));

-- =============================================================================
\echo '== #9 #10 #11 #12 βοηθός διαχειριστή'
update users set is_staff_admin = true where id = :'SOFIA';
select pg_temp.act('authenticated', :'SOFIA');
select pg_temp.expect(format($$select admin_update_profile(%L, 'Admin', 'evil@example.com')$$, :'ADMIN'), 'cannot_edit_admin');
select pg_temp.expect(format($$select admin_set_staff_admin(%L, true)$$, :'CLIENT'), 'owner_only');
select pg_temp.expect(format($$select admin_credit_wallet(%L, 100, 'δικά μου')$$, :'SOFIA'), 'owner_only');
select admin_update_profile(:'CLIENT', :'maria_name', 'maria.new@example.com');
select pg_temp.act('authenticated', :'ADMIN');
-- 0112: ο ιδιοκτήτης μπορεί και στον δικό του λογαριασμό.
select admin_adjust_wallet(:'ADMIN', 1, 'δικά μου') = 1;
select admin_adjust_wallet(:'ADMIN', -1, 'επαναφορά') = 0;
select pg_temp.expect(format($$select admin_update_profile(%L, 'Μαρία', 'not-an-email')$$, :'CLIENT'), 'invalid_email');
select admin_set_staff_admin(:'SOFIA', false);
select pg_temp.act('postgres');
select pg_temp.check('ο βοηθός αλλάζει απλό χρήστη, ο ιδιοκτήτης αφαιρεί βοηθό',
  (select email = 'maria.new@example.com' from users where id = :'CLIENT') and (select not is_staff_admin from users where id = :'SOFIA'));

-- =============================================================================
\echo '== #14 #15 όρια επαγγελματία'
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.expect($$update skipper_profiles set price_per_day = 6000 where user_id = auth.uid()$$, 'price_too_high');
select pg_temp.expect($$update skipper_profiles set date_of_birth = '2020-01-01' where user_id = auth.uid()$$, 'invalid_date_of_birth');
select pg_temp.expect($$update skipper_profiles set years_experience = 200 where user_id = auth.uid()$$, 'invalid_years_experience');
update skipper_profiles set price_per_day = 300, date_of_birth = '1985-05-05', years_experience = 12 where user_id = auth.uid();
select pg_temp.act('postgres');
select pg_temp.check('λογικές τιμές περνάνε', (select price_per_day = 300 and years_experience = 12 from skipper_profiles where id = :'SP_NIKOS'));

-- =============================================================================
\echo '== #22 μηνύματα επικοινωνίας από ανώνυμους'
select pg_temp.act('anon');
select submit_contact_message('Επισκέπτης', 'visitor@example.com', 'general', 'Ερώτηση νούμερο ένα');
select submit_contact_message('Επισκέπτης', 'visitor@example.com', 'general', 'Ερώτηση νούμερο δύο');
select submit_contact_message('Επισκέπτης', 'Visitor@example.com', 'general', 'Ερώτηση νούμερο τρία');
select pg_temp.expect($$select submit_contact_message('Επισκέπτης', 'visitor@example.com', 'general', 'Ερώτηση νούμερο τέσσερα')$$, 'too_many_messages');

\echo '== #23 ρυθμίσεις'
select pg_temp.check('ο επισκέπτης βλέπει το τέλος αιτήματος', exists (select 1 from platform_settings where key = 'client_request_fee'));
select pg_temp.check('αλλά όχι τους συντελεστές αξιοπιστίας', not exists (select 1 from platform_settings where key like 'cancel%' or key = 'reliability_min_history'));
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('ο διαχειριστής τα βλέπει όλα', (select count(*) > 20 from platform_settings));
\echo '== #51 όρια ρυθμίσεων'
select pg_temp.expect($$select admin_update_setting('client_request_fee', 1000000)$$, 'invalid_value');
select pg_temp.expect($$select admin_update_setting('delivery_platform_fee_pct', 900)$$, 'invalid_value');
select pg_temp.expect($$select admin_update_setting('otp_enabled', 2)$$, 'invalid_value');
select pg_temp.expect($$select admin_update_setting('unclaimed_expiry_hours', 0)$$, 'invalid_value');
select admin_update_setting('client_request_fee', 20);
select admin_update_setting('client_request_fee', 1);

-- =============================================================================
\echo '== #34 #35 αίτημα: ημερομηνίες και μέγεθος'
select pg_temp.act('postgres');
update users set phone_verified_at = now() where id = :'CLIENT';
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format($$insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (%L, current_date - 3, current_date - 1, %L, 'Νάξος', 'Νάξος', %L, 'skipper')$$, :'CLIENT', :'cyclades', :'sailboat'), 'start_in_past');
select pg_temp.expect(format($$insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (%L, current_date + 3, current_date + 3000, %L, 'Νάξος', 'Νάξος', %L, 'skipper')$$, :'CLIENT', :'cyclades', :'sailboat'), 'trip_too_long');
select pg_temp.expect(format($$insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role, party_size)
  values (%L, current_date + 3, current_date + 5, %L, 'Νάξος', 'Νάξος', %L, 'skipper', 500)$$, :'CLIENT', :'cyclades', :'sailboat'), 'party_too_large');

\echo '== #36 #37 σε ποιους πάει ένα αίτημα'
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 20, current_date + 22, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper')
  returning id as req \gset
select pg_temp.expect(format('select pay_and_broadcast(%L, (select array_agg(gen_random_uuid()) from generate_series(1, 31)))', :'req'),
  'too_many_professionals');
select pg_temp.act('postgres');
-- Ο Γιώργος δεν έχει διαθεσιμότητα αυτές τις μέρες.
delete from availability_windows where skipper_id = :'SP_GIORGOS';
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select pay_and_broadcast(%L, array[%L]::uuid[])', :'req', :'SP_GIORGOS'), 'skipper_not_available');
select pg_temp.wallet('Μαρία Πελάτη') as wc0 \gset
select (pay_and_broadcast(:'req', array[:'SP_KOSTAS', :'SP_ELENI']::uuid[])).status is not null;
select pg_temp.act('postgres');
select pg_temp.check('χωρίς χρέωση όταν απορρίπτεται, κανονική χρέωση όταν περνάει', pg_temp.wallet('Μαρία Πελάτη') = :wc0 - 1);

\echo '== #47 οι ειδοποιήσεις «νέο αίτημα» αποσύρονται μαζί με το αίτημα'
select pg_temp.check('και οι δύο πήραν ειδοποίηση με το αίτημα',
  (select count(*) = 2 from notifications where data ->> 'request_id' = :'req' and read_at is null));
select id as ping_eleni from booking_request_pings where booking_request_id = :'req' and skipper_id = :'SP_ELENI' \gset
select pg_temp.act('authenticated', :'CLIENT');
select client_withdraw_ping(:'req', :'ping_eleni');
select pg_temp.act('postgres');
select pg_temp.check('όποιος αποσύρθηκε δεν έχει πια «νέο αίτημα»',
  (select read_at is not null from notifications where data ->> 'request_id' = :'req' and user_id = :'ELENI'));
select pg_temp.act('authenticated', :'KOSTAS');
select (claim_booking_request(:'req', :'SP_KOSTAS')).id as bk \gset
select pg_temp.act('postgres');
select pg_temp.check('κι όταν κλείσει το αίτημα, καμία ειδοποίηση δεν μένει ανοιχτή',
  not exists (select 1 from notifications where data ->> 'request_id' = :'req' and read_at is null));

\echo '== #49 αποδοχή αφού ξεκίνησε το ταξίδι'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 30, current_date + 32, :'cyclades', 'Πάρος', 'Πάρος', :'sailboat', 'skipper')
  returning id as req2 \gset
select (pay_and_broadcast(:'req2', array[:'SP_ELENI']::uuid[])).status is not null;
select pg_temp.act('postgres');
update booking_requests set start_date = current_date - 1 where id = :'req2';
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.expect(format('select claim_booking_request(%L, %L)', :'req2', :'SP_ELENI'), 'request_expired');

-- =============================================================================
\echo '== #38 #39 #40 κριτικές και μηνύματα'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format($$insert into messages (booking_id, sender_id, content) values (%L, %L, '   ')$$, :'bk', :'CLIENT'), 'message_empty');
select pg_temp.expect(format($$insert into messages (booking_id, sender_id, content) values (%L, %L, repeat('α', 4001))$$, :'bk', :'CLIENT'), 'message_too_long');
insert into messages (booking_id, sender_id, content) values (:'bk', :'CLIENT', 'Κανονικό μήνυμα');
select pg_temp.act('postgres');
update bookings set start_date = current_date - 6, end_date = current_date - 4 where id = :'bk';
select mark_bookings_completed() >= 1;
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format($$insert into reviews (booking_id, reviewer_id, reviewee_id, rating, comment, rating_safety, rating_seamanship,
  rating_professionalism, rating_cleanliness, rating_communication, rating_hospitality) values (%L, %L, %L, 5, repeat('α', 2001), 5, 5, 5, 5, 5, 5)$$,
  :'bk', :'CLIENT', :'KOSTAS'), 'comment_too_long');
select pg_temp.act('authenticated', :'KOSTAS');
insert into reviews (booking_id, reviewer_id, reviewee_id, rating, comment,
                     rating_boat_respect, rating_responsibility, rating_cooperation, rating_consistency, rating_conduct, rating_tidiness)
  values (:'bk', :'KOSTAS', :'CLIENT', 1, 'Συνεργάσιμη', 5, 5, 5, 5, 5, 5);
select pg_temp.check('ο αξιολογητής βλέπει την κριτική του', exists (select 1 from reviews where booking_id = :'bk'));

\echo '== #24 κριτικές για πελάτες'
select pg_temp.act('anon');
select pg_temp.check('ο επισκέπτης δεν βλέπει κριτικές για πελάτες', not exists (select 1 from reviews where reviewee_id = :'CLIENT'));
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('ούτε άσχετος επαγγελματίας', not exists (select 1 from reviews where reviewee_id = :'CLIENT'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('ο ίδιος ο πελάτης τη βλέπει', exists (select 1 from reviews where reviewee_id = :'CLIENT'));

\echo '== #38 όχι κριτική σε ακυρωμένη κράτηση'
select pg_temp.act('postgres');
update bookings set status = 'cancelled_by_client', cancelled_at = now() where id = :'bk';
delete from reviews where booking_id = :'bk';
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format($$insert into reviews (booking_id, reviewer_id, reviewee_id, rating, rating_safety, rating_seamanship,
  rating_professionalism, rating_cleanliness, rating_communication, rating_hospitality) values (%L, %L, %L, 5, 5, 5, 5, 5, 5, 5)$$,
  :'bk', :'CLIENT', :'KOSTAS'), 'review_not_allowed_cancelled');

-- =============================================================================
\echo '== #41 #42 μεταφορά σκάφους'
select pg_temp.expect($$select create_delivery_request('Λαύριο', 'Λευκάδα', 300, 'fixed', current_date - 2, 0, true, true, false, null, true, false)$$, 'departure_in_past');
select pg_temp.expect($$select create_delivery_request('Λαύριο', 'Λευκάδα', 300, 'flexible', current_date + 10, 90, true, true, false, null, true, false)$$, 'invalid_flexible_days');
select pg_temp.expect($$select create_delivery_request('Λαύριο', 'Λευκάδα', 90000, 'fixed', current_date + 10, 0, true, true, false, null, true, false)$$, 'invalid_distance');

\echo '== #44 αποδοχή μεταφοράς: ξανά έλεγχος έγκρισης'
select pg_temp.act('postgres');
insert into delivery_availability_windows (skipper_id, crew_role, start_date, end_date)
  values (:'SP_GIORGOS', 'skipper', current_date + 1, current_date + 90);
select pg_temp.act('authenticated', :'CLIENT');
select (create_delivery_request('Λαύριο', 'Λευκάδα', 300, 'fixed', current_date + 30, 0,
        true, true, false, null, true, false)).id as dr \gset
select (create_delivery_role_request(:'dr', 'skipper', 900, array[:'SP_GIORGOS']::uuid[])).id as rr \gset
select pg_temp.act('postgres');
update skipper_profiles set approval_status = 'rejected' where id = :'SP_GIORGOS';
select pg_temp.act('authenticated', :'GIORGOS');
select pg_temp.expect(format('select accept_delivery_role_request(%L, %L)', :'rr', :'SP_GIORGOS'), 'skipper_not_eligible');
