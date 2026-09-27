-- Μετά το 0110: υπόλοιπα σε credits, και ό,τι έμεινε ανοιχτό επιστρέφει σε credits.
\i tests/db/helpers.sql
select pg_temp.act('postgres');
select id as req_a from conv_ids where k = 'req_a' \gset
select id as bk_b from conv_ids where k = 'bk_b' \gset
select id as dr from conv_ids where k = 'dr' \gset
select n::int as notif_before from conv_ids where k = 'notif' \gset
select ceil(n / 50)::int as dr_credits from conv_ids where k = 'dr_fee' \gset
select pg_temp.wallet('Μαρία Πελάτη') as m0 \gset

\echo '== μετατροπή'
select pg_temp.check('κάθε υπόλοιπο = ευρώ / 50, προς τα πάνω', not exists (
  select 1 from users u join conv_before b on b.user_id = u.id
   where u.wallet_balance <> case when b.wallet_balance > 0 then ceil(b.wallet_balance / 50) else 0 end));
select pg_temp.check('π.χ. Πέτρος 140€ → 3 credits, Κώστας 220€ → 5', pg_temp.wallet('Πέτρος Αρνείται') = 3 and pg_temp.wallet('Κώστας Υποψήφιος') = 5);
select pg_temp.check('κανένα δεκαδικό υπόλοιπο', not exists (select 1 from users where wallet_balance <> round(wallet_balance)));
select pg_temp.check('καμία ειδοποίηση από τη μετατροπή', (select count(*) from notifications) = :notif_before);
select pg_temp.check('τέλη ρυθμίσεων: 1 credit', (select bool_and(value = 1) from platform_settings where key in ('client_request_fee', 'skipper_claim_fee')));
select pg_temp.check('καταγεγραμμένα τέλη σε credits', (select fee_amount = 1 from booking_requests where id = :'req_a')
  and (select client_fee = :dr_credits and professional_fee = 1 from delivery_role_requests where delivery_request_id = :'dr'));

\echo '== ανοιχτά πράγματα μετά τη μετατροπή'
update booking_requests set expires_at = now() - interval '1 minute' where id = :'req_a';
select expire_stale_booking_requests() >= 1;
select pg_temp.check('το αίτημα έληξε: επιστροφή 1 credit (όχι 15)', pg_temp.wallet('Μαρία Πελάτη') = :m0 + 1);
select pg_temp.check('και η ειδοποίηση λέει 1', exists (select 1 from notifications where kind = 'request_expired' and (data ->> 'refund')::numeric = 1));

select pg_temp.act('authenticated', :'ADMIN');
select admin_close_replacement_case(:'bk_b', 'Δεν βρέθηκε');
select pg_temp.act('postgres');
select pg_temp.check('υπόθεση αντικατάστασης χωρίς αντικαταστάτη: επιστροφή 1 credit', pg_temp.wallet('Μαρία Πελάτη') = :m0 + 2);

update delivery_role_requests set expires_at = now() - interval '1 minute' where delivery_request_id = :'dr';
select expire_stale_delivery_role_requests() >= 1;
select pg_temp.check('η μεταφορά έληξε: επιστροφή σε credits', pg_temp.wallet('Μαρία Πελάτη') = :m0 + 2 + :dr_credits);
select pg_temp.wallet('Μαρία Πελάτη') as m1 \gset

\echo '== νέα κίνηση μετά τη μετατροπή'
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select pg_temp.wallet('Ελένη Υποψήφια') as e0 \gset
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role)
  values (:'CLIENT', current_date + 30, current_date + 32, :'cyclades', 'Σύρος', 'Σύρος', 'skipper')
  returning id as req_c \gset
select (pay_and_broadcast(:'req_c', array['b0000000-0000-0000-0000-000000000006']::uuid[])).status is not null;
select pg_temp.act('postgres');
select pg_temp.check('νέο αίτημα: 1 credit', pg_temp.wallet('Μαρία Πελάτη') = :m1 - 1);
select pg_temp.act('authenticated', :'ELENI');
select (claim_booking_request(:'req_c', 'b0000000-0000-0000-0000-000000000006')).status;
select pg_temp.act('postgres');
select pg_temp.check('ανάληψη: 1 credit', pg_temp.wallet('Ελένη Υποψήφια') = :e0 - 1);

\echo '== ισοζύγιο'
select pg_temp.check('κάθε υπόλοιπο = κινήσεις σε credits', not exists (
  select 1 from users u where u.wallet_balance <>
    coalesce((select sum(amount) from wallet_transactions t where t.user_id = u.id and t.unit = 'credit'), 0)));
select pg_temp.check('το ιστορικό σε € κλείνει στο μηδέν για όλους', not exists (
  select 1 from wallet_transactions where unit = 'eur' group by user_id having sum(amount) <> 0));
