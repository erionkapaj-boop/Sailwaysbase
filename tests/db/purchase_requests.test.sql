-- 0113: αιτήματα αγοράς credits.
\i tests/db/helpers.sql
select pg_temp.act('postgres');
select pg_temp.wallet('Μαρία Πελάτη') as m0 \gset
select count(*) as notif0 from notifications where user_id = :'ADMIN' and kind = 'admin_credit_purchase' \gset

\echo '== ο χρήστης στέλνει αίτημα: η τιμή έρχεται από τις Ρυθμίσεις'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect($$select request_credit_purchase('mega')$$, 'invalid_package');
select pg_temp.expect($$select request_credit_purchase('custom', 0)$$, 'invalid_amount');
select id as r1, reference as ref1 from request_credit_purchase('professional') \gset
select pg_temp.check('Professional: 5 credits, 200€, κωδικός CR-',
  (select credits = 5 and price_eur = 200 and status = 'pending' and reference ~ '^CR-[0-9A-F]{6}$' from credit_purchase_requests where id = :'r1'));
select pg_temp.check('το υπόλοιπο δεν αλλάζει ακόμα', pg_temp.wallet('Μαρία Πελάτη') = :m0);
select pg_temp.expect($$select request_credit_purchase('starter')$$, 'purchase_request_pending');
select pg_temp.check('βλέπει μόνο τα δικά του αιτήματα', (select count(*) = 1 from credit_purchase_requests));
select pg_temp.expect($$insert into credit_purchase_requests (user_id, reference, credits, price_eur) values (auth.uid(), 'CR-FAKE01', 100, 0)$$, 'permission denied%');
select pg_temp.expect(format($$update credit_purchase_requests set price_eur = 1 where id = %L$$, :'r1'), 'permission denied%');
select pg_temp.expect(format('select admin_complete_credit_purchase(%L)', :'r1'), 'not_admin');

select pg_temp.act('postgres');
select pg_temp.check('ο ιδιοκτήτης ειδοποιήθηκε', (select count(*) from notifications where user_id = :'ADMIN' and kind = 'admin_credit_purchase') = :notif0 + 1);
select pg_temp.check('ο υπάλληλος όχι', not exists (select 1 from notifications where kind = 'admin_credit_purchase' and user_id <> :'ADMIN'));

\echo '== ο υπάλληλος δεν επιβεβαιώνει'
update users set is_staff_admin = true where id = :'SOFIA';
select pg_temp.act('authenticated', :'SOFIA');
select pg_temp.expect(format('select admin_complete_credit_purchase(%L)', :'r1'), 'owner_only');
select pg_temp.expect('select * from admin_list_credit_purchases()', 'owner_only');
select pg_temp.check('ούτε βλέπει τα αιτήματα άλλων', (select count(*) = 0 from credit_purchase_requests));
select pg_temp.act('postgres');
update users set is_staff_admin = false where id = :'SOFIA';

\echo '== ο ιδιοκτήτης επιβεβαιώνει: πίστωση μία φορά'
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('στη λίστα του ιδιοκτήτη', exists (select 1 from admin_list_credit_purchases() where id = :'r1' and full_name = 'Μαρία Πελάτη'));
select pg_temp.check('και στον μετρητή', (admin_overview() ->> 'credit_purchases_pending')::int = 1);
select admin_complete_credit_purchase(:'r1') = :m0 + 5;
select pg_temp.expect(format('select admin_complete_credit_purchase(%L)', :'r1'), 'request_not_pending');
select pg_temp.act('postgres');
select pg_temp.check('+5 credits, αγορά με 200€ και τον κωδικό', pg_temp.wallet('Μαρία Πελάτη') = :m0 + 5
  and exists (select 1 from wallet_transactions where user_id = :'CLIENT' and type = 'purchase' and amount = 5 and price_eur = 200 and note = :'ref1'));
select pg_temp.check('ο χρήστης ειδοποιήθηκε για την αγορά', exists (
  select 1 from notifications where user_id = :'CLIENT' and kind = 'wallet' and data ->> 'txn_type' = 'purchase'));

\echo '== ακύρωση από τον χρήστη και απόρριψη από τον ιδιοκτήτη'
select pg_temp.act('authenticated', :'CLIENT');
select id as r2 from request_credit_purchase('custom', 3) \gset
select pg_temp.check('3 credits × 50€ = 150€', (select price_eur = 150 from credit_purchase_requests where id = :'r2'));
select cancel_credit_purchase_request(:'r2');
select pg_temp.expect(format('select cancel_credit_purchase_request(%L)', :'r2'), 'request_not_pending');
select id as r3 from request_credit_purchase('starter') \gset
select pg_temp.act('authenticated', :'ADMIN');
select admin_cancel_credit_purchase(:'r3');
select pg_temp.act('postgres');
select pg_temp.check('καμία πίστωση από ακυρωμένα', pg_temp.wallet('Μαρία Πελάτη') = :m0 + 5);
select pg_temp.check('ο χρήστης ενημερώθηκε για την απόρριψη', exists (
  select 1 from notifications where user_id = :'CLIENT' and kind = 'credit_purchase_cancelled'));
