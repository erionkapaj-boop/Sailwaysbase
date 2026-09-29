-- Έλεγχος ασφαλείας (0115, docs/SECURITY_REVIEW.md): κάθε εύρημα ξαναδοκιμάζεται
-- εδώ ως επίθεση, με τους πραγματικούς ρόλους του API, και μαζί δομικοί
-- φύλακες που αποτυγχάνουν αν μια νέα migration ξανανοίξει την ίδια τρύπα.
-- Η Σοφία είναι υπάλληλος (και επαγγελματίας), ο Νίκος ο ιδιοκτήτης.
\i tests/db/helpers.sql
select pg_temp.act('postgres');
select set_config('platform.trusted', 'true', false);
update users set is_owner = true, is_staff_admin = true where id = :'NIKOS';
update users set is_staff_admin = true where id = :'SOFIA';
select set_config('platform.trusted', '', false);
select id as cyclades from regions where name = 'Κυκλάδες' \gset
\set SP_SOFIA 'b0000000-0000-0000-0000-000000000008'
\set SP_NIKOS 'b0000000-0000-0000-0000-000000000003'
\set SP_GIORGOS 'b0000000-0000-0000-0000-000000000004'

\echo '== δομικοί φύλακες'
select pg_temp.check('κανένας φύλακας δεν εξαιρεί κάθε μέλος της διαχείρισης: ' || coalesce(string_agg(distinct p.proname, ', '), '—'), count(*) = 0)
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and t.tgrelid::regclass::text in
  ('users', 'skipper_profiles', 'skipper_secondary_roles', 'client_profiles', 'reviews', 'booking_requests', 'delivery_requests')
  and p.prosrc ~ 'is_admin\(\)';
-- Κάθε ενέργεια διαχείρισης που γράφει δεδομένα ελέγχει σε ποιον ενεργεί ή
-- είναι μόνο για τον ιδιοκτήτη. Μια νέα πρέπει να ελεγχθεί και να μπει εδώ
-- ρητά αν δεν αφορά συγκεκριμένο χρήστη.
select pg_temp.check('κάθε νέα ενέργεια διαχείρισης ελέγχει τον στόχο: ' || coalesce(string_agg(proname, ', '), '—'), count(*) = 0)
from pg_proc where pronamespace = 'public'::regnamespace and proname like 'admin\_%'
  and prosrc ~* '(update |insert into|delete from)'
  and prosrc !~ '(assert_admin_can_act_on|is_owner_admin|can_manage_account)'
  and proname not in (
    'admin_cancel_offer',               -- κλείνει πρόταση αντικατάστασης, όχι λογαριασμό
    'admin_set_contact_message_status', -- μήνυμα φόρμας επικοινωνίας
    'admin_suspend_account'             -- αρνείται μόνη της διαχειριστές και υπαλλήλους
  );
select pg_temp.check('οι βοηθητικές του ελέγχου δεν καλούνται από τον browser', not exists (
  select 1 from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('assert_admin_can_act_on', 'allowed_photo_host', 'limit_availability_rows')
    and (has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'))));
select pg_temp.check('ο πίνακας ρυθμίσεων συστήματος είναι κλειστός', not has_table_privilege('authenticated', 'platform_config', 'select')
  and not has_table_privilege('anon', 'platform_config', 'select'));

\echo '== #2 υπάλληλος: τίποτα προνομιούχο στις δικές του γραμμές'
select pg_temp.act('postgres');
update skipper_profiles set approval_status = 'pending' where id = :'SP_SOFIA';
select pg_temp.act('authenticated', :'SOFIA');
update skipper_profiles set approval_status = 'approved', rating_avg = 5, rating_count = 250, tier = 'high',
       completed_bookings_count = 300 where id = :'SP_SOFIA';
insert into skipper_secondary_roles (skipper_id, role, price_per_day, approval_status, rating_avg, rating_count)
  values (:'SP_SOFIA', 'cook', 230, 'approved', 5, 99);
insert into client_profiles (user_id) values (:'SOFIA') on conflict do nothing;
update client_profiles set rating_avg = 5, rating_count = 40 where user_id = :'SOFIA';
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role,
                              fee_amount, fee_paid_at, claim_fee_amount, origin, status)
  values (:'SOFIA', current_date + 20, current_date + 22, :'cyclades', 'Πάρος', 'Πάρος', 'skipper', 0, now(), 0, 'admin_direct', 'open')
  returning id as sofia_req \gset
select pg_temp.act('postgres');
select pg_temp.check('δεν εγκρίνει ούτε βαθμολογεί το δικό του προφίλ',
  (select approval_status = 'pending' and rating_count = 0 and tier = 'medium' and completed_bookings_count = 0
     from skipper_profiles where id = :'SP_SOFIA'));
select pg_temp.check('ο δεύτερος ρόλος του ξεκινά σε αναμονή, χωρίς βαθμολογίες',
  (select approval_status = 'pending' and rating_count = 0 from skipper_secondary_roles where skipper_id = :'SP_SOFIA' and role = 'cook'));
select pg_temp.check('δεν γράφει βαθμολογίες στο προφίλ πελάτη του', (select rating_count = 0 from client_profiles where user_id = :'SOFIA'));
select pg_temp.check('το αίτημά του έχει τους όρους της πλατφόρμας (τέλος, πληρωμή, προέλευση)',
  (select fee_amount = 1 and fee_paid_at is null and claim_fee_amount is null and origin = 'client' from booking_requests where id = :'sofia_req'));
select pg_temp.act('postgres');
update skipper_profiles set approval_status = 'approved' where id = :'SP_SOFIA';

\echo '== #3 υπάλληλος: μόνο σε απλούς χρήστες'
select pg_temp.act('postgres');
select id as sofia_role from skipper_secondary_roles where skipper_id = :'SP_SOFIA' and role = 'cook' \gset
select set_config('platform.trusted', 'true', false);
update users set photo_url = 'https://proj.supabase.co/storage/v1/object/public/crew-photos/' || id || '/1.jpg'
 where id in (:'NIKOS', :'SOFIA', :'KOSTAS');
update users set phone_verified_at = null where id in (:'SOFIA', :'KOSTAS');
select set_config('platform.trusted', '', false);
select pg_temp.act('authenticated', :'SOFIA');
select pg_temp.expect(format('select admin_approve_skipper(%L)', :'SOFIA'), 'cannot_edit_admin');
select pg_temp.expect(format('select admin_approve_photo(%L)', :'SOFIA'), 'cannot_edit_admin');
select pg_temp.expect(format('select admin_verify_user(%L)', :'SOFIA'), 'cannot_edit_admin');
select pg_temp.expect(format('select admin_approve_secondary_role(%L)', :'sofia_role'), 'cannot_edit_admin');
select pg_temp.expect(format('select admin_reject_skipper(%L, %L)', :'NIKOS', 'x'), 'cannot_edit_admin');
select pg_temp.expect(format('select admin_clear_photo(%L, %L)', :'NIKOS', 'x'), 'cannot_edit_admin');
select pg_temp.expect(format($$select admin_create_offer(array[%L]::uuid[], 'skipper', current_date + 20, current_date + 22,
  (select id from ports limit 1), (select id from boat_types limit 1), null, 0, null, 24)$$, :'SP_GIORGOS'), 'owner_only');
select pg_temp.act('postgres');
select pg_temp.check('το προφίλ του ιδιοκτήτη και η φωτογραφία του έμειναν ως είχαν',
  (select approval_status = 'approved' from skipper_profiles where id = :'SP_NIKOS')
  and (select photo_url is not null from users where id = :'NIKOS'));

\echo '== #4 υπάλληλος: σε απλό χρήστη, οι εγκρίσεις αποθηκεύονται'
select pg_temp.act('postgres');
update users set status = 'draft' where id = :'KOSTAS';
update skipper_profiles set approval_status = 'pending' where user_id = :'KOSTAS';
select pg_temp.act('authenticated', :'SOFIA');
select admin_approve_photo(:'KOSTAS');
select admin_verify_user(:'KOSTAS');
select admin_approve_skipper(:'KOSTAS');
select pg_temp.act('postgres');
select pg_temp.check('φωτογραφία εγκεκριμένη, λογαριασμός επιβεβαιωμένος και ενεργός, προφίλ εγκεκριμένο',
  (select photo_reviewed_at is not null and phone_verified_at is not null and status = 'active' from users where id = :'KOSTAS')
  and (select approval_status = 'approved' from skipper_profiles where user_id = :'KOSTAS'));
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('ο ιδιοκτήτης κάνει «δικό του ναύλο»', (admin_create_offer(array[:'SP_GIORGOS']::uuid[], 'skipper',
  current_date + 20, current_date + 22, (select id from ports limit 1), (select id from boat_types limit 1),
  null, 0, null, 24)).origin = 'admin_direct');

\echo '== #6 φωτογραφίες μόνο από τον χώρο της πλατφόρμας'
select pg_temp.act('postgres');
insert into platform_config (key, value) values ('photo_host', 'proj.supabase.co') on conflict (key) do update set value = excluded.value;
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format($$update users set photo_url = 'https://evil.example/storage/v1/object/public/crew-photos/%s/1.jpg' where id = %L$$,
  :'CLIENT', :'CLIENT'), 'invalid_photo_url');
select pg_temp.expect(format($$update users set photo_url = 'https://other.supabase.co/storage/v1/object/public/crew-photos/%s/1.jpg' where id = %L$$,
  :'CLIENT', :'CLIENT'), 'invalid_photo_url');
update users set photo_url = 'https://proj.supabase.co/storage/v1/object/public/crew-photos/' || id || '/2.jpg' where id = :'CLIENT';
select pg_temp.act('postgres');
select pg_temp.check('η κανονική φωτογραφία αποθηκεύεται', (select photo_url like 'https://proj.supabase.co/%' from users where id = :'CLIENT'));

\echo '== #7 όρια: αιτήματα, μεταφορές, αγορές'
select pg_temp.act('authenticated', :'CLIENT');
do $$
declare r uuid;
begin
  for i in 1..10 loop
    insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role)
      values (auth.uid(), current_date + 30, current_date + 31, (select id from regions where name = 'Κυκλάδες'), 'Σύρος', 'Σύρος', 'skipper')
      returning id into r;
    perform pay_and_broadcast(r, array['b0000000-0000-0000-0000-000000000004']::uuid[]);
    perform cancel_booking_request(r);
  end loop;
end $$;
insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role)
  values (:'CLIENT', current_date + 30, current_date + 31, :'cyclades', 'Σύρος', 'Σύρος', 'skipper') returning id as req11 \gset
select pg_temp.expect(format('select pay_and_broadcast(%L, array[%L]::uuid[])', :'req11', 'b0000000-0000-0000-0000-000000000004'), 'too_many_requests');
select (create_delivery_request('Λαύριο', 'Λευκάδα', 300, 'fixed', current_date + 30, 0, true, true, false, null, true, false)).id as dr \gset
select pg_temp.expect(format('select create_delivery_role_request(%L, %L, 900, (select array_agg(gen_random_uuid()) from generate_series(1, 31)))',
  :'dr', 'skipper'), 'too_many_professionals');
do $$
declare r uuid;
begin
  for i in 1..5 loop
    r := (request_credit_purchase('starter', null)).id;
    perform cancel_credit_purchase_request(r);
  end loop;
end $$;
select pg_temp.expect($$select request_credit_purchase('starter', null)$$, 'too_many_requests');

\echo '== #8 μήκος κειμένων και πλήθος περιόδων'
select pg_temp.expect(format($$insert into booking_requests (client_id, start_date, end_date, region_id, departure_point, arrival_point, crew_role, note)
  values (%L, current_date + 20, current_date + 22, %L, 'Πάρος', 'Πάρος', 'skipper', repeat('x', 2001))$$, :'CLIENT', :'cyclades'),
  'new row for relation "booking_requests" violates check constraint "booking_requests_note_len"');
select pg_temp.expect($$select create_delivery_request(repeat('Λ', 201), 'Λευκάδα', 300, 'fixed', current_date + 30, 0, true, true, false, null, true, false)$$,
  'new row for relation "delivery_requests" violates check constraint "delivery_requests_origin_point_len"');
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.expect(format($$update skipper_profiles set license_number = repeat('L', 61) where id = %L$$, :'SP_NIKOS'),
  'new row for relation "skipper_profiles" violates check constraint "skipper_profiles_license_number_len"');
insert into availability_blocks (skipper_id, start_date, end_date)
  select :'SP_NIKOS', current_date + 400 + g, current_date + 400 + g from generate_series(1, 299) g;
select pg_temp.expect(format('insert into availability_blocks (skipper_id, start_date, end_date) values (%L, current_date + 900, current_date + 900)',
  :'SP_NIKOS'), 'too_many_periods');
select pg_temp.act('postgres');
delete from availability_blocks where skipper_id = :'SP_NIKOS' and start_date > current_date + 400;

\echo '== #9 η αιτιολογία απουσίας δεν διαβάζεται'
select pg_temp.act('postgres');
insert into availability_blocks (skipper_id, start_date, end_date, reason) values (:'SP_NIKOS', current_date + 50, current_date + 51, 'Ιατρικό');
select pg_temp.act('anon');
select pg_temp.expect('select reason from availability_blocks', 'permission denied for table availability_blocks');
select pg_temp.check('οι ημερομηνίες μένουν ορατές για την αναζήτηση', (select count(*) >= 1 from availability_blocks where skipper_id = :'SP_NIKOS'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect('select reason from availability_blocks', 'permission denied for table availability_blocks');
select pg_temp.act('authenticated', :'NIKOS');
delete from availability_blocks where skipper_id = :'SP_NIKOS' and start_date = current_date + 50;
select pg_temp.act('postgres');
select pg_temp.check('ο επαγγελματίας σβήνει κανονικά τη δική του απουσία',
  not exists (select 1 from availability_blocks where skipper_id = :'SP_NIKOS' and start_date = current_date + 50));
