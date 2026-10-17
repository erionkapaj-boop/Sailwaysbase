-- Community χάρτης (0137): διόρθωση δικής μου καταχώρισης και διάρκειες ανά κατηγορία.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
update skipper_profiles set approval_status = 'pending' where user_id = :'PETROS';

select pg_temp.act('authenticated', :'NIKOS');
select id as p1 from community_add_point('hazard', 'Ύφαλος στο ακρωτήρι', 'Φαίνεται στα 2 μέτρα', 37.50, 23.50, now() - interval '3 days') \gset
select pg_temp.act('postgres');
update community_points set last_confirmed_at = now() - interval '2 days', expires_at = now() + interval '58 days' where id = :'p1';

\echo '== διόρθωση από τον συντάκτη'
select pg_temp.act('authenticated', :'NIKOS');
select community_update_point(:'p1', 'Ύφαλος νότια του ακρωτηρίου', 'Φαίνεται στο 1,5 μέτρο', 37.51, 23.51);
select pg_temp.act('postgres');
select pg_temp.check('αλλάζουν τίτλος, περιγραφή, θέση', (select title = 'Ύφαλος νότια του ακρωτηρίου' and description = 'Φαίνεται στο 1,5 μέτρο' and lat = 37.51 and lng = 23.51 from community_points where id = :'p1'));
select pg_temp.check('οι ημερομηνίες παρατήρησης και επιβεβαίωσης δεν αλλάζουν με τη διόρθωση', (
  select observed_at < now() - interval '2 days 23 hours' and last_confirmed_at < now() - interval '1 day 23 hours' from community_points where id = :'p1'));
select pg_temp.act('authenticated', :'NIKOS');
select community_update_point(:'p1', 'Ύφαλος νότια του ακρωτηρίου', '', 37.51, 23.51, format('%s/a.jpg', :'NIKOS'));
select pg_temp.act('postgres');
select pg_temp.check('προστίθεται φωτογραφία', (select photo_path = format('%s/a.jpg', :'NIKOS') from community_points where id = :'p1'));
select pg_temp.act('authenticated', :'NIKOS');
select community_update_point(:'p1', 'Ύφαλος νότια του ακρωτηρίου', '', 37.51, 23.51);
select pg_temp.act('postgres');
select pg_temp.check('χωρίς νέα φωτογραφία μένει η υπάρχουσα', (select photo_path is not null from community_points where id = :'p1'));
select pg_temp.act('authenticated', :'NIKOS');
select community_update_point(:'p1', 'Ύφαλος νότια του ακρωτηρίου', '', 37.51, 23.51, null, true);
select pg_temp.act('postgres');
select pg_temp.check('αφαίρεση φωτογραφίας', (select photo_path is null from community_points where id = :'p1'));

\echo '== έλεγχοι'
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.expect(format($$select community_update_point(%L, 'ab', '', 37.5, 23.5)$$, :'p1'), 'invalid_title');
select pg_temp.expect(format($$select community_update_point(%L, 'Τίτλος', '', 137.5, 23.5)$$, :'p1'), 'invalid_position');
select pg_temp.expect(format($$select community_update_point(%L, 'Τίτλος', '', 37.5, 23.5, '%s/x.jpg')$$, :'p1', :'GIORGOS'), 'invalid_photo');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format($$select community_update_point(%L, 'Τίτλος', '', 37.5, 23.5)$$, :'p1'), 'not_allowed');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format($$select community_update_point(%L, 'Τίτλος', '', 37.5, 23.5)$$, :'p1'), 'community_not_allowed');
select pg_temp.act('authenticated', :'PETROS');
select pg_temp.expect(format($$select community_update_point(%L, 'Τίτλος', '', 37.5, 23.5)$$, :'p1'), 'community_not_allowed');
select pg_temp.act('anon');
select pg_temp.expect(format($$select community_update_point(%L, 'Τίτλος', '', 37.5, 23.5)$$, :'p1'), 'permission denied for function community_update_point');

\echo '== περιορισμένος, αρχειοθετημένος, αφαιρεμένος'
select pg_temp.act('postgres');
select set_config('platform.trusted', 'true', false);
update users set is_staff_admin = true where id = :'ELENI';
select set_config('platform.trusted', '', false);
select pg_temp.act('authenticated', :'ELENI');
select admin_community_restrict_member(:'NIKOS', 3, 'rules');
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.expect(format($$select community_update_point(%L, 'Τίτλος', '', 37.5, 23.5)$$, :'p1'), 'community_restricted');
select pg_temp.act('authenticated', :'ELENI');
select admin_community_lift_restriction(:'NIKOS');
select pg_temp.act('postgres');
update community_points set status = 'archived' where id = :'p1';
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.expect(format($$select community_update_point(%L, 'Τίτλος', '', 37.5, 23.5)$$, :'p1'), 'point_archived');
select pg_temp.act('postgres');
update community_points set status = 'active' where id = :'p1';
select pg_temp.act('authenticated', :'NIKOS');
select community_remove_point(:'p1');
select pg_temp.expect(format($$select community_update_point(%L, 'Τίτλος', '', 37.5, 23.5)$$, :'p1'), 'point_not_found');

\echo '== διάρκειες ανά κατηγορία για τα μέλη'
select pg_temp.check('το μέλος βλέπει τις 5 κατηγορίες', (select count(*) from community_category_info()) = 5);
select pg_temp.check('οι προσωρινές τιμές', (select show_days = 60 and archive_days = 365 from community_category_info() where category = 'hazard'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect('select * from community_category_info()', 'community_not_allowed');
select pg_temp.act('anon');
select pg_temp.expect('select * from community_category_info()', 'permission denied for function community_category_info');
