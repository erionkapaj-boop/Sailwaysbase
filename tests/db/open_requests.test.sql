-- Ανοιχτά αιτήματα (0124): ο πελάτης αφήνει αίτημα, οι επαγγελματίες το
-- διεκδικούν, ο πελάτης διαλέγει. Στόχος: κανένα credit δεν χάνεται και
-- κανένα δεν δημιουργείται. Μετά από κάθε τεστ το run.sh ελέγχει ότι κάθε
-- υπόλοιπο ισούται με το άθροισμα των κινήσεών του.
\i tests/db/helpers.sql

\set SP_GIORGOS 'b0000000-0000-0000-0000-000000000004'
\set SP_KOSTAS  'b0000000-0000-0000-0000-000000000005'
\set SP_ELENI   'b0000000-0000-0000-0000-000000000006'
\set SP_PETROS  'b0000000-0000-0000-0000-000000000007'

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset

create or replace function pg_temp.post(p_start int, p_role crew_role default 'skipper') returns uuid language sql as $$
  select (post_open_request(current_date + p_start, current_date + p_start + 2,
          (select id from regions where name = 'Κυκλάδες'), 'Νάξος', 'Νάξος',
          (select id from boat_types where name = 'Ιστιοπλοϊκό'), p_role, 4, true, 'Σημείωση')).id
$$;

-- Αρχικά υπόλοιπα: πελάτισσα 6, Κώστας 1, Ελένη 1, Γιώργος 1, Πέτρος 0.
select pg_temp.act('authenticated', :'ADMIN');
select admin_adjust_wallet(:'CLIENT', -94, 'Τεστ');
select admin_adjust_wallet(:'KOSTAS', -101, 'Τεστ');
select admin_adjust_wallet(:'ELENI', -101, 'Τεστ');
select admin_adjust_wallet(:'GIORGOS', -101, 'Τεστ');
select admin_adjust_wallet(:'PETROS', -102, 'Τεστ');

\echo '== ανάρτηση: δέσμευση 1 credit, καμία κίνηση'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.post(10) as r1 \gset
select pg_temp.act('postgres');
select pg_temp.check('το υπόλοιπο μένει 6, καμία κίνηση για το αίτημα',
  pg_temp.wallet('Μαρία Πελάτη') = 6
  and not exists (select 1 from wallet_transactions where related_booking_request_id = :'r1'));
select pg_temp.check('δεσμεύεται 1 credit και το αίτημα είναι στον πίνακα',
  user_reserved_credits(:'CLIENT') = 1
  and (select board_open and fee_paid_at is not null and client_charged_at is null from booking_requests where id = :'r1'));
select pg_temp.check('λήγει στο τέλος της ημέρας έναρξης (ανοιχτό μέχρι την αναχώρηση)',
  (select expires_at = (start_date + 1)::timestamptz from booking_requests where id = :'r1'));
select pg_temp.act('authenticated', :'CLIENT');
select (post_open_request(current_date + 40, current_date + 42, :'cyclades', 'Πάρος', 'Πάρος', null, 'hostess', 2, null, null)).id as r_noboat \gset
select pg_temp.act('postgres');
select pg_temp.check('χωρίς τύπο σκάφους (hostess) δεκτό, ανοιχτό μέχρι την έναρξη (40 ημέρες)',
  (select board_open and boat_type_id is null and expires_at = (start_date + 1)::timestamptz from booking_requests where id = :'r_noboat'));
delete from booking_requests where id = :'r_noboat';

\echo '== ο πελάτης δεν στήνει αίτημα πίνακα με απευθείας εισαγωγή'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role, board_open, board_posted_at)
  values (:'CLIENT', current_date + 20, current_date + 21, :'cyclades', 'Πάρος', 'Πάρος', 'skipper', true, now())
  returning id as direct_id \gset
select pg_temp.act('postgres');
select pg_temp.check('το board_open μηδενίζεται', (select not board_open and board_posted_at is null from booking_requests where id = :'direct_id'));
delete from booking_requests where id = :'direct_id';

\echo '== όρια ανάρτησης'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect($$select pg_temp.post(-1)$$, 'start_in_past');
select pg_temp.expect(format('select post_open_request(current_date+1, current_date, %L, null, null, %L, %L, 1, null, null)', :'cyclades', :'sailboat', 'skipper'), 'invalid_dates');
select pg_temp.act('anon');
select pg_temp.expect($$select pg_temp.post(10)$$, 'permission denied%');

\echo '== δημόσιος πίνακας: ανώνυμα, με φίλτρο ρόλου και σελίδες'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.post(12, 'hostess') as r_host \gset
select pg_temp.post(14) as r_third \gset
select pg_temp.act('anon');
select pg_temp.check('ο επισκέπτης βλέπει 3 αιτήματα, κοντινότερο πρώτο',
  (select count(*) = 3 and (array_agg(id order by start_date, id))[1] = :'r1' from board_requests()));
select pg_temp.check('φίλτρο ρόλου', (select count(*) = 1 and bool_and(crew_role = 'hostess') from board_requests('hostess')));
select pg_temp.check('σελιδοποίηση με δείκτη',
  (select count(*) = 1 from board_requests(null, (select start_date from booking_requests where id = :'r_host'), :'r_host', 20)
    where id = :'r_third'));
select pg_temp.check('ο επισκέπτης δεν βλέπει όνομα πελάτη ούτε τηλέφωνο',
  not exists (select 1 from information_schema.columns where table_name = 'board_requests'));
select pg_temp.expect($$select * from open_request_claims$$, 'permission denied%');

\echo '== διεκδίκηση: καμία δέσμευση, καμία χρέωση'
select pg_temp.act('authenticated', :'KOSTAS');
select (claim_board_request(:'r1', :'SP_KOSTAS')).status;
select claim_board_request(:'r1', :'SP_KOSTAS');
select pg_temp.act('authenticated', :'ELENI');
select (claim_board_request(:'r1', :'SP_ELENI')).status;
select pg_temp.act('authenticated', :'GIORGOS');
select (claim_board_request(:'r1', :'SP_GIORGOS')).status;
select pg_temp.act('postgres');
select pg_temp.check('μία ενεργή διεκδίκηση ανά επαγγελματία',
  (select count(*) = 3 from open_request_claims where request_id = :'r1' and status = 'active'));
select pg_temp.check('υπόλοιπα αμετάβλητα (1,1,1) και καμία δέσμευση επαγγελματία',
  pg_temp.wallet('Κώστας Υποψήφιος') = 1 and pg_temp.wallet('Ελένη Υποψήφια') = 1 and pg_temp.wallet('Γιώργος Υποψήφιος') = 1
  and user_reserved_credits(:'KOSTAS') = 0
  and not exists (select 1 from wallet_transactions where related_booking_request_id = :'r1'));
select pg_temp.check('ο πελάτης ειδοποιήθηκε',
  (select count(*) = 3 from notifications where user_id = :'CLIENT' and kind = 'board_claim_received' and data ->> 'request_id' = :'r1'));
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.check('ο επαγγελματίας βλέπει ότι διεκδίκησε', (select claimed_by_me from board_requests() where id = :'r1'));
select pg_temp.check('οι διεκδικήσεις μου', (select count(*) = 1 and bool_and(state = 'active') and not bool_or(coalesce(needs_credit, false)) from my_board_claims()));

\echo '== όρια διεκδίκησης'
select pg_temp.act('authenticated', :'PETROS');
select pg_temp.expect(format('select claim_board_request(%L, %L)', :'r1', :'SP_PETROS'), 'insufficient_wallet');
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.expect(format('select claim_board_request(%L, %L)', :'r_host', 'b0000000-0000-0000-0000-000000000003'), 'skipper_not_eligible');
select pg_temp.expect(format('select claim_board_request(%L, %L)', :'r1', :'SP_KOSTAS'), 'not_owner');
select pg_temp.act('anon');
select pg_temp.expect(format('select claim_board_request(%L, %L)', :'r1', :'SP_KOSTAS'), 'permission denied%');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select claim_board_request(%L, %L)', :'r1', :'SP_KOSTAS'), 'not_owner');
select pg_temp.act('postgres');
update platform_settings set value = 3 where key = 'board_max_claims';
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.expect(format('select claim_board_request(%L, %L)', :'r1', 'b0000000-0000-0000-0000-000000000003'), 'too_many_claims');
select pg_temp.act('postgres');
update platform_settings set value = 10 where key = 'board_max_claims';

\echo '== απόσυρση και νέα διεκδίκηση'
select pg_temp.act('authenticated', :'GIORGOS');
select withdraw_board_claim(:'r1', :'SP_GIORGOS');
select pg_temp.act('postgres');
select pg_temp.check('αποσύρθηκε', (select status = 'withdrawn' from open_request_claims where request_id = :'r1' and skipper_id = :'SP_GIORGOS'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('ο πελάτης βλέπει 2', (select count(*) = 2 from client_list_board_claims(:'r1')));
select pg_temp.act('authenticated', :'GIORGOS');
select (claim_board_request(:'r1', :'SP_GIORGOS')).status;
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('ξανά 3', (select count(*) = 3 from client_list_board_claims(:'r1')));
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.check('άλλος δεν βλέπει τους διεκδικητές', (select count(*) = 0 from client_list_board_claims(:'r1')));

\echo '== ένα credit, πολλές διεκδικήσεις: ο Κώστας διεκδικεί και δεύτερο αίτημα'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.post(16) as r2 \gset
select pg_temp.act('authenticated', :'KOSTAS');
select (claim_board_request(:'r2', :'SP_KOSTAS')).status;
select pg_temp.act('postgres');
select pg_temp.check('ο Κώστας έχει 2 ενεργές διεκδικήσεις με 1 credit',
  (select count(*) = 2 from open_request_claims where skipper_id = :'SP_KOSTAS' and status = 'active') and pg_temp.wallet('Κώστας Υποψήφιος') = 1);

\echo '== επιλογή: χρεώνονται και οι δύο, μία φορά'
select pg_temp.wallet('Μαρία Πελάτη') as wc0 \gset
select pg_temp.act('authenticated', :'CLIENT');
select claim_id as c_kostas1 from client_list_board_claims(:'r1') where skipper_id = :'SP_KOSTAS' \gset
select claim_id as c_elen1 from client_list_board_claims(:'r1') where skipper_id = :'SP_ELENI' \gset
select claim_id as c_kostas2 from client_list_board_claims(:'r2') where skipper_id = :'SP_KOSTAS' \gset
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.expect(format('select client_choose_board_claim(%L)', :'c_elen1'), 'not_owner');
select pg_temp.act('authenticated', :'CLIENT');
select (client_choose_board_claim(:'c_kostas1') ->> 'external') = 'false';
select pg_temp.act('postgres');
select pg_temp.check('πελάτισσα −1, Κώστας −1 (0 τώρα)',
  pg_temp.wallet('Μαρία Πελάτη') = :wc0 - 1 and pg_temp.wallet('Κώστας Υποψήφιος') = 0);
select pg_temp.check('κίνηση και για τους δύο, δεμένη με την κράτηση',
  (select count(*) = 1 from wallet_transactions t join bookings b on b.id = t.related_booking_id
    where t.user_id = :'CLIENT' and t.type = 'request_fee' and t.related_booking_request_id = :'r1' and b.skipper_id = :'SP_KOSTAS')
  and (select count(*) = 1 from wallet_transactions t join bookings b on b.id = t.related_booking_id
    where t.user_id = :'KOSTAS' and t.type = 'claim_fee' and t.related_booking_request_id = :'r1'));
select pg_temp.check('κράτηση επιβεβαιωμένη, αίτημα matched, διεκδίκηση chosen',
  (select status = 'confirmed' from bookings where booking_request_id = :'r1')
  and (select status = 'matched' and client_charged_at is not null from booking_requests where id = :'r1')
  and (select status = 'chosen' from open_request_claims where id = :'c_kostas1'));
select pg_temp.check('οι υπόλοιπες κλείνουν, με ειδοποίηση',
  (select count(*) = 2 from open_request_claims where request_id = :'r1' and status = 'closed')
  and (select count(*) = 2 from notifications where kind = 'board_claim_closed' and data ->> 'request_id' = :'r1' and data ->> 'reason' = 'matched'));
select pg_temp.check('ο Κώστας ειδοποιήθηκε για την επιλογή και ότι χρειάζεται credit για το άλλο αίτημα',
  exists (select 1 from notifications where user_id = :'KOSTAS' and kind = 'board_claim_chosen' and data ->> 'request_id' = :'r1')
  and exists (select 1 from notifications where user_id = :'KOSTAS' and kind = 'board_claims_need_credit'));
select pg_temp.check('η δέσμευση του αιτήματος φεύγει (μένουν τα άλλα 3)', user_reserved_credits(:'CLIENT') = 3);

\echo '== δεύτερη επιλογή του ίδιου αιτήματος: αδύνατη'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select client_choose_board_claim(%L)', :'c_elen1'), 'request_not_open');
select pg_temp.expect(format('select client_choose_board_claim(%L)', :'c_kostas1'), 'request_not_open');

\echo '== ο Κώστας χωρίς credit: η διεκδίκηση δεν επιλέγεται, δεν ξαναδιεκδικεί'
select pg_temp.check('δεν εμφανίζεται στη λίστα του πελάτη', (select count(*) = 0 from client_list_board_claims(:'r2')));
select pg_temp.expect(format('select client_choose_board_claim(%L)', :'c_kostas2'), 'claimant_cannot_pay');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.check('βλέπει ότι χρειάζεται credit', (select needs_credit from my_board_claims() where request_id = :'r2'));
select pg_temp.act('postgres');
select pg_temp.check('κανείς δεν χρεώθηκε', pg_temp.wallet('Κώστας Υποψήφιος') = 0 and not exists (select 1 from bookings where booking_request_id = :'r2'));

\echo '== αγορά credit: η διεκδίκηση ξαναζωντανεύει χωρίς καμία ενέργεια'
select pg_temp.act('authenticated', :'ADMIN');
select admin_adjust_wallet(:'KOSTAS', 1, 'Τεστ αγορά');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('ξανά στη λίστα', (select count(*) = 1 from client_list_board_claims(:'r2')));
select (client_choose_board_claim(:'c_kostas2') ->> 'external') = 'false';
select pg_temp.act('postgres');
select pg_temp.check('Κώστας 0 ξανά, πελάτισσα −1 ακόμα, αίτημα matched',
  pg_temp.wallet('Κώστας Υποψήφιος') = 0 and pg_temp.wallet('Μαρία Πελάτη') = :wc0 - 2
  and (select status = 'matched' from booking_requests where id = :'r2'));

\echo '== ακύρωση από τον πελάτη: τίποτα δεν χρεώνεται, οι διεκδικήσεις κλείνουν'
select pg_temp.act('authenticated', :'ELENI');
select (claim_board_request(:'r_third', :'SP_ELENI')).status;
select pg_temp.act('postgres');
select count(*) as tx0 from wallet_transactions \gset
select pg_temp.act('authenticated', :'CLIENT');
select cancel_booking_request(:'r_third');
select pg_temp.act('postgres');
select pg_temp.check('καμία κίνηση, η διεκδίκηση έκλεισε με ειδοποίηση',
  (select count(*) from wallet_transactions) = :tx0
  and (select status = 'closed' from open_request_claims where request_id = :'r_third')
  and exists (select 1 from notifications where user_id = :'ELENI' and kind = 'board_claim_closed' and data ->> 'reason' = 'cancelled'));
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.expect(format('select claim_board_request(%L, %L)', :'r_third', :'SP_ELENI'), 'request_not_open');
select pg_temp.act('anon');
select pg_temp.check('φεύγει από τον πίνακα', (select count(*) = 1 from board_requests()));  -- μόνο το hostess

\echo '== λήξη: κλείνει χωρίς χρέωση, ελευθερώνει τη δέσμευση'
select pg_temp.act('postgres');
select (select count(*) from wallet_transactions) as tx1 \gset
update booking_requests set expires_at = now() - interval '1 minute' where id = :'r_host';
select pg_temp.check('ληγμένο δεν δεσμεύει', user_reserved_credits(:'CLIENT') = 0);
select expire_stale_booking_requests() >= 1;
select pg_temp.check('έληξε, καμία κίνηση',
  (select status = 'expired_unclaimed' from booking_requests where id = :'r_host')
  and (select count(*) from wallet_transactions) = :tx1);
select pg_temp.act('anon');
select pg_temp.check('ο πίνακας άδειος', (select count(*) = 0 from board_requests()));

\echo '== εξωτερικός υποψήφιος: χρεώνεται μόνο ο πελάτης'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.post(18) as r4 \gset
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select admin_add_board_external(%L, %L, %L)', :'r4', 'Φίλος', '+306911111111'), 'not_admin');
select pg_temp.act('authenticated', :'ADMIN');
select (admin_add_board_external(:'r4', 'Δημήτρης Φίλος', '+306911111111', 'Έμπειρος')).status;
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('ο πελάτης βλέπει μόνο την σημείωση, όχι όνομα ή τηλέφωνο',
  (select count(*) = 1 and bool_and(is_external) and bool_and(external_note = 'Έμπειρος') from client_list_board_claims(:'r4'))
  and not exists (select 1 from client_board_external_contact(:'r4')));
select claim_id as c_ext from client_list_board_claims(:'r4') \gset
select pg_temp.wallet('Μαρία Πελάτη') as wc1 \gset
select (client_choose_board_claim(:'c_ext') ->> 'external') = 'true';
select pg_temp.check('μετά την επιλογή φαίνονται όνομα και τηλέφωνο',
  (select name = 'Δημήτρης Φίλος' and phone = '+306911111111' from client_board_external_contact(:'r4')));
select pg_temp.act('postgres');
select pg_temp.check('χρεώθηκε μόνο ο πελάτης, 1 credit, χωρίς κράτηση',
  pg_temp.wallet('Μαρία Πελάτη') = :wc1 - 1
  and not exists (select 1 from bookings where booking_request_id = :'r4')
  and (select count(*) = 1 from wallet_transactions where related_booking_request_id = :'r4' and type = 'request_fee')
  and not exists (select 1 from wallet_transactions where related_booking_request_id = :'r4' and type = 'claim_fee'));
select pg_temp.check('το τέλος που δεν εισπράχθηκε γράφεται χωριστά',
  (select uncollected_fee = 1 from open_request_claims where id = :'c_ext'));
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('η διαχείριση το βλέπει στην επισκόπηση',
  (select (claims -> 0 ->> 'uncollected_fee')::numeric = 1 and claims -> 0 ->> 'name' = 'Δημήτρης Φίλος' from admin_board_overview() where request_id = :'r4'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select * from admin_board_overview()'), 'not_admin');

\echo '== δίχτυ: ο πελάτης δεν έχει πια credit τη στιγμή της επιλογής'
select pg_temp.act('authenticated', :'ADMIN');
select admin_adjust_wallet(:'CLIENT', 5, 'Τεστ');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.post(22) as r5 \gset
select pg_temp.act('authenticated', :'ELENI');
select claim_board_request(:'r5', :'SP_ELENI') is not null;
select pg_temp.act('postgres');
select set_config('platform.trusted', 'true', false);
update users set wallet_balance = 0 where id = :'CLIENT';
insert into wallet_transactions (user_id, type, amount, note) select :'CLIENT', 'adjustment', -(select coalesce(sum(amount), 0) from wallet_transactions where user_id = :'CLIENT'), 'Τεστ';
select set_config('platform.trusted', '', false);
select pg_temp.act('authenticated', :'CLIENT');
select claim_id as c_el5 from client_list_board_claims(:'r5') \gset
select pg_temp.expect(format('select client_choose_board_claim(%L)', :'c_el5'), 'client_cannot_pay');
select pg_temp.act('postgres');
select pg_temp.check('τίποτα δεν χρεώθηκε',
  not exists (select 1 from bookings where booking_request_id = :'r5') and pg_temp.wallet('Ελένη Υποψήφια') = 1);

\echo '== επικάλυψη: επαγγελματίας με κράτηση στις ίδιες ημέρες δεν διεκδικεί'
select pg_temp.act('authenticated', :'ADMIN');
select admin_adjust_wallet(:'CLIENT', 5, 'Τεστ');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.post(16) as r6 \gset
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select claim_board_request(%L, %L)', :'r6', :'SP_KOSTAS'), 'date_overlap');
