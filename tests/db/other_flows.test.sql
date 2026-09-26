-- Everything outside the replacement flow: boat delivery, a client cancelling
-- a charter, messages and reviews, signing up and getting approved, and what
-- a suspended account can still do. Every action runs as the real API role.
\i tests/db/helpers.sql

\set SP_GIORGOS 'b0000000-0000-0000-0000-000000000004'
\set SP_KOSTAS  'b0000000-0000-0000-0000-000000000005'
\set SP_ELENI   'b0000000-0000-0000-0000-000000000006'

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset
-- Delivery availability for two skippers (they set this themselves in the app).
insert into delivery_availability_windows (skipper_id, crew_role, start_date, end_date)
  values (:'SP_GIORGOS', 'skipper', current_date + 1, current_date + 90),
         (:'SP_KOSTAS', 'skipper', current_date + 1, current_date + 90);

-- =============================================================================
\echo '== μεταφορά σκάφους: αίτημα, αποδοχή, χρεώσεις'
select pg_temp.wallet('Μαρία Πελάτη') as wc0 \gset
select pg_temp.wallet('Γιώργος Υποψήφιος') as wg0 \gset
select pg_temp.act('authenticated', :'CLIENT');
select (create_delivery_request('Λαύριο', 'Λευκάδα', 300, 'fixed', current_date + 30, 0,
        true, true, false, null, true, false, 'Μεταφορά για χειμώνα')).id as dr \gset
select (create_delivery_role_request(:'dr', 'skipper', 900, array[:'SP_GIORGOS', :'SP_KOSTAS']::uuid[])).id as rr \gset
select pg_temp.act('postgres');
select client_fee as dfee, professional_fee as pfee from delivery_role_requests where id = :'rr' \gset
select pg_temp.check('ο πελάτης πλήρωσε το τέλος μεταφοράς (' || :dfee || '€)', pg_temp.wallet('Μαρία Πελάτη') = :wc0 - :dfee);
select pg_temp.check('ελάχιστο τέλος 50€ και για τις δύο πλευρές σε μικρή απόσταση', :dfee = 50 and :pfee = 50);

select pg_temp.act('authenticated', :'ELENI');
select pg_temp.expect(format('select accept_delivery_role_request(%L, %L)', :'rr', :'SP_ELENI'), 'not_pinged');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select accept_delivery_role_request(%L, %L)', :'rr', :'SP_GIORGOS'), 'not_owner');
select pg_temp.act('authenticated', :'GIORGOS');
select (accept_delivery_role_request(:'rr', :'SP_GIORGOS')).id as db1 \gset
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select accept_delivery_role_request(%L, %L)', :'rr', :'SP_KOSTAS'), 'not_open');
select pg_temp.act('postgres');
select pg_temp.check('ο επαγγελματίας πλήρωσε 50€ με την αποδοχή', pg_temp.wallet('Γιώργος Υποψήφιος') = :wg0 - 50);
select pg_temp.check('ο πελάτης ειδοποιήθηκε', exists (select 1 from notifications where user_id = :'CLIENT' and kind = 'delivery_accepted'));
select pg_temp.check('ο άλλος υποψήφιος έκλεισε', (select status = 'declined' from delivery_role_pings where delivery_role_request_id = :'rr' and skipper_id = :'SP_KOSTAS'));

\echo '== μεταφορά: ποιος βλέπει τι'
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.check('τρίτος δεν βλέπει τη μεταφορά', (select count(*) = 0 from delivery_bookings) and (select count(*) = 0 from delivery_requests));
select pg_temp.expect(format('select cancel_delivery_booking(%L, %L)', :'db1', 'x'), 'not_participant');

\echo '== μεταφορά: ο επαγγελματίας ακυρώνει'
select pg_temp.act('postgres');
select pg_temp.wallet('Μαρία Πελάτη') as wc1 \gset
select pg_temp.act('authenticated', :'GIORGOS');
select (cancel_delivery_booking(:'db1', 'Άλλαξαν τα σχέδια')).status;
select pg_temp.act('postgres');
select pg_temp.check('ο πελάτης πήρε πίσω το τέλος του', pg_temp.wallet('Μαρία Πελάτη') = :wc1 + :dfee);
select pg_temp.check('ο επαγγελματίας δεν πήρε πίσω το δικό του', pg_temp.wallet('Γιώργος Υποψήφιος') = :wg0 - 50);
select pg_temp.check('ο admin ειδοποιήθηκε', exists (select 1 from notifications n join users u on u.id = n.user_id where u.role = 'admin' and n.kind = 'admin_delivery_cancelled'));
-- Owner's decision: unlike a charter, cancelling a delivery does not count
-- against the professional's reliability.
select pg_temp.check('η ακύρωση μεταφοράς ΔΕΝ μετράει στην αξιοπιστία',
  (select cancellation_flag_count = 0 from skipper_profiles where id = :'SP_GIORGOS'));

\echo '== μεταφορά: λήξη χωρίς απάντηση'
select pg_temp.act('authenticated', :'CLIENT');
select (create_delivery_role_request(:'dr', 'skipper', 950, array[:'SP_KOSTAS']::uuid[])).id as rr2 \gset
select pg_temp.act('postgres');
select pg_temp.wallet('Μαρία Πελάτη') as wc2 \gset
update delivery_role_requests set expires_at = now() - interval '1 minute' where id = :'rr2';
select expire_stale_booking_requests() >= 1;
select pg_temp.check('λήξη: επιστροφή τέλους και ειδοποίηση', pg_temp.wallet('Μαρία Πελάτη') = :wc2 + :dfee
  and exists (select 1 from notifications where user_id = :'CLIENT' and kind = 'delivery_expired'));

-- =============================================================================
\echo '== ναύλο: ο πελάτης ακυρώνει'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 12, current_date + 14, :'cyclades', 'Πάρος', 'Πάρος', :'sailboat', 'skipper')
  returning id as req \gset
select (pay_and_broadcast(:'req', array[:'SP_ELENI']::uuid[])).status is not null;
select pg_temp.act('authenticated', :'ELENI');
select (claim_booking_request(:'req', :'SP_ELENI')).id as bk \gset
select pg_temp.act('postgres');
select pg_temp.wallet('Ελένη Υποψήφια') as we0 \gset
select pg_temp.wallet('Μαρία Πελάτη') as wc3 \gset
select pg_temp.act('authenticated', :'CLIENT');
select (cancel_booking(:'bk', 'Άλλαξαν τα σχέδια')).status;
select pg_temp.act('postgres');
select pg_temp.check('ο επαγγελματίας παίρνει πίσω τη χρέωσή του', pg_temp.wallet('Ελένη Υποψήφια') = :we0 + 25);
select pg_temp.check('ο πελάτης δεν παίρνει πίσω το τέλος (ακύρωσε ο ίδιος)', pg_temp.wallet('Μαρία Πελάτη') = :wc3);
select pg_temp.check('καταγράφεται στην αξιοπιστία του πελάτη', (select cancellation_flag_count = 1 from client_profiles where user_id = :'CLIENT'));
select pg_temp.check('ο επαγγελματίας ειδοποιήθηκε', exists (select 1 from notifications where user_id = :'ELENI' and kind = 'booking_cancelled'));
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('δεν ανοίγει υπόθεση αντικατάστασης (ακύρωσε ο πελάτης)', not exists (select 1 from admin_replacement_cases(true) where booking_id = :'bk'));

-- =============================================================================
\echo '== μηνύματα'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 20, current_date + 22, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper')
  returning id as req2 \gset
select (pay_and_broadcast(:'req2', array[:'SP_KOSTAS']::uuid[])).status is not null;
select pg_temp.act('authenticated', :'KOSTAS');
select (claim_booking_request(:'req2', :'SP_KOSTAS')).id as bk2 \gset
insert into messages (booking_id, sender_id, content) values (:'bk2', :'KOSTAS', 'Καλησπέρα, τα λέμε στη Νάξο');
select pg_temp.act('authenticated', :'CLIENT');
insert into messages (booking_id, sender_id, content) values (:'bk2', :'CLIENT', 'Τέλεια, ευχαριστώ');
select pg_temp.check('ο πελάτης βλέπει τη συνομιλία', (select count(*) = 2 from messages where booking_id = :'bk2'));
select pg_temp.expect(format($$insert into messages (booking_id, sender_id, content) values (%L, %L, 'ψεύτικο')$$, :'bk2', :'KOSTAS'),
  'new row violates row-level security policy%');
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.check('τρίτος δεν βλέπει τη συνομιλία', (select count(*) = 0 from messages where booking_id = :'bk2'));
select pg_temp.expect(format($$insert into messages (booking_id, sender_id, content) values (%L, %L, 'spam')$$, :'bk2', :'ELENI'),
  'new row violates row-level security policy%');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format($$insert into messages (booking_id, sender_id, content) values (%L, %L, 'μετά την ακύρωση')$$, :'bk', :'CLIENT'),
  'new row violates row-level security policy%');

-- =============================================================================
\echo '== κριτικές'
select pg_temp.act('postgres');
update bookings set start_date = current_date - 6, end_date = current_date - 4 where id = :'bk2';
select mark_bookings_completed() >= 1;
select pg_temp.check('η κράτηση ολοκληρώθηκε αυτόματα', (select status = 'completed' from bookings where id = :'bk2'));
select pg_temp.act('authenticated', :'CLIENT');
insert into reviews (booking_id, reviewer_id, reviewee_id, rating, comment,
                     rating_safety, rating_seamanship, rating_professionalism, rating_cleanliness, rating_communication, rating_hospitality)
  values (:'bk2', :'CLIENT', :'KOSTAS', 1, 'Πολύ καλός', 5, 4, 4, 4, 3, 4);
select pg_temp.expect(format($$insert into reviews (booking_id, reviewer_id, reviewee_id, rating, rating_safety, rating_seamanship,
  rating_professionalism, rating_cleanliness, rating_communication, rating_hospitality) values (%L, %L, %L, 1, 1, 1, 1, 1, 1, 1)$$, :'bk2', :'CLIENT', :'KOSTAS'),
  'duplicate key value violates unique constraint%');
select pg_temp.act('postgres');
select pg_temp.check('ο βαθμός βγαίνει από τις κατηγορίες (όχι όποιον στείλει ο πελάτης)', (select rating = 4 from reviews where booking_id = :'bk2'));
select pg_temp.check('ο μέσος όρος του επαγγελματία ενημερώθηκε', (select rating_avg = 4 and rating_count = 1 from skipper_profiles where id = :'SP_KOSTAS'));
select pg_temp.check('ο επαγγελματίας ειδοποιήθηκε για την κριτική', exists (select 1 from notifications where user_id = :'KOSTAS' and kind = 'review_received'));
-- Someone outside the booking can't even see it, so the end-date check (which
-- reads the booking under the caller's RLS) is what turns them away.
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.expect(format($$insert into reviews (booking_id, reviewer_id, reviewee_id, rating, rating_safety, rating_seamanship,
  rating_professionalism, rating_cleanliness, rating_communication, rating_hospitality) values (%L, %L, %L, 1, 1, 1, 1, 1, 1, 1)$$, :'bk2', :'ELENI', :'KOSTAS'),
  'review_not_allowed_%');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format($$insert into reviews (booking_id, reviewer_id, reviewee_id, rating, rating_safety, rating_seamanship,
  rating_professionalism, rating_cleanliness, rating_communication, rating_hospitality) values (%L, %L, %L, 1, 1, 1, 1, 1, 1, 1)$$, :'bk', :'CLIENT', :'ELENI'),
  'review_not_allowed_%');

-- =============================================================================
\echo '== εγγραφή επαγγελματία και έγκριση'
select pg_temp.act('postgres');
insert into auth.users (id, phone) values ('f0000000-0000-0000-0000-000000000001', '306900007777');
\set NEWPRO 'f0000000-0000-0000-0000-000000000001'
select pg_temp.act('authenticated', :'NEWPRO');
select complete_registration('Νέος Skipper', 'new@example.com', '+306900007777', 'skipper', false);
select pg_temp.act('postgres');
select pg_temp.check('νέος επαγγελματίας: σε αναμονή έγκρισης', (select approval_status = 'pending' from skipper_profiles where user_id = :'NEWPRO'));
select id as newsp from skipper_profiles where user_id = :'NEWPRO' \gset
insert into availability_windows (skipper_id, start_date, end_date) values (:'newsp', current_date + 5, current_date + 40) returning id as nw \gset
insert into availability_window_regions (window_id, region_id) values (:'nw', :'cyclades');
insert into skipper_boat_types (skipper_id, boat_type_id) values (:'newsp', :'sailboat');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('πριν την έγκριση δεν εμφανίζεται στην αναζήτηση', not exists (
  select 1 from search_available_skippers(current_date + 10, current_date + 12, :'cyclades', :'sailboat') where id = :'newsp'));
select pg_temp.act('authenticated', :'ADMIN');
select admin_approve_skipper(:'NEWPRO');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('μετά την έγκριση εμφανίζεται (ανώνυμα)', exists (
  select 1 from search_available_skippers(current_date + 10, current_date + 12, :'cyclades', :'sailboat') where id = :'newsp'));
select pg_temp.act('postgres');
select pg_temp.check('ο επαγγελματίας ειδοποιήθηκε για την έγκριση', exists (select 1 from notifications where user_id = :'NEWPRO' and kind = 'profile_approved'));

-- =============================================================================
\echo '== ανεσταλμένος λογαριασμός'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 25, current_date + 27, :'cyclades', 'Σύρος', 'Σύρος', :'sailboat', 'skipper')
  returning id as req3 \gset
select pg_temp.act('authenticated', :'ADMIN');
select admin_suspend_account(:'CLIENT', 'Δοκιμή αναστολής');
-- The app signs a suspended user out at login, but a session that was already
-- open keeps its token. What can that session still do?
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format($$insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (%L, current_date + 25, current_date + 27, %L, 'Σύρος', 'Σύρος', %L, 'skipper')$$, :'CLIENT', :'cyclades', :'sailboat'),
  'account_not_active');
select pg_temp.expect(format('select pay_and_broadcast(%L, array[%L]::uuid[])', :'req3', :'SP_ELENI'), 'account_not_active');
select pg_temp.expect(format($$insert into messages (booking_id, sender_id, content) values (%L, %L, 'από ανεσταλμένο')$$, :'bk2', :'CLIENT'),
  'account_not_active');
select pg_temp.expect(format('select cancel_booking_request(%L)', :'req3'), 'account_not_active');
select pg_temp.act('authenticated', :'ADMIN');
select admin_suspend_account(:'KOSTAS', 'Δοκιμή αναστολής επαγγελματία');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format($$insert into messages (booking_id, sender_id, content) values (%L, %L, 'από ανεσταλμένο')$$, :'bk2', :'KOSTAS'),
  'account_not_active');
select pg_temp.expect(format($$insert into availability_windows (skipper_id, start_date, end_date) values (%L, current_date + 50, current_date + 60)$$, :'SP_KOSTAS'),
  'account_not_active');
select pg_temp.act('authenticated', :'ADMIN');
select admin_reactivate_account(:'KOSTAS');
select pg_temp.act('authenticated', :'ADMIN');
select admin_reactivate_account(:'CLIENT');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('μετά την επανενεργοποίηση όλα δουλεύουν ξανά',
  (pay_and_broadcast(:'req3', array[:'SP_ELENI']::uuid[])).fee_paid_at is not null);
