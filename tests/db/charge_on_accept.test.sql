-- Χρέωση του πελάτη με την αποδοχή (0122): το credit δεσμεύεται στην αποστολή,
-- χρεώνεται όταν αποδεχτεί επαγγελματίας, και απλώς ελευθερώνεται αν το
-- αίτημα λήξει ή ακυρωθεί. Αιτήματα πριν το 0122 κρατούν την επιστροφή τους.
-- Και: αίτημα σε εξέλιξη, αποθηκευμένο στον λογαριασμό.
\i tests/db/helpers.sql

\set SP_NIKOS   'b0000000-0000-0000-0000-000000000003'
\set SP_GIORGOS 'b0000000-0000-0000-0000-000000000004'
\set SP_KOSTAS  'b0000000-0000-0000-0000-000000000005'
\set SP_ELENI   'b0000000-0000-0000-0000-000000000006'

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset
update users set phone_verified_at = now() where id = :'CLIENT';

-- Νέο αίτημα πελάτη για τις ημέρες start..start+2 (μετά από σήμερα).
create or replace function pg_temp.new_request(p_start int) returns uuid language sql as $$
  insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (auth.uid(), current_date + p_start, current_date + p_start + 2,
          (select id from regions where name = 'Κυκλάδες'), 'Νάξος', 'Νάξος',
          (select id from boat_types where name = 'Ιστιοπλοϊκό'), 'skipper')
  returning id
$$;

-- Η πελάτισσα ξεκινά με 2 credits.
select pg_temp.act('authenticated', :'ADMIN');
select admin_adjust_wallet(:'CLIENT', -98, 'Τεστ: 2 credits');

\echo '== αποστολή: καμία χρέωση, 1 credit δεσμεύεται'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.new_request(10) as r1 \gset
select (pay_and_broadcast(:'r1', array[:'SP_KOSTAS', :'SP_ELENI']::uuid[])).fee_paid_at is not null;
select pg_temp.act('postgres');
select pg_temp.check('το υπόλοιπο μένει 2, χωρίς κίνηση για το αίτημα',
  pg_temp.wallet('Μαρία Πελάτη') = 2
  and not exists (select 1 from wallet_transactions where related_booking_request_id = :'r1'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('η πελάτισσα βλέπει 1 credit δεσμευμένο', my_reserved_credits() = 1);
select pg_temp.expect($$select user_reserved_credits(auth.uid())$$, 'permission denied%');

\echo '== όριο: ανοιχτά αιτήματα ≤ υπόλοιπο'
select pg_temp.new_request(14) as r2 \gset
select (pay_and_broadcast(:'r2', array[:'SP_KOSTAS']::uuid[])).fee_paid_at is not null;
select pg_temp.check('2 credits, 2 ανοιχτά αιτήματα', my_reserved_credits() = 2);
select pg_temp.new_request(18) as r3 \gset
select pg_temp.expect(format('select pay_and_broadcast(%L, array[%L]::uuid[])', :'r3', :'SP_KOSTAS'), 'insufficient_wallet');

\echo '== άλλες χρεώσεις δεν αγγίζουν τα δεσμευμένα'
select (create_delivery_request('Λαύριο', 'Πάρος', 90, 'fixed', current_date + 30, 0,
        true, true, false, null, true, false)).id as dr \gset
select pg_temp.act('postgres');
insert into delivery_availability_windows (skipper_id, crew_role, start_date, end_date)
  values (:'SP_GIORGOS', 'skipper', current_date + 1, current_date + 90);
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select create_delivery_role_request(%L, %L, 300, array[%L]::uuid[])', :'dr', 'skipper', :'SP_GIORGOS'),
  'insufficient_wallet');
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.expect(format('select admin_adjust_wallet(%L, -1, %L)', :'CLIENT', 'x'), 'credits_reserved');

\echo '== αποδοχή: χρεώνεται τώρα ο πελάτης'
select pg_temp.act('postgres');
select pg_temp.wallet('Κώστας Υποψήφιος') as wk0 \gset
select pg_temp.act('authenticated', :'KOSTAS');
select (claim_booking_request(:'r1', :'SP_KOSTAS')).id as b1 \gset
select pg_temp.act('postgres');
select pg_temp.check('πελάτισσα: −1 credit, με την κράτηση στην κίνηση',
  pg_temp.wallet('Μαρία Πελάτη') = 1
  and exists (select 1 from wallet_transactions where user_id = :'CLIENT' and type = 'request_fee'
                 and amount = -1 and related_booking_request_id = :'r1' and related_booking_id = :'b1'));
select pg_temp.check('επαγγελματίας: −1 credit, όπως πάντα', pg_temp.wallet('Κώστας Υποψήφιος') = :wk0 - 1);
select pg_temp.check('το αίτημα σημειώνεται ως χρεωμένο',
  (select client_charged_at is not null and status = 'matched' from booking_requests where id = :'r1'));
select pg_temp.check('η δέσμευση του αιτήματος φεύγει: μένει 1 (το δεύτερο αίτημα)', user_reserved_credits(:'CLIENT') = 1);
select pg_temp.check('ειδοποίηση κίνησης στην πελάτισσα',
  exists (select 1 from notifications where user_id = :'CLIENT' and kind = 'wallet' and data ->> 'txn_type' = 'request_fee'));

\echo '== ακύρωση από τον πελάτη: τίποτα δεν επιστρέφεται, η δέσμευση φεύγει'
select count(*) as tx0 from wallet_transactions where user_id = :'CLIENT' \gset
select pg_temp.act('authenticated', :'CLIENT');
select cancel_booking_request(:'r2');
select pg_temp.act('postgres');
select pg_temp.check('καμία κίνηση, υπόλοιπο 1, τίποτα δεσμευμένο',
  (select count(*) from wallet_transactions where user_id = :'CLIENT') = :tx0
  and pg_temp.wallet('Μαρία Πελάτη') = 1 and user_reserved_credits(:'CLIENT') = 0);

\echo '== λήξη χωρίς αποδοχή: το credit ελευθερώνεται'
select pg_temp.act('authenticated', :'CLIENT');
select (pay_and_broadcast(:'r3', array[:'SP_ELENI']::uuid[])).fee_paid_at is not null;
select pg_temp.act('postgres');
select pg_temp.check('πριν λήξει δεσμεύει 1', user_reserved_credits(:'CLIENT') = 1);
update booking_requests set expires_at = now() - interval '1 minute' where id = :'r3';
select pg_temp.check('ληγμένο αίτημα δεν δεσμεύει, πριν ακόμα κλείσει', user_reserved_credits(:'CLIENT') = 0);
select expire_stale_booking_requests() >= 1;
select pg_temp.check('έληξε, χωρίς επιστροφή και χωρίς κίνηση',
  (select status = 'expired_unclaimed' from booking_requests where id = :'r3')
  and (select count(*) from wallet_transactions where user_id = :'CLIENT') = :tx0
  and pg_temp.wallet('Μαρία Πελάτη') = 1);
select pg_temp.check('η ειδοποίηση λέει ότι ελευθερώθηκε 1 credit, όχι επιστροφή',
  exists (select 1 from notifications where user_id = :'CLIENT' and kind = 'request_expired'
             and (data ->> 'released')::int = 1 and (data ->> 'refund')::int = 0));

\echo '== δίχτυ: ο πελάτης δεν έχει πια credit τη στιγμή της αποδοχής'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.new_request(22) as r4 \gset
select (pay_and_broadcast(:'r4', array[:'SP_ELENI']::uuid[])).fee_paid_at is not null;
select pg_temp.act('postgres');
-- Αδύνατο από την εφαρμογή· εδώ με απευθείας αλλαγή, για να ελεγχθεί το δίχτυ.
select set_config('platform.trusted', 'true', false);
update users set wallet_balance = 0 where id = :'CLIENT';
insert into wallet_transactions (user_id, type, amount, note) values (:'CLIENT', 'adjustment', -1, 'Τεστ');
select set_config('platform.trusted', '', false);
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.expect(format('select claim_booking_request(%L, %L)', :'r4', :'SP_ELENI'), 'client_cannot_pay');
select pg_temp.act('postgres');
select pg_temp.check('καμία κράτηση, καμία χρέωση του επαγγελματία',
  not exists (select 1 from bookings where booking_request_id = :'r4')
  and (select status = 'open' from booking_requests where id = :'r4'));

\echo '== αιτήματα πριν το 0122: ήδη χρεωμένα, κρατούν την επιστροφή'
select admin_adjust_wallet(:'CLIENT', 5, 'Τεστ') from (select pg_temp.act('authenticated', :'ADMIN')) x;
select pg_temp.act('authenticated', :'CLIENT');
select cancel_booking_request(:'r4');
select pg_temp.new_request(26) as r5 \gset
select pg_temp.new_request(30) as r6 \gset
select pg_temp.act('postgres');
-- Όπως θα τα έβρισκε η μετάβαση: στάλθηκαν και χρεώθηκαν με την αποστολή.
select set_config('platform.trusted', 'true', false);
update booking_requests set fee_paid_at = now(), client_charged_at = now() where id in (:'r5', :'r6');
update users set wallet_balance = wallet_balance - 2 where id = :'CLIENT';
insert into wallet_transactions (user_id, type, amount, related_booking_request_id) values
  (:'CLIENT', 'request_fee', -1, :'r5'), (:'CLIENT', 'request_fee', -1, :'r6');
insert into booking_request_pings (booking_request_id, skipper_id) values (:'r5', :'SP_NIKOS'), (:'r6', :'SP_NIKOS');
select set_config('platform.trusted', '', false);
select pg_temp.wallet('Μαρία Πελάτη') as wl0 \gset
select pg_temp.check('δεν δεσμεύουν τίποτα', user_reserved_credits(:'CLIENT') = 0);
select pg_temp.act('authenticated', :'NIKOS');
select (claim_booking_request(:'r5', :'SP_NIKOS')).id is not null;
select pg_temp.act('postgres');
select pg_temp.check('αποδοχή: ο πελάτης δεν χρεώνεται δεύτερη φορά',
  pg_temp.wallet('Μαρία Πελάτη') = :wl0
  and (select count(*) = 1 from wallet_transactions where related_booking_request_id = :'r5' and type = 'request_fee'));
update booking_requests set expires_at = now() - interval '1 minute' where id = :'r6';
select expire_stale_booking_requests() >= 1;
select pg_temp.check('λήξη: επιστρέφεται, όπως πριν',
  pg_temp.wallet('Μαρία Πελάτη') = :wl0 + 1
  and exists (select 1 from wallet_transactions where related_booking_request_id = :'r6' and type = 'refund_credit' and amount = 1));

\echo '== ο πελάτης δεν δηλώνει μόνος του ότι χρεώθηκε'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role, client_charged_at)
  values (:'CLIENT', current_date + 34, current_date + 35, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', now())
  returning id as r7 \gset
select pg_temp.act('postgres');
select pg_temp.check('client_charged_at αγνοείται στην εισαγωγή',
  (select client_charged_at is null from booking_requests where id = :'r7'));
select pg_temp.act('authenticated', :'CLIENT');
update booking_requests set client_charged_at = now() where id = :'r7';
select pg_temp.act('postgres');
select pg_temp.check('ούτε με απευθείας αλλαγή',
  (select client_charged_at is null from booking_requests where id = :'r7'));

\echo '== όποιος δεν είναι πια διαθέσιμος δεν λαμβάνει το αίτημα· οι υπόλοιποι ναι'
select pg_temp.act('postgres');
delete from availability_windows where skipper_id = :'SP_GIORGOS';
select pg_temp.act('authenticated', :'CLIENT');
select (pay_and_broadcast(:'r7', array[:'SP_GIORGOS', :'SP_ELENI']::uuid[])).fee_paid_at is not null;
select pg_temp.act('postgres');
select pg_temp.check('μόνο η Ελένη το έλαβε',
  (select array_agg(skipper_id) = array[:'SP_ELENI']::uuid[] from booking_request_pings where booking_request_id = :'r7'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.new_request(36) as r8 \gset
select pg_temp.expect(format('select pay_and_broadcast(%L, array[%L]::uuid[])', :'r8', :'SP_GIORGOS'), 'skipper_not_available');

\echo '== αίτημα σε εξέλιξη: μένει στον λογαριασμό'
select save_request_draft('{"roles": ["skipper"], "filters": {"startDate": "2999-01-01", "regionId": "x"}, "selections": {"skipper": {"selected": ["b"]}}}');
select save_request_draft(jsonb_build_object('roles', jsonb_build_array('skipper'),
  'filters', jsonb_build_object('startDate', (current_date + 12)::text), 'selections', '{}'::jsonb));
select pg_temp.check('ένα ανά χρήστη, η τελευταία αποθήκευση μετράει',
  (select count(*) = 1 and bool_and(start_date = current_date + 12) from request_drafts));
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.check('κανείς άλλος δεν το βλέπει', (select count(*) = 0 from request_drafts));
select pg_temp.expect(format($$insert into request_drafts (user_id, payload) values (%L, '{}')$$, :'KOSTAS'), 'permission denied%');
select pg_temp.act('anon');
select pg_temp.expect($$select save_request_draft('{}')$$, 'permission denied%');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect($$select save_request_draft('[1]')$$, 'invalid_draft');
select pg_temp.expect($$select save_request_draft(jsonb_build_object('x', repeat('α', 30000)))$$, 'invalid_draft');
select pg_temp.check('το βλέπει η ίδια', (select count(*) = 1 from request_drafts));
select clear_request_draft();
select pg_temp.check('σβήνεται όταν σταλεί', (select count(*) = 0 from request_drafts));
select save_request_draft(jsonb_build_object('filters', jsonb_build_object('startDate', (current_date - 1)::text)));
select pg_temp.check('για ταξίδι που ξεκίνησε δεν κρατιέται', (select count(*) = 0 from request_drafts));
select save_request_draft(jsonb_build_object('filters', jsonb_build_object('startDate', (current_date + 1)::text)));
select pg_temp.act('postgres');
update request_drafts set start_date = current_date - 1;
select expire_stale_booking_requests() >= 0;
select pg_temp.check('ο νυχτερινός καθαρισμός σβήνει όσα αφορούν ταξίδι που ξεκίνησε', (select count(*) = 0 from request_drafts));
