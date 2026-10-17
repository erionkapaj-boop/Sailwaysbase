-- Community διαχείριση (0138): λίστα αναφορών με περιεχόμενο και συντάκτη, ομάδες, περιορισμοί, μετρητής, καμία αυτόματη απόκρυψη.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
select set_config('platform.trusted', 'true', false);
update users set is_staff_admin = true where id = :'ELENI';
select set_config('platform.trusted', '', false);

select pg_temp.act('authenticated', :'NIKOS');
select id as p1 from community_add_point('hazard', 'Ύφαλος στο ακρωτήρι', 'Φαίνεται στα 2 μέτρα', 37.5, 23.5) \gset
select id as g1 from community_list_groups() where slug = 'saronic' \gset
select community_join_group(:'g1');
select id as m1 from community_post_message(:'g1', 'Ψάχνω πλήρωμα για Σεπτέμβριο, στείλτε τηλέφωνο') \gset

select pg_temp.act('authenticated', :'KOSTAS');
select community_report('point', :'p1', 'wrong', 'Δεν υπάρχει εκεί');
select community_report('message', :'m1', 'offer', 'Αγγελία πληρώματος');

\echo '== πρόσβαση'
select pg_temp.expect('select * from admin_community_list_reports()', 'not_admin');
select pg_temp.expect('select * from admin_community_list_groups()', 'not_admin');
select pg_temp.expect('select * from admin_community_list_restrictions()', 'not_admin');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect('select * from admin_community_list_reports()', 'not_admin');
select pg_temp.act('anon');
select pg_temp.expect('select * from admin_community_list_reports()', 'permission denied for function admin_community_list_reports');

\echo '== λίστα αναφορών'
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.check('δύο ανοιχτές αναφορές', (select count(*) from admin_community_list_reports('open')) = 2);
select pg_temp.check('σημείο: τίτλος, περιγραφή, κατηγορία, συντάκτης, αναφέρων', (
  select target_title = 'Ύφαλος στο ακρωτήρι' and target_body = 'Φαίνεται στα 2 μέτρα' and target_category = 'hazard'
         and target_author_name = 'Νίκος Αρχικός' and reporter_name = 'Κώστας Υποψήφιος' and not target_removed
  from admin_community_list_reports('open') where target_type = 'point'));
select pg_temp.check('μήνυμα: κείμενο, ομάδα, κατάσταση ομάδας', (
  select target_body like 'Ψάχνω πλήρωμα%' and group_name = 'Σαρωνικός' and group_name_en = 'Saronic' and group_status = 'open' and reason = 'offer'
  from admin_community_list_reports('open') where target_type = 'message'));
select pg_temp.check('ο μετρητής του μενού', (admin_overview() ->> 'community_reports_open')::int = 2);

\echo '== ενέργειες: διαγραφή, περιορισμός, κλείσιμο ομάδας, απόρριψη'
select community_delete_message(:'m1', 'Αγγελία πληρώματος');
select pg_temp.check('μετά τη διαγραφή η αναφορά κλείνει, το περιεχόμενο μένει ορατό στη διαχείριση', (
  select target_removed and target_body like 'Ψάχνω πλήρωμα%' and status = 'resolved' from admin_community_list_reports('closed') where target_type = 'message'));
select admin_community_restrict_member(:'NIKOS', 7, 'offers');
select pg_temp.check('ο συντάκτης φαίνεται περιορισμένος στη λίστα', (select author_restricted_until is not null from admin_community_list_reports('open') where target_type = 'point'));
select pg_temp.check('λίστα περιορισμών', (select count(*) = 1 and bool_and(user_name = 'Νίκος Αρχικός' and reason = 'offers' and set_by_name = 'Ελένη Υποψήφια') from admin_community_list_restrictions()));
select admin_community_set_group_status(:'g1', true, 'Δοκιμή');
select pg_temp.check('ομάδες: κλειστή, μέλη, μηνύματα, ανοιχτές αναφορές', (
  select status = 'closed' and member_count = 1 and message_count = 0 and open_reports = 0 from admin_community_list_groups() where slug = 'saronic'));
select pg_temp.check('ο μετρητής μένει με την ανοιχτή αναφορά σημείου', (admin_overview() ->> 'community_reports_open')::int = 1);
select admin_community_resolve_report((select id from admin_community_list_reports('open') where target_type = 'point'), true);
select pg_temp.check('απόρριψη: η αναφορά κλείνει ως dismissed', (
  select status = 'dismissed' from admin_community_list_reports('dismissed') where target_type = 'point'));
select pg_temp.act('postgres');
select pg_temp.check('και το σημείο μένει active', (select status from community_points where id = :'p1') = 'active');
select pg_temp.act('authenticated', :'ELENI');
select pg_temp.check('ο μετρητής μηδενίζει', (admin_overview() ->> 'community_reports_open')::int = 0);
select admin_community_lift_restriction(:'NIKOS');
select pg_temp.check('άρση περιορισμού', (select count(*) from admin_community_list_restrictions()) = 0);

\echo '== καμία αυτόματη απόκρυψη μετά από αριθμό αναφορών'
select pg_temp.act('authenticated', :'GIORGOS');
select community_report('point', :'p1', 'wrong');
select pg_temp.act('authenticated', :'KOSTAS');
select community_report('point', :'p1', 'outdated');
select pg_temp.act('authenticated', :'SOFIA');
select community_report('point', :'p1', 'abuse');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.check('με πολλές αναφορές το σημείο εξακολουθεί να φαίνεται', (select count(*) from community_list_points() where id = :'p1') = 1);
select pg_temp.act('postgres');
select pg_temp.check('και μένει active', (select status from community_points where id = :'p1') = 'active');
