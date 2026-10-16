-- Community (0136): πρόσβαση, σημεία χάρτη, ομάδες, μηνύματα, αναφορές, εποπτεία, ρυθμίσεις, Nearby.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
-- ΝΙΚΟΣ, ΓΙΩΡΓΟΣ, ΚΩΣΤΑΣ: εγκεκριμένοι επαγγελματίες. ΕΛΕΝΗ: υπάλληλος διαχείρισης. ΠΕΤΡΟΣ: εκκρεμής έγκριση.
update users set is_staff_admin = true where id = :'ELENI';
update skipper_profiles set approval_status = 'pending' where user_id = :'PETROS';
-- ΣΟΦΙΑ: κύριος ρόλος σε αναμονή, δεύτερος ρόλος εγκεκριμένος.
update skipper_profiles set approval_status = 'pending' where user_id = :'SOFIA';
insert into skipper_secondary_roles (skipper_id, role, price_per_day, approval_status)
  values ((select id from skipper_profiles where user_id = :'SOFIA'), 'cook', 220, 'pending');
select set_config('platform.trusted', 'true', false);
update skipper_secondary_roles set approval_status = 'approved' where skipper_id = (select id from skipper_profiles where user_id = :'SOFIA');
select set_config('platform.trusted', '', false);

\echo '== πρόσβαση'
select pg_temp.act('anon');
select pg_temp.expect('select community_my_access()', 'permission denied for function community_my_access');
select pg_temp.expect('select * from community_list_points()', 'permission denied for function community_list_points');
select pg_temp.expect('select * from community_points', 'permission denied for table community_points');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.check('πελάτης: καμία πρόσβαση', (community_my_access() ->> 'can_read') = 'false' and (community_my_access() ->> 'can_write') = 'false');
select pg_temp.expect('select * from community_list_points()', 'community_not_allowed');
select pg_temp.expect('select * from community_list_groups()', 'community_not_allowed');
select pg_temp.expect($$select community_add_point('hazard', 'Βράχος', '', 37.5, 23.5)$$, 'community_not_allowed');
select pg_temp.expect('select * from community_points', 'permission denied for table community_points');
select pg_temp.act('authenticated', :'PETROS');
select pg_temp.expect('select * from community_list_points()', 'community_not_allowed');
select pg_temp.act('authenticated', :'SOFIA');
select pg_temp.check('δεύτερος ρόλος εγκεκριμένος: έχει πρόσβαση', (community_my_access() ->> 'can_write') = 'true');
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('εγκεκριμένος επαγγελματίας: διαβάζει και γράφει', (community_my_access() ->> 'can_read') = 'true' and (community_my_access() ->> 'can_write') = 'true' and (community_my_access() ->> 'moderator') = 'false');
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('διαχείριση: διαβάζει, εποπτεύει, δεν γράφει χωρίς προφίλ επαγγελματία', (community_my_access() ->> 'can_read') = 'true' and (community_my_access() ->> 'moderator') = 'true' and (community_my_access() ->> 'can_write') = 'false');
select pg_temp.act('postgres');
update users set phone_verified_at = null where id = :'GIORGOS';
select pg_temp.act('authenticated', :'GIORGOS');
select pg_temp.check('ανεπιβεβαίωτος λογαριασμός: καμία πρόσβαση', (community_my_access() ->> 'can_read') = 'false');
select pg_temp.act('postgres');
update users set phone_verified_at = now(), status = 'suspended' where id = :'GIORGOS';
select pg_temp.act('authenticated', :'GIORGOS');
select pg_temp.check('σε αναστολή: καμία πρόσβαση', (community_my_access() ->> 'can_read') = 'false');
select pg_temp.act('postgres');
update users set status = 'active' where id = :'GIORGOS';

\echo '== σημεία χάρτη'
select pg_temp.act('authenticated', :'NIKOS');
select id as p1 from community_add_point('hazard', 'Ύφαλος στο ακρωτήρι', 'Φαίνεται στα 2 μέτρα', 37.50, 23.50, now() - interval '3 days', null, '{"kind":"rock"}') \gset
select pg_temp.expect($$select community_add_point('xxx', 'Τίτλος', '', 37.5, 23.5)$$, 'invalid_category');
select pg_temp.expect($$select community_add_point('hazard', 'ab', '', 37.5, 23.5)$$, 'invalid_title');
select pg_temp.expect($$select community_add_point('hazard', 'Τίτλος', '', 137.5, 23.5)$$, 'invalid_position');
select pg_temp.expect($$select community_add_point('hazard', 'Τίτλος', '', 37.5, 23.5, now() + interval '1 day')$$, 'invalid_observed_at');
select pg_temp.expect($$select community_add_point('hazard', 'Τίτλος', '', 37.5, 23.5, now() - interval '40 days')$$, 'invalid_observed_at');
select pg_temp.expect(format($$select community_add_point('hazard', 'Τίτλος', '', 37.5, 23.5, null, '%s/x.jpg')$$, :'GIORGOS'), 'invalid_photo');
select pg_temp.expect($$select community_add_point('hazard', 'Τίτλος', '', 37.5, 23.5, null, null, '{"bogus":1}')$$, 'invalid_details');
select pg_temp.expect($$select community_add_point('weather', 'Τίτλος', '', 37.5, 23.5, null, null, '{"wind_kn":500}')$$, 'invalid_details');
select pg_temp.expect($$select community_add_point('weather', 'Τίτλος', '', 37.5, 23.5, null, null, '{"kind":"rock"}')$$, 'invalid_details');
select pg_temp.expect($$select community_add_point('anchorage', 'Τίτλος', '', 37.5, 23.5, null, null, '{"shelter_from":["X"]}')$$, 'invalid_details');
select id as p2 from community_add_point('weather', 'Μελτέμι στον Κάβο', '', 37.40, 24.00, null, null, '{"wind_dir":"N","wind_kn":28,"gust_kn":36,"sea_state":5}') \gset
select id as p3 from community_add_point('anchorage', 'Όρμος με καλό αγκυροβόλιο', '', 37.00, 24.50, null, format('%s/foto1.jpg', :'NIKOS'), '{"kind":"anchorage","shelter_from":["N","NE"],"depth_m":6}') \gset
select pg_temp.act('postgres');
select pg_temp.check('ξεχωριστές ημερομηνίες: παρατήρηση πριν 3 μέρες, επιβεβαίωση τώρα', (
  select observed_at < now() - interval '2 days' and last_confirmed_at > now() - interval '1 minute' from community_points where id = :'p1'));
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.check('άλλο μέλος βλέπει τα σημεία', (select count(*) from community_list_points()) = 3);
select pg_temp.check('φίλτρο κατηγορίας', (select count(*) from community_list_points('weather')) = 1);
select pg_temp.check('φίλτρο περιοχής', (select count(*) from community_list_points(null, 37.3, 23.9, 37.6, 24.1)) = 1);
select pg_temp.check('εμφανίζεται το όνομα του συντάκτη', (select author_name from community_list_points('weather')) = 'Νίκος Αρχικός');
select pg_temp.check('οι αναφορές δεν φαίνονται σε απλό μέλος', (select max(open_reports) from community_list_points()) = 0);
select pg_temp.expect($$select * from community_list_points(null, null, null, null, null, 'all')$$, 'not_admin');
select pg_temp.expect($$select * from community_list_points(null, null, null, null, null, 'xx')$$, 'invalid_scope');
select pg_temp.expect(format('select community_remove_point(%L)', :'p1'), 'not_allowed');

\echo '== επιβεβαίωση και λήξη'
select pg_temp.act('postgres');
update community_points set last_confirmed_at = now() - interval '70 days', expires_at = now() - interval '10 days' where id = :'p1';
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.check('ληγμένο σημείο δεν φαίνεται στον χάρτη', (select count(*) from community_list_points() where id = :'p1') = 0);
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('ο συντάκτης το βλέπει στα δικά του ως ληγμένο', (select is_expired from community_list_points(null, null, null, null, null, 'mine') where id = :'p1'));
select pg_temp.act('authenticated', :'KOSTAS');
select community_confirm_point(:'p1');
select pg_temp.act('postgres');
select pg_temp.check('η επιβεβαίωση ανανεώνει τη λήξη, όχι την παρατήρηση', (
  select expires_at > now() + interval '59 days' and last_confirmed_by = :'KOSTAS' and observed_at < now() - interval '2 days'
  from community_points where id = :'p1'));
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.check('και ξαναφαίνεται', (select count(*) from community_list_points() where id = :'p1') = 1);
select pg_temp.act('postgres');
update community_points set last_confirmed_at = now() - interval '400 days', expires_at = now() - interval '340 days' where id = :'p1';
select pg_temp.check('αρχειοθέτηση: 1 σημείο', community_archive_stale() = 1);
select pg_temp.check('το σημείο έγινε archived', (select status from community_points where id = :'p1') = 'archived');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select community_confirm_point(%L)', :'p1'), 'point_archived');
select pg_temp.expect('select community_archive_stale()', 'permission denied for function community_archive_stale');

\echo '== ρυθμίσεις ανά κατηγορία (μόνο ιδιοκτήτης)'
select pg_temp.expect($$select admin_community_set_category('hazard', 10, 100)$$, 'not_admin');
select pg_temp.check('απλό μέλος δεν βλέπει τις ρυθμίσεις', (select count(*) from admin_community_list_settings()) = 0);
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.check('υπάλληλος βλέπει τις ρυθμίσεις', (select count(*) from admin_community_list_settings()) = 5);
select pg_temp.expect($$select admin_community_set_category('hazard', 10, 100)$$, 'owner_only');
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.expect($$select admin_community_set_category('hazard', 100, 10)$$, 'invalid_days');
select pg_temp.expect($$select admin_community_set_category('nope', 10, 100)$$, 'invalid_category');
select admin_community_set_category('weather', 5, 40);
select pg_temp.act('postgres');
select pg_temp.check('οι ρυθμίσεις αλλάζουν και ισχύουν αμέσως στα ενεργά σημεία', (
  select s.show_days = 5 and p.expires_at = p.last_confirmed_at + interval '5 days'
  from community_category_settings s, community_points p where s.category = 'weather' and p.id = :'p2'));
select pg_temp.check('καταγράφεται στη διαχείριση', (select count(*) from admin_actions where action_type = 'community_set_category') = 1);
select pg_temp.act('authenticated', :'KOSTAS');

\echo '== αναφορές'
select pg_temp.act('authenticated', :'KOSTAS');
select community_report('point', :'p2', 'wrong', 'Δεν ισχύει') is not null as ok \gset
select pg_temp.check('αναφορά σημείου', :'ok'::boolean);
select pg_temp.check('δεύτερη ίδια αναφορά δεν διπλογράφεται', community_report('point', :'p2', 'wrong', '') is null);
select pg_temp.expect(format('select community_report(%L, %L, %L)', 'point', :'p2', 'zzz'), 'invalid_reason');
select pg_temp.expect(format('select community_report(%L, %L, %L)', 'other', :'p2', 'wrong'), 'invalid_target');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select community_report(%L, %L, %L)', 'point', :'p2', 'wrong'), 'community_not_allowed');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect($$select * from admin_community_list_reports()$$, 'not_admin');
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('η διαχείριση βλέπει την αναφορά με συντάκτη', (select count(*) from admin_community_list_reports('open') where target_author_name = 'Νίκος Αρχικός' and reason = 'wrong') = 1);
select pg_temp.check('μετρητής ανοιχτών αναφορών στο σημείο', (select open_reports from community_list_points('weather')) = 1);

\echo '== ομάδες και μηνύματα'
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('οι 4 αρχικές ομάδες', (select count(*) from community_list_groups()) = 4);
select id as g_saronic from community_list_groups() where slug = 'saronic' \gset
select id as g_aegean from community_list_groups() where slug = 'aegean' \gset
select pg_temp.expect(format($$select community_post_message(%L, 'Καλημέρα')$$, :'g_saronic'), 'not_member');
select community_join_group(:'g_saronic');
select community_join_group(:'g_aegean');
select community_join_group(:'g_aegean');
select pg_temp.check('ένα μέλος σε πολλές ομάδες', (select count(*) from community_list_groups() where is_member) = 2);
select id as m1 from community_post_message(:'g_saronic', 'Καλημέρα, μελτέμι αύριο;') \gset
select pg_temp.expect(format($$select community_post_message(%L, '   ')$$, :'g_saronic'), 'invalid_body');
select pg_temp.expect(format($$select community_post_message(%L, %L)$$, :'g_saronic', repeat('α', 2001)), 'invalid_body');
select pg_temp.act('authenticated', :'KOSTAS');
select community_join_group(:'g_saronic');
select community_join_group(:'g_aegean');
select id as m2 from community_post_message(:'g_saronic', 'Ναι, 6 μποφόρ', :'m1') \gset
select pg_temp.expect(format($$select community_post_message(%L, 'x', %L)$$, :'g_saronic', :'m2'), 'invalid_parent');
select pg_temp.expect(format($$select community_post_message(%L, 'x', %L)$$, :'g_aegean', :'m1'), 'invalid_parent');
select pg_temp.check('μηνύματα με απαντήσεις', (select count(*) from community_list_messages(:'g_saronic')) = 2
  and (select parent_id from community_list_messages(:'g_saronic') where id = :'m2') = :'m1');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select * from community_list_messages(%L)', :'g_saronic'), 'community_not_allowed');
select pg_temp.expect(format('select community_join_group(%L)', :'g_saronic'), 'community_not_allowed');

\echo '== εποπτεία: διαγραφή, περιορισμός, κλείσιμο ομάδας'
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select community_delete_message(%L)', :'m1'), 'not_allowed');
select pg_temp.expect(format('select admin_community_restrict_member(%L, 7, %L)', :'NIKOS', 'rules'), 'not_admin');
select pg_temp.act('authenticated', :'ELENI');
select community_delete_message(:'m1', 'Προσφορά δουλειάς');
select pg_temp.check('διαγραμμένο: μένει η απάντηση, χωρίς κείμενο και όνομα', (
  select deleted and body is null and author_name is null from community_list_messages(:'g_saronic') where id = :'m1'));
select pg_temp.check('καταγράφεται η ενέργεια', (select count(*) from admin_actions where action_type = 'community_delete_message' and target_user_id = :'NIKOS') = 1);
select pg_temp.expect(format('select admin_community_restrict_member(%L, 400, %L)', :'NIKOS', 'rules'), 'invalid_duration');
select pg_temp.expect(format('select admin_community_restrict_member(%L, 7, %L)', :'NIKOS', 'zzz'), 'invalid_reason');
select pg_temp.expect(format('select admin_community_restrict_member(%L, 7, %L)', :'ADMIN', 'rules'), 'cannot_edit_admin');
select admin_community_restrict_member(:'NIKOS', 7, 'offers');
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('περιορισμένος: διαβάζει, δεν γράφει', (community_my_access() ->> 'can_read') = 'true' and (community_my_access() ->> 'can_write') = 'false' and (community_my_access() ->> 'restricted_until') is not null);
select pg_temp.expect(format($$select community_post_message(%L, 'Γεια')$$, :'g_saronic'), 'community_restricted');
select pg_temp.expect($$select community_add_point('other', 'Παρατήρηση', '', 37.5, 23.5)$$, 'community_restricted');
select pg_temp.expect(format('select community_report(%L, %L, %L)', 'point', :'p2', 'wrong'), 'community_restricted');
select pg_temp.check('εξακολουθεί να βλέπει τον χάρτη', (select count(*) from community_list_points()) >= 1);
select pg_temp.act('authenticated', :'ELENI');
select admin_community_lift_restriction(:'NIKOS');
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('άρση περιορισμού', (community_my_access() ->> 'can_write') = 'true');
select pg_temp.act('postgres');
insert into community_restrictions (user_id, until, reason) values (:'NIKOS', now() - interval '1 day', 'rules');
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('ληγμένος περιορισμός δεν ισχύει', (community_my_access() ->> 'can_write') = 'true');
select pg_temp.act('authenticated', :'ELENI');
select admin_community_set_group_status(:'g_saronic', true, 'Δοκιμή');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format($$select community_post_message(%L, 'Γεια')$$, :'g_saronic'), 'group_closed');
select pg_temp.check('κλειστή ομάδα διαβάζεται ακόμα', (select count(*) from community_list_messages(:'g_saronic')) >= 1);
select pg_temp.act('authenticated', :'ELENI');
select admin_community_set_group_status(:'g_saronic', false);
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.check('ξανανοίγει', (select status from community_list_groups() where id = :'g_saronic') = 'open');

\echo '== αφαίρεση σημείου από συντάκτη και διαχείριση'
select pg_temp.act('authenticated', :'NIKOS');
select community_remove_point(:'p3');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.check('αφαιρεμένο: δεν φαίνεται', (select count(*) from community_list_points() where id = :'p3') = 0);
select pg_temp.act('authenticated', :'ADMIN');
select community_remove_point(:'p2', 'Λάθος');
select pg_temp.check('η αναφορά του κλείνει μαζί του', (select count(*) from admin_community_list_reports('resolved') where point_id = :'p2') = 1);
select pg_temp.expect(format('select community_remove_point(%L)', :'p2'), 'point_not_found');

\echo '== Nearby: προαιρετική θέση'
select pg_temp.act('authenticated', :'KOSTAS');
select community_set_presence(37.50, 23.50, 6);
select pg_temp.expect($$select community_set_presence(37.5, 23.5, 48)$$, 'invalid_duration');
select pg_temp.act('authenticated', :'GIORGOS');
select community_set_presence(37.52, 23.51, 6);
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('βλέπει μέλη κοντά, στρογγυλεμένη θέση', (select count(*) = 2 and bool_and(approx_lat = round(approx_lat::numeric, 2)) from community_nearby_members(37.50, 23.50, 10)));
select pg_temp.check('ακτίνα', (select count(*) from community_nearby_members(37.50, 23.50, 1)) = 1);
select pg_temp.check('ποτέ τον ίδιο', (select count(*) from community_nearby_members(37.50, 23.50, 10) where user_id = :'NIKOS') = 0);
select pg_temp.expect($$select * from community_nearby_members(37.5, 23.5, 500)$$, 'invalid_radius');
select pg_temp.act('authenticated', :'ELENI');
select admin_community_restrict_member(:'GIORGOS', 3, 'abuse');
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('περιορισμένος δεν εμφανίζεται', (select count(*) from community_nearby_members(37.50, 23.50, 10)) = 1);
select pg_temp.act('authenticated', :'KOSTAS');
select community_clear_presence();
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('μετά την απόσυρση δεν εμφανίζεται', (select count(*) from community_nearby_members(37.50, 23.50, 10)) = 0);
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect($$select * from community_nearby_members(37.5, 23.5, 10)$$, 'community_not_allowed');

\echo '== λογαριασμός που χάνει την έγκριση χάνει την πρόσβαση'
select pg_temp.act('postgres');
update skipper_profiles set approval_status = 'rejected' where user_id = :'KOSTAS';
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect('select * from community_list_points()', 'community_not_allowed');
select pg_temp.act('postgres');
select pg_temp.check('οι εσωτερικές συναρτήσεις δεν καλούνται από τον browser', not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('community_eligible', 'community_restricted', 'community_assert_read', 'community_assert_write', 'community_author_name', 'community_validate_details', 'community_distance_km')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))));
