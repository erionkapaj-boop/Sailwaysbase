-- The owner's decisions on the audit (migration 0107): re-review after a
-- licence/name change, a suspended professional's bookings becoming
-- replacement cases, nothing cancellable once the trip has started, and the
-- "professional never answered" cancellation.
\i tests/db/helpers.sql

\set SP_NIKOS   'b0000000-0000-0000-0000-000000000003'
\set SP_KOSTAS  'b0000000-0000-0000-0000-000000000005'
\set SP_ELENI   'b0000000-0000-0000-0000-000000000006'

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset
update users set phone_verified_at = now() where id = :'CLIENT';

-- =============================================================================
\echo '== #13 #14 αλλαγή διπλώματος ή ονόματος → ξανά σε έλεγχο'
select pg_temp.act('authenticated', :'NIKOS');
update skipper_profiles set price_per_day = 320 where user_id = auth.uid();
select pg_temp.act('postgres');
select pg_temp.check('αλλαγή τιμής: μένει εγκεκριμένος', (select approval_status = 'approved' from skipper_profiles where id = :'SP_NIKOS'));
select pg_temp.act('authenticated', :'NIKOS');
update skipper_profiles set license_number = 'ΝΕΟ-12345' where user_id = auth.uid();
select pg_temp.act('postgres');
select pg_temp.check('νέο δίπλωμα: πάει ξανά σε έλεγχο', (select approval_status = 'pending' and approved_at is null from skipper_profiles where id = :'SP_NIKOS'));
select pg_temp.check('ο επαγγελματίας ενημερώθηκε', exists (select 1 from notifications where user_id = :'NIKOS' and kind = 'profile_rereview'));
select pg_temp.check('ο διαχειριστής ειδοποιήθηκε', exists (select 1 from notifications where user_id = :'ADMIN' and kind = 'admin_pro_pending'));
select pg_temp.act('authenticated', :'ADMIN');
select (admin_approve_skipper(:'NIKOS')).approval_status;
select pg_temp.act('authenticated', :'NIKOS');
update skipper_profiles set full_name = 'Άλλος Άνθρωπος' where user_id = auth.uid();
select pg_temp.act('postgres');
select pg_temp.check('νέο όνομα: κι αυτό σε έλεγχο', (select approval_status = 'pending' from skipper_profiles where id = :'SP_NIKOS'));
update skipper_profiles set approval_status = 'approved', approved_at = now() where id = :'SP_NIKOS';

-- =============================================================================
\echo '== #52 από την ημέρα έναρξης δεν ακυρώνεται τίποτα'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 20, current_date + 22, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper')
  returning id as req1 \gset
select (pay_and_broadcast(:'req1', array[:'SP_ELENI']::uuid[])).status is not null;
select pg_temp.act('authenticated', :'ELENI');
select (claim_booking_request(:'req1', :'SP_ELENI')).id as bk1 \gset
select pg_temp.act('postgres');
select pg_temp.check('με την επιβεβαίωση φεύγει αυτόματο πρώτο μήνυμα από τον πελάτη',
  (select count(*) = 1 from messages where booking_id = :'bk1' and auto and sender_id = :'CLIENT'));
update bookings set start_date = current_date, end_date = current_date + 2 where id = :'bk1';
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select cancel_booking(%L, %L)', :'bk1', 'Άλλαξαν τα σχέδια'), 'trip_started');
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.expect(format('select cancel_booking(%L, %L)', :'bk1', 'Αρρώστησα'), 'trip_started');
select pg_temp.act('postgres');
update bookings set start_date = current_date + 20, end_date = current_date + 22 where id = :'bk1';

-- =============================================================================
\echo '== #52 ο επαγγελματίας δεν απάντησε'
select pg_temp.wallet('Μαρία Πελάτη') as wc0 \gset
select pg_temp.wallet('Ελένη Υποψήφια') as we0 \gset
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('πριν την προθεσμία: όχι ακόμα', not (booking_response_state(:'bk1') ->> 'can_cancel_no_response')::boolean);
select pg_temp.expect(format('select cancel_booking_no_response(%L)', :'bk1'), 'response_time_not_over');
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.expect(format('select booking_response_state(%L)', :'bk1'), 'not_participant');
select pg_temp.act('postgres');
update bookings set confirmed_at = now() - interval '25 hours' where id = :'bk1';
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.check('η επαγγελματίας βλέπει ότι δεν έχει απαντήσει', not (booking_response_state(:'bk1') ->> 'responded')::boolean);
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('μετά την προθεσμία, χωρίς απάντηση: μπορεί', (booking_response_state(:'bk1') ->> 'can_cancel_no_response')::boolean);
select (cancel_booking_no_response(:'bk1')).status;
select pg_temp.act('postgres');
select pg_temp.check('ακυρώθηκε με ευθύνη του επαγγελματία, χωρίς υπόθεση αντικατάστασης',
  (select status = 'cancelled_by_skipper' and replacement_closed_at is not null and cancellation_weight > 0 from bookings where id = :'bk1'));
select pg_temp.check('κανένα τέλος δεν επιστράφηκε σε κανέναν',
  pg_temp.wallet('Μαρία Πελάτη') = :wc0 and pg_temp.wallet('Ελένη Υποψήφια') = :we0);
select pg_temp.check('η επαγγελματίας ειδοποιήθηκε', exists (select 1 from notifications where user_id = :'ELENI' and kind = 'booking_cancelled' and data ->> 'by' = 'no_response'));
select pg_temp.check('ο διαχειριστής δεν έχει ανοιχτή υπόθεση γι αυτό', not exists (
  select 1 from notifications where kind = 'coverage_needed' and created_at > now() - interval '1 minute'));

\echo '== #52 αν απάντησε, όλα θεωρούνται τελειωμένα'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 30, current_date + 32, :'cyclades', 'Πάρος', 'Πάρος', :'sailboat', 'skipper')
  returning id as req2 \gset
select (pay_and_broadcast(:'req2', array[:'SP_ELENI']::uuid[])).status is not null;
select pg_temp.act('authenticated', :'ELENI');
select (claim_booking_request(:'req2', :'SP_ELENI')).id as bk2 \gset
insert into messages (booking_id, sender_id, content) values (:'bk2', :'ELENI', 'Καλησπέρα! Το τηλέφωνό μου είναι στο προφίλ.');
select pg_temp.act('postgres');
update bookings set confirmed_at = now() - interval '3 days' where id = :'bk2';
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select cancel_booking_no_response(%L)', :'bk2'), 'professional_responded');

-- =============================================================================
\echo '== #43 αναστολή επαγγελματία → αντικατάσταση'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 20, current_date + 22, :'cyclades', 'Σύρος', 'Σύρος', :'sailboat', 'skipper')
  returning id as req3 \gset
select (pay_and_broadcast(:'req3', array[:'SP_KOSTAS']::uuid[])).status is not null;
select pg_temp.act('authenticated', :'KOSTAS');
select (claim_booking_request(:'req3', :'SP_KOSTAS')).id as bk3 \gset
select pg_temp.act('authenticated', :'ADMIN');
select admin_suspend_account(:'KOSTAS', 'Παράβαση όρων');
select pg_temp.act('postgres');
select pg_temp.check('η μελλοντική κράτηση έγινε υπόθεση αντικατάστασης, χωρίς βάρος αξιοπιστίας',
  (select status = 'cancelled_by_skipper' and replacement_closed_at is null and cancellation_weight = 0 from bookings where id = :'bk3'));
select pg_temp.check('ο πελάτης ενημερώθηκε ότι ψάχνουμε αντικαταστάτη',
  exists (select 1 from notifications where user_id = :'CLIENT' and kind = 'booking_cancelled'
          and (data ->> 'removed')::boolean and (data ->> 'searching')::boolean));
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('η υπόθεση φαίνεται στις αντικαταστάσεις', exists (select 1 from admin_replacement_cases(false) where booking_id = :'bk3'));

-- =============================================================================
\echo '== βοηθός διαχειριστή δεν διαγράφει άλλον βοηθό'
select pg_temp.act('postgres');
update users set is_staff_admin = true where id in (:'SOFIA', :'PETROS');
select pg_temp.act('authenticated', :'SOFIA');
select pg_temp.expect(format('select admin_delete_account(%L, %L)', :'PETROS', 'x'), 'cannot_edit_admin');
