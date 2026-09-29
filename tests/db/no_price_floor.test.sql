-- 0118: η πλατφόρμα δεν βάζει καμία τιμή. Ο επαγγελματίας ορίζει την ημερήσια
-- τιμή του ελεύθερα· δεν υπάρχει ελάχιστο, προτεινόμενο ποσό ή προεπιλογή.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
insert into auth.users (id, phone) values ('e0000000-0000-0000-0000-00000000f001', '306900008801');
\set NEWPRO 'e0000000-0000-0000-0000-00000000f001'
insert into auth.users (id, phone) values ('e0000000-0000-0000-0000-00000000f002', '306900008802'), ('e0000000-0000-0000-0000-00000000f003', '306900008803');
\set NEWCL1 'e0000000-0000-0000-0000-00000000f002'
\set NEWCL2 'e0000000-0000-0000-0000-00000000f003'

\echo '== δομικοί φύλακες'
select pg_temp.check('κανένας περιορισμός στον πίνακα δεν βάζει κάτω όριο πάνω από 0',
  not exists (select 1 from pg_constraint where conrelid in ('skipper_profiles'::regclass, 'skipper_secondary_roles'::regclass)
                and pg_get_constraintdef(oid) ~ 'price_per_day'
                and pg_get_constraintdef(oid) !~ 'price_per_day IS NULL\) OR \(price_per_day > \(0\)::numeric'));
select pg_temp.check('καμία συνάρτηση δεν συγκρίνει την τιμή με κάτω όριο: ' || coalesce(string_agg(proname, ', '), '—'), count(*) = 0)
from pg_proc where pronamespace = 'public'::regnamespace
  and prosrc ~* 'price_per_day\s*<\s*[0-9]{2,}';
select pg_temp.check('καμία συνάρτηση δεν βάζει προεπιλεγμένη τιμή στην εγγραφή',
  not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
                and proname in ('complete_registration', 'become_professional')
                and (prosrc ~ 'v_name, 210' or pg_get_function_arguments(oid) ~ 'DEFAULT 210')));

\echo '== νέος επαγγελματίας: ξεκινά χωρίς τιμή'
select pg_temp.act('authenticated', :'NEWPRO');
select complete_registration('Νέος Επαγγελματίας', null, '+306900008801', 'skipper', false);
select pg_temp.act('postgres');
select pg_temp.check('χωρίς τιμή μέχρι να τη δηλώσει ο ίδιος',
  (select price_per_day is null from skipper_profiles where user_id = :'NEWPRO'));

\echo '== ορίζει όποια τιμή θέλει'
select pg_temp.act('authenticated', :'NEWPRO');
update skipper_profiles set price_per_day = 100 where user_id = :'NEWPRO';
select pg_temp.act('postgres');
select pg_temp.check('100 € αποθηκεύεται', (select price_per_day = 100 from skipper_profiles where user_id = :'NEWPRO'));
select pg_temp.act('authenticated', :'NEWPRO');
update skipper_profiles set price_per_day = 35 where user_id = :'NEWPRO';
select pg_temp.act('postgres');
select pg_temp.check('35 € αποθηκεύεται', (select price_per_day = 35 from skipper_profiles where user_id = :'NEWPRO'));
select pg_temp.act('authenticated', :'NEWPRO');
select pg_temp.expect(format('update skipper_profiles set price_per_day = 0 where user_id = %L', :'NEWPRO'), 'invalid_price');
select pg_temp.expect(format('update skipper_profiles set price_per_day = -20 where user_id = %L', :'NEWPRO'), 'invalid_price');
select pg_temp.expect(format('update skipper_profiles set price_per_day = 6000 where user_id = %L', :'NEWPRO'), 'price_too_high');

\echo '== δεύτερος ρόλος'
select pg_temp.act('postgres');
select set_config('platform.trusted', 'true', false);
update skipper_profiles set approval_status = 'approved' where user_id = :'NEWPRO';
select set_config('platform.trusted', '', false);
select pg_temp.act('authenticated', :'NEWPRO');
insert into skipper_secondary_roles (skipper_id, role, price_per_day)
  values ((select id from skipper_profiles where user_id = :'NEWPRO'), 'cook', 80);
select pg_temp.act('postgres');
select pg_temp.check('80 € για δεύτερο ρόλο αποθηκεύεται',
  (select price_per_day = 80 from skipper_secondary_roles where skipper_id = (select id from skipper_profiles where user_id = :'NEWPRO')));

\echo '== από πελάτης σε επαγγελματία'
select pg_temp.act('authenticated', :'NEWCL1');
select complete_registration('Πελάτης Ένα', null, '+306900008802', null, false);
select become_professional('hostess', 'Χ1', 'Α', 2, 90);
select pg_temp.act('authenticated', :'NEWCL2');
select complete_registration('Πελάτης Δύο', null, '+306900008803', null, false);
select become_professional('hostess', 'Χ2', 'Α', 2);
select pg_temp.act('postgres');
select pg_temp.check('become_professional με δική του τιμή', (select price_per_day = 90 from skipper_profiles where user_id = :'NEWCL1'));
select pg_temp.check('χωρίς τιμή δεν μπαίνει καμία', (select price_per_day is null from skipper_profiles where user_id = :'NEWCL2'));

\echo '== χωρίς τιμή δεν εμφανίζεται στις αναζητήσεις'
select set_config('platform.trusted', 'true', false);
update skipper_profiles set approval_status = 'approved' where user_id = :'NEWCL2';
select set_config('platform.trusted', '', false);
select pg_temp.check('εγκεκριμένος χωρίς τιμή: όχι στην αναζήτηση',
  (select count(*) = 0 from skipper_public where id = (select id from skipper_profiles where user_id = :'NEWCL2')));
select pg_temp.check('ούτε ως ορατός στις αναζητήσεις',
  not skipper_is_search_visible((select id from skipper_profiles where user_id = :'NEWCL2')));
select pg_temp.check('με τιμή εμφανίζεται (ο NEWPRO, εγκεκριμένος, 35 €)',
  (select count(*) = 1 from skipper_public where id = (select id from skipper_profiles where user_id = :'NEWPRO') and role = 'skipper' and price_per_day = 35));

\echo '== διαχείριση: ίδιος κανόνας'
select pg_temp.act('authenticated', :'ADMIN');
select admin_update_profile(:'NEWPRO', 'Νέος Επαγγελματίας', null, 60, null, null, null);
select pg_temp.act('postgres');
select pg_temp.check('ο διαχειριστής βάζει 60 €', (select price_per_day = 60 from skipper_profiles where user_id = :'NEWPRO'));
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.expect(format('select admin_update_profile(%L, %L, null, 0, null, null, null)', :'NEWPRO', 'Νέος Επαγγελματίας'), 'invalid_price');
