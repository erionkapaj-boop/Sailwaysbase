-- Ειδοποιήσεις στο κινητό (0129): συσκευές, ουρά από ειδοποιήσεις και μηνύματα,
-- ποιος δικαιούται να τα δει, και η ουρά αποστολής.
-- Μετά το τεστ το run.sh ελέγχει ότι κάθε υπόλοιπο ισούται με το άθροισμα των κινήσεών του.
\i tests/db/helpers.sql
\set SP_KOSTAS 'b0000000-0000-0000-0000-000000000005'
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset

select pg_temp.act('postgres');
delete from push_outbox;

\echo '== συσκευές'
select pg_temp.act('authenticated', :'CLIENT');
select save_push_subscription('https://push.example.test/send/aaaaaaaaaaaaaaaaaaaa', 'BP-p256dh-key-aaaaaaaaaaaaaaaaaaaaaaaa', 'auth-secret-aaaa', 'Test Browser');
select pg_temp.check('η συσκευή αποθηκεύεται', push_subscription_active('https://push.example.test/send/aaaaaaaaaaaaaaaaaaaa'));
select save_push_subscription('https://push.example.test/send/aaaaaaaaaaaaaaaaaaaa', 'BP-p256dh-key-bbbbbbbbbbbbbbbbbbbbbbbb', 'auth-secret-bbbb', 'Test Browser');
select pg_temp.act('postgres');
select pg_temp.check('ίδια συσκευή = μία γραμμή, με τα νέα κλειδιά', (select count(*) = 1 and bool_and(p256dh like '%bbbb%') from push_subscriptions where endpoint like '%aaaaaaaaaaaaaaaaaaaa'));
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('άλλος χρήστης δεν τη βλέπει ως δική του', not push_subscription_active('https://push.example.test/send/aaaaaaaaaaaaaaaaaaaa'));
select remove_push_subscription('https://push.example.test/send/aaaaaaaaaaaaaaaaaaaa');
select pg_temp.act('postgres');
select pg_temp.check('άλλος χρήστης δεν σβήνει ξένη συσκευή', exists (select 1 from push_subscriptions where endpoint like '%aaaaaaaaaaaaaaaaaaaa'));
select pg_temp.act('authenticated', :'NIKOS');
select save_push_subscription('https://push.example.test/send/aaaaaaaaaaaaaaaaaaaa', 'BP-p256dh-key-cccccccccccccccccccccccc', 'auth-secret-cccc', null);
select pg_temp.act('postgres');
select pg_temp.check('κοινό κινητό: η συσκευή περνά στον τωρινό χρήστη', (select user_id = :'NIKOS' from push_subscriptions where endpoint like '%aaaaaaaaaaaaaaaaaaaa'));
select pg_temp.act('authenticated', :'NIKOS');
select remove_push_subscription('https://push.example.test/send/aaaaaaaaaaaaaaaaaaaa');
select pg_temp.act('postgres');
select pg_temp.check('ο ιδιοκτήτης της τη σβήνει', not exists (select 1 from push_subscriptions where endpoint like '%aaaaaaaaaaaaaaaaaaaa'));

\echo '== δοκιμαστική ειδοποίηση'
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.expect($$select send_test_push()$$, 'no_device');
select save_push_subscription('https://push.example.test/send/testdevice00000000', 'BP-p256dh-key-aaaaaaaaaaaaaaaaaaaaaaaa', 'auth-secret-aaaa', null);
select send_test_push();
select pg_temp.expect($$select send_test_push()$$, 'too_soon');
select pg_temp.act('postgres');
select pg_temp.check('μία δοκιμαστική στην ουρά, μόνο για τον ίδιο', (select count(*) = 1 and bool_and(user_id = :'NIKOS') from push_outbox where kind = 'push_test'));
delete from push_outbox;
delete from push_subscriptions;
select pg_temp.act('anon');
select pg_temp.expect($$select send_test_push()$$, 'permission denied%');

\echo '== έλεγχος τιμών και πρόσβαση'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect($$select save_push_subscription('x', 'y', 'z', null)$$, 'invalid_value');
select pg_temp.expect($$select * from push_subscriptions$$, 'permission denied%');
select pg_temp.expect($$select * from push_outbox$$, 'permission denied%');
select pg_temp.expect($$select * from push_config$$, 'permission denied%');
select pg_temp.expect($$select * from claim_push_outbox()$$, 'permission denied%');
select pg_temp.expect($$select finish_push_outbox(array[gen_random_uuid()], 'sent')$$, 'permission denied%');
select pg_temp.act('anon');
select pg_temp.expect($$select save_push_subscription('https://push.example.test/send/zzzzzzzzzzzzzzzzzzzz', 'BP-p256dh-key-aaaaaaaaaaaaaaaaaaaaaaaa', 'auth-secret-aaaa', null)$$, 'permission denied%');
select pg_temp.expect($$select push_subscription_active('https://push.example.test/send/zzzzzzzzzzzzzzzzzzzz')$$, 'permission denied%');

\echo '== νέα ειδοποίηση → ουρά'
select pg_temp.act('postgres');
select notify_user(:'NIKOS', 'request_received', '{"port":"Σύρος"}'::jsonb, '/platform/requests');
select pg_temp.check('η ειδοποίηση μπήκε στην ουρά του παραλήπτη', (select count(*) = 1 and bool_and(user_id = :'NIKOS' and kind = 'request_received' and notification_id is not null and status is null) from push_outbox));

\echo '== νέο μήνυμα → ουρά, χωρίς το κείμενο'
select pg_temp.act('authenticated', :'CLIENT');
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id, crew_role)
  values (:'CLIENT', current_date + 20, current_date + 22, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper')
  returning id as req \gset
select (pay_and_broadcast(:'req', array[:'SP_KOSTAS']::uuid[])).status is not null;
select pg_temp.act('authenticated', :'KOSTAS');
select (claim_booking_request(:'req', :'SP_KOSTAS')).id as bk \gset
select pg_temp.act('postgres');
delete from push_outbox;
select pg_temp.act('authenticated', :'KOSTAS');
insert into messages (booking_id, sender_id, content) values (:'bk', :'KOSTAS', 'Μυστικό κείμενο 6900000000');
select pg_temp.act('postgres');
select pg_temp.check('το μήνυμα του επαγγελματία ειδοποιεί τον πελάτη', (select count(*) = 1 and bool_and(user_id = :'CLIENT' and kind = 'message_received' and link = '/platform/bookings?focus=' || :'bk') from push_outbox where kind = 'message_received'));
select pg_temp.check('το περιεχόμενο του μηνύματος δεν αντιγράφεται', not exists (select 1 from push_outbox where data::text like '%Μυστικό%' or coalesce(link, '') like '%Μυστικό%'));
select pg_temp.act('authenticated', :'CLIENT');
insert into messages (booking_id, sender_id, content) values (:'bk', :'CLIENT', 'Ευχαριστώ');
select pg_temp.act('postgres');
select pg_temp.check('και αντίστροφα: προς τον επαγγελματία', exists (select 1 from push_outbox o join skipper_profiles sp on sp.user_id = o.user_id where o.kind = 'message_received' and sp.id = :'SP_KOSTAS'));

\echo '== ουρά αποστολής'
delete from push_outbox;
delete from push_subscriptions;
select notify_user(:'CLIENT', 'booking_confirmed', '{"port":"Σύρος"}'::jsonb, '/platform/bookings');
select notify_user(:'NIKOS', 'request_received', '{"port":"Πάρος"}'::jsonb, '/platform/requests');
select pg_temp.act('authenticated', :'CLIENT');
select save_push_subscription('https://push.example.test/send/clientdevice00000000', 'BP-p256dh-key-aaaaaaaaaaaaaaaaaaaaaaaa', 'auth-secret-aaaa', null);
select pg_temp.act('postgres');
select pg_temp.check('χωρίς συσκευή δεν στέλνεται (no_device), με συσκευή περιμένει για αποστολή',
  (select count(*) = 1 and bool_and(user_id = :'CLIENT') from claim_push_outbox()));
select pg_temp.check('ο χρήστης χωρίς συσκευή σημειώνεται no_device', (select status = 'no_device' from push_outbox where user_id = :'NIKOS'));
select pg_temp.check('δεύτερη εκτέλεση: τίποτα καινούριο (δεν στέλνεται διπλά)', (select count(*) = 0 from claim_push_outbox()));
select finish_push_outbox((select array_agg(id) from push_outbox where user_id = :'CLIENT'), 'sent');
select pg_temp.check('σημειώνεται ως σταλμένο', (select status = 'sent' from push_outbox where user_id = :'CLIENT'));

\echo '== όσα δεν χρειάζονται'
delete from push_outbox;
select notify_user(:'CLIENT', 'booking_confirmed', '{}'::jsonb, '/platform/bookings');
update notifications set read_at = now() where user_id = :'CLIENT' and kind = 'booking_confirmed';
select pg_temp.check('ό,τι διαβάστηκε ήδη στην εφαρμογή δεν στέλνεται', (select count(*) = 0 from claim_push_outbox()));
select pg_temp.check('σημειώνεται read_in_app', (select status = 'read_in_app' from push_outbox));
delete from push_outbox;
select notify_user(:'CLIENT', 'booking_confirmed', '{}'::jsonb, '/platform/bookings');
update push_outbox set created_at = now() - interval '2 days';
select pg_temp.check('πάνω από μία μέρα: δεν στέλνεται', (select count(*) = 0 from claim_push_outbox()));
select pg_temp.check('σημειώνεται too_old', (select status = 'too_old' from push_outbox));
delete from push_outbox;
select notify_user(:'CLIENT', 'booking_confirmed', '{}'::jsonb, '/platform/bookings');
update users set status = 'suspended' where id = :'CLIENT';
select pg_temp.check('ανενεργός λογαριασμός: δεν στέλνεται', (select count(*) = 0 from claim_push_outbox()));
select pg_temp.check('σημειώνεται inactive', (select status = 'inactive' from push_outbox));
update users set status = 'active' where id = :'CLIENT';

\echo '== επαναπροσπάθεια'
delete from push_outbox;
select notify_user(:'CLIENT', 'booking_confirmed', '{}'::jsonb, '/platform/bookings');
select pg_temp.check('πρώτη προσπάθεια', (select count(*) = 1 from claim_push_outbox()));
select finish_push_outbox((select array_agg(id) from push_outbox), 'retry');
select pg_temp.check('μετά από «retry» ξαναπαίρνεται', (select count(*) = 1 from claim_push_outbox()));
update push_outbox set status = 'sending', claimed_at = now() - interval '10 minutes', attempts = 3;
select pg_temp.check('μετά από 3 προσπάθειες δεν ξαναστέλνεται', (select count(*) = 0 from claim_push_outbox()));
select pg_temp.check('σημειώνεται failed', (select status = 'failed' from push_outbox));
delete from push_outbox;
select notify_user(:'CLIENT', 'booking_confirmed', '{}'::jsonb, '/platform/bookings');
update push_outbox set created_at = now() - interval '8 days';
select pg_temp.check('καθαρισμός παλιών: σβήνεται μία γραμμή', purge_push_outbox() = 1);
select pg_temp.check('και η ουρά αδειάζει', (select count(*) = 0 from push_outbox));

\echo '== η εγγραφή δεν χαλά χωρίς pg_net ή ρυθμίσεις'
insert into push_config values ('url', 'https://example.test/api/platform/push'), ('secret', 'x');
select notify_user(:'CLIENT', 'booking_confirmed', '{}'::jsonb, '/platform/bookings');
select pg_temp.check('με ρυθμίσεις αλλά χωρίς pg_net, η ειδοποίηση περνά κανονικά', (select count(*) = 1 from push_outbox));
delete from push_config;
delete from push_outbox;
delete from push_subscriptions;
