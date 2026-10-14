-- Ανοιχτές μεταφορές σκάφους (0126): ο πελάτης αφήνει τη θέση ανοιχτή, οι
-- επαγγελματίες τη διεκδικούν, ο πελάτης διαλέγει. Η διεκδίκηση δεν χρεώνει
-- τίποτα· ο επαγγελματίας χρεώνεται μόνο όταν επιλεγεί. Μετά το τεστ το run.sh
-- ελέγχει ότι κάθε υπόλοιπο ισούται με το άθροισμα των κινήσεών του.
\i tests/db/helpers.sql

\set SP_GIORGOS 'b0000000-0000-0000-0000-000000000004'
\set SP_KOSTAS  'b0000000-0000-0000-0000-000000000005'
\set SP_ELENI   'b0000000-0000-0000-0000-000000000006'
\set SP_PETROS  'b0000000-0000-0000-0000-000000000007'

select pg_temp.act('postgres');
create or replace function pg_temp.dr(p_days int, p_flex int default 0) returns uuid language sql as $$
  select (create_delivery_request('Λαύριο', 'Λευκάδα', 300, case when p_flex > 0 then 'flexible' else 'fixed' end,
          current_date + p_days, p_flex, true, true, false, null, true, false)).id
$$;

-- Υπόλοιπα: πελάτισσα 100 (προεπιλογή), Κώστας 3 (αφαιρούμε 99+...), Πέτρος 0.
select pg_temp.act('authenticated', :'ADMIN');
select admin_adjust_wallet(:'KOSTAS', -99, 'Τεστ');
select admin_adjust_wallet(:'ELENI', -99, 'Τεστ');
select admin_adjust_wallet(:'PETROS', -102, 'Τεστ');
select pg_temp.act('postgres');
select pg_temp.wallet('Κώστας Υποψήφιος') as wk0 \gset
select pg_temp.wallet('Μαρία Πελάτη') as wc0 \gset

\echo '== ανάρτηση: χρεώνεται ο πελάτης όπως σε κάθε μεταφορά, μένει ανοιχτό μέχρι την αναχώρηση'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.dr(30, 2) as d1 \gset
select (create_open_delivery_role_request(:'d1', 'skipper', 900)).id as r1 \gset
select pg_temp.act('postgres');
select client_fee as fee, professional_fee as pfee from delivery_role_requests where id = :'r1' \gset
select pg_temp.check('ο πελάτης χρεώθηκε το τέλος μία φορά, με κίνηση στο ιστορικό',
  pg_temp.wallet('Μαρία Πελάτη') = :wc0 - :fee
  and (select count(*) = 1 and sum(amount) = -:fee from wallet_transactions where related_delivery_role_request_id = :'r1'));
select pg_temp.check('ανοιχτό, χωρίς αποστολή σε κανέναν, λήγει στο τέλος της τελευταίας ημέρας ευελιξίας',
  (select board_open and status = 'open' and expires_at = (current_date + 32 + 1)::timestamptz from delivery_role_requests where id = :'r1')
  and not exists (select 1 from delivery_role_pings where delivery_role_request_id = :'r1'));
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select create_open_delivery_role_request(%L, %L, 100)', :'d1', 'skipper'), 'not_owner');

\echo '== δημόσιος πίνακας'
select pg_temp.act('anon');
select pg_temp.check('ο επισκέπτης βλέπει τη θέση, με τη διαδρομή και την τιμή, χωρίς όνομα πελάτη',
  (select count(*) = 1 and bool_and(offered_price = 900 and origin_point = 'Λαύριο') from delivery_board_requests() where id = :'r1'));
select pg_temp.check('φίλτρο ρόλου', (select count(*) = 0 from delivery_board_requests('deckhand')));
select pg_temp.expect($$select * from delivery_open_claims$$, 'permission denied%');

\echo '== διεκδίκηση: καμία χρέωση, καμία δέσμευση'
select pg_temp.act('authenticated', :'KOSTAS');
select (claim_delivery_board_request(:'r1', :'SP_KOSTAS')).status;
select claim_delivery_board_request(:'r1', :'SP_KOSTAS');
select pg_temp.act('authenticated', :'ELENI');
select (claim_delivery_board_request(:'r1', :'SP_ELENI')).status;
select pg_temp.act('authenticated', :'PETROS');
select pg_temp.expect(format('select claim_delivery_board_request(%L, %L)', :'r1', :'SP_PETROS'), 'insufficient_wallet');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select claim_delivery_board_request(%L, %L)', :'r1', :'SP_ELENI'), 'not_owner');
select pg_temp.act('anon');
select pg_temp.expect(format('select claim_delivery_board_request(%L, %L)', :'r1', :'SP_KOSTAS'), 'permission denied%');
select pg_temp.act('postgres');
select pg_temp.check('2 ενεργές διεκδικήσεις, υπόλοιπα αμετάβλητα',
  (select count(*) = 2 from delivery_open_claims where role_request_id = :'r1' and status = 'active')
  and pg_temp.wallet('Κώστας Υποψήφιος') = :wk0
  and (select count(*) = 1 from wallet_transactions where related_delivery_role_request_id = :'r1'));
select pg_temp.check('ο πελάτης ειδοποιήθηκε',
  (select count(*) = 2 from notifications where user_id = :'CLIENT' and kind = 'delivery_board_claim_received' and data ->> 'request_id' = :'r1'));
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.check('ο Κώστας βλέπει ότι διεκδίκησε', (select claimed_by_me from delivery_board_requests() where id = :'r1'));
select pg_temp.check('οι διεκδικήσεις μου', (select count(*) = 1 and bool_and(state = 'active') from my_delivery_board_claims()));

\echo '== επιλογή: ο επαγγελματίας χρεώνεται, δημιουργείται η μεταφορά'
select pg_temp.act('authenticated', :'CLIENT');
select claim_id as c_k from client_list_delivery_claims(:'r1') where skipper_id = :'SP_KOSTAS' \gset
select claim_id as c_e from client_list_delivery_claims(:'r1') where skipper_id = :'SP_ELENI' \gset
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select client_choose_delivery_claim(%L)', :'c_k'), 'not_owner');
select pg_temp.act('authenticated', :'CLIENT');
select client_choose_delivery_claim(:'c_k') is not null;
select pg_temp.act('postgres');
select pg_temp.check('Κώστας −τέλος επαγγελματία, πελάτισσα καμία νέα χρέωση',
  pg_temp.wallet('Κώστας Υποψήφιος') = :wk0 - :pfee and pg_temp.wallet('Μαρία Πελάτη') = :wc0 - :fee);
select pg_temp.check('μεταφορά επιβεβαιωμένη και θέση filled',
  exists (select 1 from delivery_bookings where delivery_role_request_id = :'r1' and skipper_id = :'SP_KOSTAS' and status = 'confirmed')
  and (select status = 'filled' from delivery_role_requests where id = :'r1'));
select pg_temp.check('η άλλη διεκδίκηση κλείνει, με ειδοποίηση',
  (select status = 'closed' from delivery_open_claims where id = :'c_e')
  and exists (select 1 from notifications where kind = 'delivery_board_claim_closed' and data ->> 'reason' = 'matched' and data ->> 'request_id' = :'r1'));
select pg_temp.check('ο Κώστας ειδοποιήθηκε για την επιλογή',
  exists (select 1 from notifications where user_id = :'KOSTAS' and kind = 'delivery_board_claim_chosen'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select client_choose_delivery_claim(%L)', :'c_e'), 'request_not_open');
select pg_temp.expect(format('select client_choose_delivery_claim(%L)', :'c_k'), 'request_not_open');

\echo '== ακύρωση από τον πελάτη: επιστροφή του τέλους, οι διεκδικήσεις κλείνουν'
select pg_temp.dr(60) as d2 \gset
select (create_open_delivery_role_request(:'d2', 'skipper', 500)).id as r2 \gset
select pg_temp.act('authenticated', :'ELENI');
select claim_delivery_board_request(:'r2', :'SP_ELENI') is not null;
select pg_temp.act('postgres');
select pg_temp.wallet('Μαρία Πελάτη') as wc1 \gset
select pg_temp.act('authenticated', :'CLIENT');
select cancel_delivery_role_request(:'r2');
select pg_temp.act('postgres');
select pg_temp.check('επιστράφηκε το τέλος, η διεκδίκηση έκλεισε με ειδοποίηση',
  pg_temp.wallet('Μαρία Πελάτη') = :wc1 + :fee
  and (select status = 'closed' from delivery_open_claims where role_request_id = :'r2')
  and exists (select 1 from notifications where user_id = :'ELENI' and kind = 'delivery_board_claim_closed' and data ->> 'reason' = 'cancelled'));

\echo '== λήξη: επιστροφή, κλείσιμο διεκδικήσεων'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.dr(70) as d3 \gset
select (create_open_delivery_role_request(:'d3', 'skipper', 500)).id as r3 \gset
select pg_temp.act('authenticated', :'ELENI');
select claim_delivery_board_request(:'r3', :'SP_ELENI') is not null;
select pg_temp.act('postgres');
select pg_temp.wallet('Μαρία Πελάτη') as wc2 \gset
update delivery_role_requests set expires_at = now() - interval '1 minute' where id = :'r3';
select expire_stale_delivery_role_requests() >= 1;
select pg_temp.check('έληξε, επιστράφηκε το τέλος, η διεκδίκηση έκλεισε',
  (select status = 'expired' from delivery_role_requests where id = :'r3')
  and pg_temp.wallet('Μαρία Πελάτη') = :wc2 + :fee
  and (select status = 'closed' from delivery_open_claims where role_request_id = :'r3'));
select pg_temp.act('anon');
select pg_temp.check('δεν φαίνεται πια στον πίνακα', (select count(*) = 0 from delivery_board_requests() where id in (:'r2', :'r3')));

\echo '== επικάλυψη: επαγγελματίας με επιβεβαιωμένη μεταφορά στις ίδιες ημέρες δεν διεκδικεί'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.dr(31) as d4 \gset
select (create_open_delivery_role_request(:'d4', 'skipper', 500)).id as r4 \gset
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select claim_delivery_board_request(%L, %L)', :'r4', :'SP_KOSTAS'), 'date_overlap');

\echo '== ένα credit επαγγελματία, δύο διεκδικήσεις: η δεύτερη περιμένει credit και ξαναζωντανεύει'
select pg_temp.act('postgres');
select pg_temp.wallet('Γιώργος Υποψήφιος') - :pfee as gcut \gset
select pg_temp.act('authenticated', :'ADMIN');
select admin_adjust_wallet(:'GIORGOS', -:gcut, 'Τεστ');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.dr(100) as d5 \gset
select pg_temp.dr(110) as d6 \gset
select (create_open_delivery_role_request(:'d5', 'skipper', 500)).id as r5 \gset
select (create_open_delivery_role_request(:'d6', 'skipper', 500)).id as r6 \gset
select pg_temp.act('authenticated', :'GIORGOS');
select claim_delivery_board_request(:'r5', :'SP_GIORGOS') is not null;
select claim_delivery_board_request(:'r6', :'SP_GIORGOS') is not null;
select pg_temp.act('authenticated', :'CLIENT');
select claim_id as c5 from client_list_delivery_claims(:'r5') \gset
select claim_id as c6 from client_list_delivery_claims(:'r6') \gset
select client_choose_delivery_claim(:'c5') is not null;
select pg_temp.check('η δεύτερη δεν εμφανίζεται (δεν υπάρχει credit)', (select count(*) = 0 from client_list_delivery_claims(:'r6')));
select pg_temp.expect(format('select client_choose_delivery_claim(%L)', :'c6'), 'claimant_cannot_pay');
select pg_temp.act('authenticated', :'GIORGOS');
select pg_temp.check('ο επαγγελματίας βλέπει ότι χρειάζεται credit', (select needs_credit from my_delivery_board_claims() where role_request_id = :'r6'));
select pg_temp.act('authenticated', :'ADMIN');
select admin_adjust_wallet(:'GIORGOS', :pfee, 'Τεστ αγορά');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('μετά την αγορά ξαναζωντανεύει', (select count(*) = 1 from client_list_delivery_claims(:'r6')));
select client_choose_delivery_claim(:'c6') is not null;
select pg_temp.act('postgres');
select pg_temp.check('Γιώργος 0, δύο μεταφορές, κανένα αρνητικό υπόλοιπο',
  pg_temp.wallet('Γιώργος Υποψήφιος') = 0 and (select count(*) = 2 from delivery_bookings where skipper_id = :'SP_GIORGOS'));
