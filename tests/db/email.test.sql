-- Email notifications: which ones leave, which don't, and that the email
-- address — also a way back into the account — only changes through the PIN.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
select set_config('platform.trusted', 'true', false);
update users set email = 'maria@example.com' where id = :'CLIENT';
update users set email = 'nikos@example.com' where id = :'NIKOS';
update users set email = 'giorgos@example.com', email_notifications = false where id = :'GIORGOS';
update users set email = null where id = :'KOSTAS';
select set_config('platform.trusted', '', false);

-- notify_user writes the rows; backdate them past the 2-minute grace period.
select notify_user(:'CLIENT', 'booking_confirmed', '{"port":"Σύρος"}'::jsonb, '/platform/bookings');
select notify_user(:'CLIENT', 'review_prompt', '{}'::jsonb, '/platform/bookings');
select notify_user(:'CLIENT', 'wallet', '{"amount":-15}'::jsonb, '/platform/wallet');
select notify_user(:'NIKOS', 'request_received', '{}'::jsonb, '/platform/requests');
select notify_user(:'GIORGOS', 'request_received', '{}'::jsonb, '/platform/requests');
select notify_user(:'KOSTAS', 'request_received', '{}'::jsonb, '/platform/requests');
select notify_user(:'NIKOS', 'offer_received', '{}'::jsonb, '/platform/requests');
update notifications set created_at = now() - interval '5 minutes' where email_status is null;
update notifications set read_at = now() where user_id = :'NIKOS' and kind = 'offer_received';
select notify_user(:'ELENI', 'request_received', '{}'::jsonb, '/platform/requests');
update notifications set created_at = now() - interval '3 days' where user_id = :'ELENI';
select notify_user(:'CLIENT', 'booking_cancelled', '{}'::jsonb, '/platform/bookings');  -- just now

\echo '== ποιες φεύγουν'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect($$select claim_notification_emails(array['booking_confirmed'])$$, 'permission denied%');

select pg_temp.act('service_role');
create temp table claimed as
  select * from claim_notification_emails(array['booking_confirmed', 'review_prompt', 'request_received', 'offer_received', 'booking_cancelled']);
select pg_temp.check('στέλνονται: 2 της Μαρίας και 1 του Νίκου', (select count(*) = 3 from claimed)
  and (select count(*) = 2 from claimed where email = 'maria@example.com')
  and exists (select 1 from claimed where email = 'nikos@example.com' and kind = 'request_received'));
select pg_temp.act('postgres');
select pg_temp.check('η κίνηση πορτοφολιού δεν στέλνεται', exists (
  select 1 from notifications where user_id = :'CLIENT' and kind = 'wallet' and email_status = 'not_emailed'));
select pg_temp.check('ό,τι είδε ήδη στην εφαρμογή δεν στέλνεται', exists (
  select 1 from notifications where user_id = :'NIKOS' and kind = 'offer_received' and email_status = 'read_in_app'));
select pg_temp.check('όποιος τα έκλεισε δεν παίρνει', exists (
  select 1 from notifications where user_id = :'GIORGOS' and email_status = 'opted_out'));
select pg_temp.check('χωρίς email: τίποτα', exists (
  select 1 from notifications where user_id = :'KOSTAS' and email_status = 'no_email'));
select pg_temp.check('πάνω από 2 μέρες: δεν στέλνεται', exists (
  select 1 from notifications where user_id = :'ELENI' and email_status = 'too_old'));
select pg_temp.check('η πιο πρόσφατη περιμένει λίγο (μήπως τη δει στην εφαρμογή)', exists (
  select 1 from notifications where user_id = :'CLIENT' and kind = 'booking_cancelled' and email_status is null));

select pg_temp.act('service_role');
select pg_temp.check('δεύτερη εκτέλεση: τίποτα διπλό',
  not exists (select 1 from claim_notification_emails(array['booking_confirmed', 'review_prompt', 'request_received'])));
select mark_notification_emails(array(select id from claimed), 'sent');
select pg_temp.act('postgres');
select pg_temp.check('σημειώθηκαν ως σταλμένες', (select count(*) = 3 from notifications where email_status = 'sent'));

\echo '== αποτυχία αποστολής: ξαναδοκιμάζεται'
update notifications set email_status = 'sending', emailed_at = now() - interval '31 minutes'
 where id = (select id from claimed where email = 'nikos@example.com');
select pg_temp.act('service_role');
select pg_temp.check('ξαναπαίρνεται μετά από 30 λεπτά', exists (
  select 1 from claim_notification_emails(array['request_received']) where email = 'nikos@example.com'));

\echo '== το email αλλάζει μόνο με τον κωδικό'
select pg_temp.act('authenticated', :'CLIENT');
update users set email = 'attacker@example.com', email_notifications = false where id = :'CLIENT';
select pg_temp.act('postgres');
select pg_temp.check('απευθείας αλλαγή email αγνοείται', (select email = 'maria@example.com' from users where id = :'CLIENT'));
select pg_temp.check('η ρύθμιση ειδοποιήσεων αλλάζει κανονικά', (select not email_notifications from users where id = :'CLIENT'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select apply_email_change(%L, %L)', :'CLIENT', 'x@example.com'), 'permission denied%');
select pg_temp.act('service_role');
select pg_temp.expect(format('select apply_email_change(%L, %L)', :'CLIENT', 'όχι-email'), 'invalid_email');
select apply_email_change(:'CLIENT', '  Maria.New@Example.com ');
select pg_temp.act('postgres');
select pg_temp.check('μέσω του κωδικού αλλάζει (και καθαρίζει)', (select email = 'maria.new@example.com' from users where id = :'CLIENT'));
