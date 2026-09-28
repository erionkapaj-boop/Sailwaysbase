-- 0112: ιδιοκτήτης με πλήρη πρόσβαση, υπάλληλος μόνο τα καθημερινά.
-- Ο Νίκος παίζει τον πραγματικό ιδιοκτήτη: επαγγελματίας με is_owner (όπως
-- ο λογαριασμός του ιδιοκτήτη στην παραγωγή). Η Σοφία είναι υπάλληλος.
\i tests/db/helpers.sql
select pg_temp.act('postgres');
select set_config('platform.trusted', 'true', false);
update users set is_owner = true, is_staff_admin = true where id = :'NIKOS';
update users set is_staff_admin = true where id = :'SOFIA';
select set_config('platform.trusted', '', false);
select id as cyclades from regions where name = 'Κυκλάδες' \gset

\echo '== ιδιοκτήτης (επαγγελματίας με is_owner)'
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('είναι διαχειριστής και ιδιοκτήτης', is_admin() and is_owner_admin());
select pg_temp.wallet('Νίκος Αρχικός') as n0 \gset
select admin_record_purchase(:'NIKOS', 5, 200, 'Πακέτο για δοκιμή') = :n0 + 5;
select pg_temp.check('αγορά 5 credits στον δικό του λογαριασμό', pg_temp.wallet('Νίκος Αρχικός') = :n0 + 5);
select admin_credit_wallet(:'NIKOS', 1, 'Δώρο');
select admin_adjust_wallet(:'NIKOS', -1, 'Επαναφορά') = :n0 + 5;
select admin_update_setting('client_request_fee', 1);
select admin_set_staff_admin(:'PETROS', true);
select admin_set_staff_admin(:'PETROS', false);
select admin_set_test_account(:'KOSTAS', true);
select admin_set_test_account(:'KOSTAS', false);
select pg_temp.check('ρυθμίσεις, υπάλληλοι, λογαριασμοί δοκιμών: επιτρέπονται', true);
select pg_temp.expect(format('select admin_set_staff_admin(%L, false)', :'NIKOS'), 'cannot_edit_admin');

\echo '== υπάλληλος: τα καθημερινά ναι'
select pg_temp.act('authenticated', :'SOFIA');
select pg_temp.check('είναι διαχειριστής, όχι ιδιοκτήτης', is_admin() and not is_owner_admin());
select admin_verify_user(:'CLIENT') is null or true;
select count(*) >= 0 from admin_replacement_cases(false);
select admin_update_profile(:'CLIENT', 'Μαρία Πελάτη', null) is null or true;
select pg_temp.check('επαλήθευση, αντικαταστάσεις, διόρθωση στοιχείων απλού χρήστη: επιτρέπονται', true);

\echo '== υπάλληλος: ό,τι δεν είναι δικό του, όχι'
select pg_temp.expect(format('select admin_record_purchase(%L, 5, 200)', :'CLIENT'), 'owner_only');
select pg_temp.expect(format('select admin_record_purchase(%L, 5, 200)', :'SOFIA'), 'owner_only');
select pg_temp.expect(format('select admin_credit_wallet(%L, 5, %L)', :'CLIENT', 'x'), 'owner_only');
select pg_temp.expect(format('select admin_adjust_wallet(%L, -1, %L)', :'CLIENT', 'x'), 'owner_only');
select pg_temp.expect($$select admin_update_setting('client_request_fee', 0)$$, 'owner_only');
select pg_temp.expect(format('select admin_delete_account(%L, %L)', :'CLIENT', 'x'), 'owner_only');
select pg_temp.expect(format('select admin_set_test_account(%L, true)', :'CLIENT'), 'owner_only');
select pg_temp.expect(format('select admin_set_staff_admin(%L, true)', :'CLIENT'), 'owner_only');
select pg_temp.expect(format('select admin_suspend_account(%L, %L)', :'NIKOS', 'x'), 'cannot_suspend_admin');
select pg_temp.expect(format($$select admin_update_profile(%L, 'Άλλο', null)$$, :'NIKOS'), 'cannot_edit_admin');

\echo '== υπάλληλος: ούτε με απευθείας εγγραφή στους πίνακες'
update users set wallet_balance = 999, is_owner = true, role = 'admin' where id = :'SOFIA';
update users set wallet_balance = 999 where id = :'CLIENT';
update platform_settings set value = 0 where key = 'client_request_fee';
update regions set name = 'Χακαρισμένο' where id = :'cyclades';
update skipper_profiles set price_per_day = 1 where user_id = :'NIKOS';
update bookings set status = 'cancelled_by_client';
select pg_temp.act('postgres');
select pg_temp.check('ο υπάλληλος δεν έγινε ιδιοκτήτης ούτε άλλαξε το υπόλοιπό του',
  (select not is_owner and role = 'skipper' and wallet_balance < 999 from users where id = :'SOFIA'));
select pg_temp.check('δεν άλλαξε υπόλοιπο άλλου', (select wallet_balance < 999 from users where id = :'CLIENT'));
select pg_temp.check('ούτε ρυθμίσεις', (select value = 1 from platform_settings where key = 'client_request_fee'));
select pg_temp.check('ούτε περιοχές', (select name = 'Κυκλάδες' from regions where id = :'cyclades'));
select pg_temp.check('ούτε το προφίλ του ιδιοκτήτη', (select price_per_day > 1 from skipper_profiles where user_id = :'NIKOS'));
select pg_temp.check('ούτε κρατήσεις', not exists (select 1 from bookings where status = 'cancelled_by_client'));

\echo '== ο ιδιοκτήτης κρατά την πρόσβαση'
select pg_temp.act('authenticated', :'NIKOS');
update users set full_name = 'Σοφία Σιωπηλή' where id = :'SOFIA';
select pg_temp.act('postgres');
select pg_temp.check('ο ιδιοκτήτης γράφει απευθείας', (select full_name = 'Σοφία Σιωπηλή' from users where id = :'SOFIA'));
select set_config('platform.trusted', 'true', false);
update users set is_owner = false, is_staff_admin = false where id = :'NIKOS';
update users set is_staff_admin = false where id = :'SOFIA';
select set_config('platform.trusted', '', false);
