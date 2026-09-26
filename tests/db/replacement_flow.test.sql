-- Skipper cancels a confirmed booking → admin offers the job to candidates →
-- candidates declare interest (or withdraw) → client picks within 24h → the
-- chosen one is charged once. Plus every way an offer or a case can close.
-- Every action runs as the real API role of the person doing it.
\i tests/db/helpers.sql

\set SP_NIKOS   'b0000000-0000-0000-0000-000000000003'
\set SP_GIORGOS 'b0000000-0000-0000-0000-000000000004'
\set SP_KOSTAS  'b0000000-0000-0000-0000-000000000005'
\set SP_ELENI   'b0000000-0000-0000-0000-000000000006'
\set SP_PETROS  'b0000000-0000-0000-0000-000000000007'
\set SP_SOFIA   'b0000000-0000-0000-0000-000000000008'

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset
select pg_temp.wallet('Μαρία Πελάτη') as w0 \gset

\echo '== κράτηση και ακύρωση από τον skipper'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 15, current_date + 18, :'cyclades', 'Μύκονος', 'Μύκονος', :'sailboat', 'skipper')
  returning id as req1 \gset
select (pay_and_broadcast(:'req1', array[:'SP_NIKOS']::uuid[])).status is not null;
select pg_temp.act('authenticated', :'NIKOS');
select (claim_booking_request(:'req1', :'SP_NIKOS')).id as bk1 \gset
select pg_temp.expect(format('select cancel_booking(%L, %L)', :'bk1', '  '), 'reason_required');
select (cancel_booking(:'bk1', 'Αρρώστησα')).status;

select pg_temp.act('postgres');
select pg_temp.check('ο πελάτης ΔΕΝ πήρε επιστροφή όταν ακύρωσε ο skipper', pg_temp.wallet('Μαρία Πελάτη') = :w0 - 15);
select pg_temp.check('η ειδοποίηση πελάτη λέει επιστροφή 0',
  (select (data->>'refund')::numeric = 0 from notifications where user_id = :'CLIENT' and kind = 'booking_cancelled' order by created_at desc limit 1));

\echo '== ο admin βλέπει και στέλνει πρόταση'
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('στάδιο: χρειάζεται ενέργεια', (select stage = 'needs_action' from admin_replacement_cases() where booking_id = :'bk1'));
select pg_temp.check('ο admin βλέπει ποιος ακύρωσε', (select cancelled_skipper_name = 'Νίκος Αρχικός' from admin_replacement_cases() where booking_id = :'bk1'));
select pg_temp.check('η αναζήτηση εξαιρεί όποιον ακύρωσε', not exists (
  select 1 from admin_search_availability('skipper', current_date + 15, current_date + 18, null, :'cyclades', :'bk1') where full_name = 'Νίκος Αρχικός'));
select pg_temp.check('η αναζήτηση φιλτράρει περιοχή', not exists (
  select 1 from admin_search_availability('skipper', current_date + 15, current_date + 18, null, :'cyclades', :'bk1') where full_name = 'Ιόνιος Κέρκυρα'));
select pg_temp.check('η αναζήτηση βρίσκει τους 5 διαθέσιμους', (
  select count(*) = 5 from admin_search_availability('skipper', current_date + 15, current_date + 18, null, :'cyclades', :'bk1')));
select pg_temp.expect(format('select admin_create_offer(array[%L]::uuid[], p_replaces_booking_id := %L)', :'SP_NIKOS', :'bk1'), 'skipper_cancelled_this_trip');
select (admin_create_offer(array[:'SP_GIORGOS', :'SP_KOSTAS', :'SP_ELENI', :'SP_PETROS', :'SP_SOFIA']::uuid[],
        p_replaces_booking_id := :'bk1', p_expires_hours := 24)).id as off1 \gset
select pg_temp.expect(format('select admin_create_offer(array[%L]::uuid[], p_replaces_booking_id := %L)', :'SP_GIORGOS', :'bk1'), 'offer_already_open');
select pg_temp.check('στάδιο: αναμονή απαντήσεων', (select stage = 'awaiting_skippers' from admin_replacement_cases() where booking_id = :'bk1'));

\echo '== ο πελάτης δεν πειράζει την πρόταση του admin'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select cancel_booking_request(%L)', :'off1'), 'not_client_request');
select pg_temp.expect(format('select client_withdraw_ping(%L, (select id from booking_request_pings where booking_request_id = %L limit 1))', :'off1', :'off1'), 'not_client_request');

\echo '== απαντήσεις υποψηφίων'
select pg_temp.act('authenticated', :'GIORGOS'); select respond_to_replacement_offer(:'off1', :'SP_GIORGOS', true);
select pg_temp.act('authenticated', :'KOSTAS');  select respond_to_replacement_offer(:'off1', :'SP_KOSTAS', true);
select pg_temp.act('authenticated', :'ELENI');   select respond_to_replacement_offer(:'off1', :'SP_ELENI', true);
select pg_temp.act('authenticated', :'PETROS');  select respond_to_replacement_offer(:'off1', :'SP_PETROS', false);
select pg_temp.expect(format('select respond_to_replacement_offer(%L, %L, true)', :'off1', :'SP_PETROS'), 'already_resolved');

select pg_temp.act('postgres');
select pg_temp.check('ο 1ος υποψήφιος όρισε προθεσμία πελάτη ~24 ώρες',
  (select client_decide_by between now() + interval '23 hours' and now() + interval '25 hours' from booking_requests where id = :'off1'));
select pg_temp.check('ο πελάτης ειδοποιήθηκε ΜΙΑ φορά', (select count(*) = 1 from notifications where user_id = :'CLIENT' and kind = 'replacement_candidate_available'));
select pg_temp.check('κανείς δεν χρεώθηκε ακόμα για δήλωση ενδιαφέροντος',
  not exists (select 1 from wallet_transactions where related_booking_request_id = :'off1'));
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('στάδιο: αναμονή πελάτη, 3 υποψήφιοι, 1 χωρίς απάντηση',
  (select stage = 'awaiting_client' and offer_candidates = 3 and offer_pending = 1 from admin_replacement_cases() where booking_id = :'bk1'));

\echo '== ο υποψήφιος δεν δεσμεύεται'
select pg_temp.act('authenticated', :'ELENI'); select withdraw_replacement_candidacy(:'off1', :'SP_ELENI');
select pg_temp.expect(format('select withdraw_replacement_candidacy(%L, %L)', :'off1', :'SP_ELENI'), 'not_a_candidate');
select pg_temp.act('authenticated', :'SOFIA');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'SOFIA', current_date + 16, current_date + 17, :'cyclades', 'Πάρος', 'Πάρος', :'sailboat', 'skipper')
  returning id as other_req \gset
select (pay_and_broadcast(:'other_req', array[:'SP_GIORGOS']::uuid[])).status is not null;
select pg_temp.act('authenticated', :'GIORGOS');
select pg_temp.check('ο υποψήφιος παίρνει ελεύθερα άλλη δουλειά τις ίδιες μέρες',
  (claim_booking_request(:'other_req', :'SP_GIORGOS')).status = 'confirmed');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('ο πελάτης βλέπει πλέον μόνο τον Κώστα',
  (select array_agg(id) = array[:'SP_KOSTAS']::uuid[] from client_list_replacement_candidates(:'off1')));
select pg_temp.check('οι υποψήφιοι φαίνονται ανώνυμα (χωρίς όνομα/τηλέφωνο)', not exists (
  select 1 from information_schema.columns where table_name = 'skipper_public' and column_name in ('full_name', 'phone_number', 'user_id')));
select pg_temp.expect(format('select client_select_replacement_candidate(%L, %L)', :'off1', :'SP_GIORGOS'), 'not_a_candidate');
select pg_temp.act('postgres');
select pg_temp.check('ιστορικό: μία αυτόματη απόσυρση, μία ανάκληση',
  (select count(*) = 2 from booking_request_pings where booking_request_id = :'off1' and withdrawn_at is not null));

\echo '== ο πελάτης διαλέγει'
select pg_temp.wallet('Κώστας Υποψήφιος') as wk \gset
select pg_temp.act('authenticated', :'CLIENT');
select (client_select_replacement_candidate(:'off1', :'SP_KOSTAS')).id as rep1 \gset
select pg_temp.expect(format('select client_select_replacement_candidate(%L, %L)', :'off1', :'SP_KOSTAS'), 'request_not_open');
select pg_temp.act('postgres');
select pg_temp.check('ο επιλεγμένος χρεώθηκε 25€ μία φορά', pg_temp.wallet('Κώστας Υποψήφιος') = :wk - 25);
select pg_temp.check('ο πελάτης δεν χρεώθηκε ξανά', pg_temp.wallet('Μαρία Πελάτη') = :w0 - 15);
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('υπόθεση ολοκληρώθηκε, με όνομα και χρέωση',
  (select stage = 'completed' and new_skipper_name = 'Κώστας Υποψήφιος' and charged = 25 from admin_replacement_cases(true) where booking_id = :'bk1'));
select pg_temp.check('δεν εμφανίζεται πια στις ενεργές', not exists (select 1 from admin_replacement_cases(false) where booking_id = :'bk1'));
select pg_temp.check('dashboard: καμία εκκρεμότητα αντικατάστασης',
  (select (admin_overview()->>'coverage_needed')::int + (admin_overview()->>'coverage_offered')::int = 0));

\echo '== ακυρώνει και ο αντικαταστάτης'
select pg_temp.act('authenticated', :'KOSTAS'); select (cancel_booking(:'rep1', 'Πρόβλημα υγείας')).status;
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('μία μόνο ενεργή υπόθεση για το ταξίδι (η νεότερη)',
  (select count(*) = 1 and bool_and(booking_id = :'rep1') from admin_replacement_cases(false) where trip_root_id = :'bk1'));
select pg_temp.check('μετράει 2 ακυρώσεις στο ταξίδι', (select skipper_cancellations = 2 from admin_replacement_cases() where booking_id = :'rep1'));
select pg_temp.expect(format('select admin_create_offer(array[%L]::uuid[], p_replaces_booking_id := %L)', :'SP_ELENI', :'bk1'), 'not_latest_in_trip');
select pg_temp.expect(format('select admin_create_offer(array[%L]::uuid[], p_replaces_booking_id := %L)', :'SP_KOSTAS', :'rep1'), 'skipper_cancelled_this_trip');
select pg_temp.check('το ιστορικό δείχνει 2 κρατήσεις και 1 πρόταση',
  (select jsonb_array_length(d->'trip') = 2 and jsonb_array_length(d->'offers') = 1 from admin_replacement_case_detail(:'rep1') d));

\echo '== κανείς δεν απαντά'
select (admin_create_offer(array[:'SP_ELENI', :'SP_PETROS']::uuid[], p_replaces_booking_id := :'rep1', p_expires_hours := 3)).id as off2 \gset
select pg_temp.act('postgres'); update booking_requests set expires_at = now() - interval '1 minute' where id = :'off2';
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('ληγμένη πρόταση → χρειάζεται ενέργεια αμέσως', (select stage = 'needs_action' from admin_replacement_cases() where booking_id = :'rep1'));
select pg_temp.check('dashboard: 1 υπόθεση χρειάζεται ενέργεια', (admin_overview()->>'coverage_needed')::int = 1);
select (admin_create_offer(array[:'SP_ELENI', :'SP_SOFIA']::uuid[], p_replaces_booking_id := :'rep1')).id as off3 \gset
select pg_temp.act('postgres');
select pg_temp.check('η ληγμένη πρόταση έκλεισε αυτόματα (no_response)',
  (select status = 'expired_unclaimed' and closed_reason = 'no_response' from booking_requests where id = :'off2'));

\echo '== ο πελάτης δεν αποφασίζει σε 24 ώρες'
select pg_temp.act('authenticated', :'ELENI'); select respond_to_replacement_offer(:'off3', :'SP_ELENI', true);
select pg_temp.act('postgres'); update booking_requests set client_decide_by = now() - interval '1 minute' where id = :'off3';
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('μετά την προθεσμία δεν βλέπει υποψηφίους', not exists (select 1 from client_list_replacement_candidates(:'off3')));
select pg_temp.expect(format('select client_select_replacement_candidate(%L, %L)', :'off3', :'SP_ELENI'), 'decision_window_closed');
select pg_temp.act('authenticated', :'SOFIA');
select pg_temp.expect(format('select respond_to_replacement_offer(%L, %L, true)', :'off3', :'SP_SOFIA'), 'request_not_open');
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('η υπόθεση δεν κολλάει: χρειάζεται ενέργεια', (select stage = 'needs_action' from admin_replacement_cases() where booking_id = :'rep1'));
select pg_temp.act('postgres');
select expire_stale_booking_requests() >= 1;
select pg_temp.check('η νυχτερινή εργασία την έκλεισε (client_timeout)',
  (select status = 'expired_unclaimed' and closed_reason = 'client_timeout' from booking_requests where id = :'off3'));
select pg_temp.check('ο υποψήφιος ειδοποιήθηκε', exists (select 1 from notifications where user_id = :'ELENI' and kind = 'replacement_offer_closed'));
select pg_temp.check('ο πελάτης ειδοποιήθηκε', exists (select 1 from notifications where user_id = :'CLIENT' and kind = 'replacement_choice_expired'));

\echo '== απόσυρση από τον admin'
select pg_temp.act('authenticated', :'ADMIN');
select (admin_create_offer(array[:'SP_ELENI']::uuid[], p_replaces_booking_id := :'rep1')).id as off4 \gset
select pg_temp.act('authenticated', :'ELENI'); select respond_to_replacement_offer(:'off4', :'SP_ELENI', true);
select pg_temp.act('authenticated', :'ADMIN'); select (admin_cancel_offer(:'off4')).status;
select pg_temp.check('μετά την απόσυρση: χρειάζεται ενέργεια', (select stage = 'needs_action' from admin_replacement_cases() where booking_id = :'rep1'));
select pg_temp.act('postgres');
select pg_temp.check('ο υποψήφιος ειδοποιήθηκε για την απόσυρση', (select count(*) = 2 from notifications where user_id = :'ELENI' and kind = 'replacement_offer_closed'));
select pg_temp.check('καμία εκκρεμής απάντηση δεν μένει ανοιχτή', (select status = 'missed' from booking_request_pings where booking_request_id = :'off4'));

\echo '== κλείσιμο χωρίς αντικαταστάτη → επιστροφή μία φορά'
select pg_temp.wallet('Μαρία Πελάτη') as wc \gset
select pg_temp.act('authenticated', :'ADMIN');
select admin_close_replacement_case(:'rep1', 'Δεν βρέθηκε κανείς');
select pg_temp.expect(format('select admin_close_replacement_case(%L, %L)', :'rep1', 'ξανά'), 'case_closed');
select pg_temp.expect(format('select admin_create_offer(array[%L]::uuid[], p_replaces_booking_id := %L)', :'SP_ELENI', :'rep1'), 'case_closed');
select pg_temp.check('στάδιο: έκλεισε χωρίς αντικαταστάτη', (select stage = 'closed_unfilled' from admin_replacement_cases(true) where booking_id = :'rep1'));
select pg_temp.act('postgres');
select pg_temp.check('επιστράφηκαν 15€ στον πελάτη, μία φορά', pg_temp.wallet('Μαρία Πελάτη') = :wc + 15);

\echo '== αυτόματο κλείσιμο όταν φτάσει η μέρα του ταξιδιού'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 6, current_date + 7, :'cyclades', 'Σύρος', 'Σύρος', :'sailboat', 'skipper')
  returning id as req2 \gset
select (pay_and_broadcast(:'req2', array[:'SP_PETROS']::uuid[])).status is not null;
select pg_temp.act('authenticated', :'PETROS');
select (claim_booking_request(:'req2', :'SP_PETROS')).id as bk2 \gset
select (cancel_booking(:'bk2', 'Δεν μπορώ')).status;
select pg_temp.act('postgres');
select pg_temp.wallet('Μαρία Πελάτη') as wd \gset
update bookings set start_date = current_date, end_date = current_date + 1 where id = :'bk2';
select expire_stale_booking_requests() >= 1;
select pg_temp.check('έκλεισε αυτόματα με επιστροφή 15€', pg_temp.wallet('Μαρία Πελάτη') = :wd + 15
  and (select replacement_closed_at is not null from bookings where id = :'bk2'));
select pg_temp.check('ο πελάτης ειδοποιήθηκε (2 υποθέσεις χωρίς αντικαταστάτη)',
  (select count(*) = 2 from notifications where user_id = :'CLIENT' and kind = 'replacement_unfilled'));

\echo '== ποτέ δύο επαγγελματίες στο ίδιο ταξίδι'
select pg_temp.check('κανένα ταξίδι με 2 επιβεβαιωμένους', not exists (
  select trip_root_id from bookings where status in ('confirmed', 'completed') group by trip_root_id having count(*) > 1));
select pg_temp.check('κάθε πορτοφόλι συμφωνεί με τις κινήσεις του', not exists (
  select 1 from users u where u.wallet_balance <> coalesce((select sum(amount) from wallet_transactions w where w.user_id = u.id), 0)));
