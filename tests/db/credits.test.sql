-- Credits (0110): packages and prices in settings, purchases recorded by the
-- admin with their € price, the professional's signup credits, a free period
-- for clients, and boat deliveries priced in credits by distance.
\i tests/db/helpers.sql

\set SP_GIORGOS 'b0000000-0000-0000-0000-000000000004'
\set SP_KOSTAS  'b0000000-0000-0000-0000-000000000005'
\set PRONEW     'd1000000-0000-0000-0000-000000000001'

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset
update users set phone_verified_at = now() where id = :'CLIENT';

\echo '== ρυθμίσεις και πακέτα'
select pg_temp.act('anon');
select pg_temp.check('τιμή credit και πακέτα διαβάζονται δημόσια',
  (select count(*) = 7 from platform_settings where key = 'credit_price_eur' or key like 'package\_%'));
select pg_temp.check('αρχικές τιμές: 50€, 2/90€, 5/200€, 10/350€',
  (select string_agg(key || '=' || value::int, ',' order by key) from platform_settings where key = 'credit_price_eur' or key like 'package\_%')
  = 'credit_price_eur=50,package_pro_credits=10,package_pro_price=350,package_professional_credits=5,package_professional_price=200,package_starter_credits=2,package_starter_price=90');
select pg_temp.act('authenticated', :'ADMIN');
select admin_update_setting('package_pro_price', 330);
select pg_temp.expect($$select admin_update_setting('package_pro_credits', 2.5)$$, 'invalid_value');
select pg_temp.expect($$select admin_update_setting('credit_price_eur', 0)$$, 'invalid_value');

\echo '== αγορά από τον διαχειριστή'
select pg_temp.wallet('Μαρία Πελάτη') as w0 \gset
select admin_record_purchase(:'CLIENT', 5, 200, 'Τραπεζική κατάθεση');
select pg_temp.act('postgres');
select pg_temp.check('+5 credits, με το ποσό σε € στην κίνηση',
  pg_temp.wallet('Μαρία Πελάτη') = :w0 + 5
  and exists (select 1 from wallet_transactions where user_id = :'CLIENT' and type = 'purchase' and amount = 5 and price_eur = 200));
select pg_temp.check('η πελάτισσα ειδοποιήθηκε', exists (select 1 from notifications where user_id = :'CLIENT' and kind = 'wallet' and (data ->> 'amount')::int = 5));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select admin_record_purchase(%L, 5, 0)', :'CLIENT'), 'not_admin');

\echo '== δώρο εγγραφής: 2 credits στους επαγγελματίες'
select pg_temp.act('postgres');
insert into auth.users (id, phone) values (:'PRONEW', '306911111111');
insert into users (id, role, full_name, phone_number, status) values (:'PRONEW', 'skipper', 'Νέος Επαγγελματίας', '+306911111111', 'draft');
select pg_temp.check('πριν την επαλήθευση: 0', (select wallet_balance = 0 from users where id = :'PRONEW'));
select pg_temp.act('authenticated', :'ADMIN');
select admin_verify_user(:'PRONEW');
select pg_temp.act('postgres');
select pg_temp.check('με την επαλήθευση: 2 credits', (select wallet_balance = 2 from users where id = :'PRONEW'));

\echo '== δωρεάν περίοδος για πελάτες (τέλος αιτήματος 0)'
update platform_settings set value = 0 where key = 'client_request_fee';
select pg_temp.wallet('Μαρία Πελάτη') as w1 \gset
select count(*) as tx1 from wallet_transactions where user_id = :'CLIENT' \gset
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 20, current_date + 22, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper')
  returning id as req \gset
select (pay_and_broadcast(:'req', array[:'SP_KOSTAS']::uuid[])).fee_paid_at is not null;
select pg_temp.act('postgres');
select pg_temp.check('το αίτημα στάλθηκε χωρίς χρέωση και χωρίς κίνηση',
  pg_temp.wallet('Μαρία Πελάτη') = :w1 and (select count(*) from wallet_transactions where user_id = :'CLIENT') = :tx1);
update platform_settings set value = 1 where key = 'client_request_fee';

\echo '== μεταφορά: τα credits τα υπολογίζει η πλατφόρμα από την απόσταση'
select pg_temp.act('authenticated', :'CLIENT');
-- 2000 μίλια × 4€ × 5% = 400€ προμήθεια − 50€ = 350€ → 7 credits (των 50€)
select (create_delivery_request('Λαύριο', 'Μάλτα', 2000, 'fixed', current_date + 30, 0,
        true, true, false, null, true, false)).id as dr \gset
select pg_temp.act('postgres');
insert into delivery_availability_windows (skipper_id, crew_role, start_date, end_date)
  values (:'SP_GIORGOS', 'skipper', current_date + 1, current_date + 90);
select pg_temp.wallet('Μαρία Πελάτη') as w2 \gset
select pg_temp.act('authenticated', :'CLIENT');
select (create_delivery_role_request(:'dr', 'skipper', 3000, array[:'SP_GIORGOS']::uuid[])).id as rr \gset
select pg_temp.act('postgres');
select pg_temp.check('πελάτης: 7 credits, επαγγελματίας: 1 credit',
  (select client_fee = 7 and professional_fee = 1 from delivery_role_requests where id = :'rr')
  and pg_temp.wallet('Μαρία Πελάτη') = :w2 - 7);

\echo '== δώρο και διόρθωση: μόνο ακέραια credits'
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.expect(format('select admin_credit_wallet(%L, 1.5, %L)', :'CLIENT', 'x'), 'invalid_amount');
select pg_temp.expect(format('select admin_adjust_wallet(%L, -0.5, %L)', :'CLIENT', 'x'), 'invalid_amount');
select pg_temp.check('ο διαχειριστής βλέπει μονάδα και ποσό € στις κινήσεις',
  (select bool_or(e ->> 'unit' = 'credit' and e ->> 'price_eur' is not null)
     from jsonb_array_elements(admin_account_detail(:'CLIENT') -> 'wallet') e));
