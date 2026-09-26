-- Πορτοφόλι: πίστωση και διόρθωση υπολοίπου από τον admin.
\i tests/db/helpers.sql

\echo '== πίστωση και διόρθωση'
select pg_temp.act('authenticated', :'ADMIN');
select admin_overview()->>'fees_all_time' as fees0 \gset
select pg_temp.act('postgres');
select pg_temp.wallet('Σοφία Σιωπηλή') as w0 \gset

select pg_temp.act('authenticated', :'ADMIN');
select admin_credit_wallet(:'SOFIA', 1000, 'Τραπεζική κατάθεση');
select pg_temp.check('λάθος πίστωση 1000€ περάστηκε', pg_temp.wallet('Σοφία Σιωπηλή') = :w0 + 1000);

select pg_temp.expect(format('select admin_adjust_wallet(%L, -900, %L)', :'SOFIA', ''), 'reason_required');
select pg_temp.expect(format('select admin_adjust_wallet(%L, 0, %L)', :'SOFIA', 'x'), 'invalid_amount');
select pg_temp.expect(format('select admin_adjust_wallet(%L, %s, %L)', :'SOFIA', -(:w0 + 1001), 'πάρα πολλά'), 'insufficient_wallet');
select pg_temp.check('διόρθωση: αφαίρεση 900€ επιστρέφει το νέο υπόλοιπο',
  admin_adjust_wallet(:'SOFIA', -900, 'Λάθος ποσό: ήταν 100€, όχι 1000€') = :w0 + 100);

select pg_temp.act('authenticated', :'SOFIA');
select pg_temp.expect(format('select admin_adjust_wallet(%L, 500, %L)', :'SOFIA', 'δώρο στον εαυτό μου'), 'not_admin');
select pg_temp.check('ο χρήστης βλέπει τη διόρθωση και τον λόγο στο ιστορικό του', exists (
  select 1 from wallet_transactions where user_id = :'SOFIA' and type = 'adjustment' and amount = -900
    and note like 'Λάθος ποσό%' and created_by = :'ADMIN'));
select pg_temp.check('και την πίστωση με την αιτιολογία της', exists (
  select 1 from wallet_transactions where user_id = :'SOFIA' and type = 'deposit' and note = 'Τραπεζική κατάθεση'));

select pg_temp.act('postgres');
select pg_temp.check('ανώνυμος δεν μπορεί καν να την καλέσει',
  not has_function_privilege('anon', 'admin_adjust_wallet(uuid,numeric,text)', 'EXECUTE'));
select pg_temp.check('η διόρθωση καταγράφεται στις ενέργειες admin', exists (
  select 1 from admin_actions where action_type = 'adjust_wallet' and target_user_id = :'SOFIA' and notes like '%(-900€)'));
select pg_temp.check('ο χρήστης ειδοποιήθηκε για τη διόρθωση', exists (
  select 1 from notifications where user_id = :'SOFIA' and kind = 'wallet' and data->>'txn_type' = 'adjustment'));
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('η διόρθωση δεν μετράει ως έσοδο της πλατφόρμας', admin_overview()->>'fees_all_time' = :'fees0');
