-- scripts/sql/test_professionals_available.sql: οι δοκιμαστικοί επαγγελματίες
-- γίνονται διαθέσιμοι παντού για 2026–2027, οι πραγματικοί μένουν ανέγγιχτοι,
-- και το script είναι ασφαλές να τρέξει ξανά.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
select id as boat from boat_types limit 1 \gset
select count(*) as nregions from regions \gset
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as crete from regions where name = 'Κρήτη' \gset

-- 4 δοκιμαστικοί (ένας ανά ρόλο), 1 πραγματικός, 1 πελάτης δοκιμαστικού κόσμου.
insert into auth.users (id, phone) values
  ('e0000000-0000-0000-0000-0000000a0001', '306980000091'),
  ('e0000000-0000-0000-0000-0000000a0002', '306980000092'),
  ('e0000000-0000-0000-0000-0000000a0003', '306980000093'),
  ('e0000000-0000-0000-0000-0000000a0004', '306980000094'),
  ('e0000000-0000-0000-0000-0000000a0005', '306900008891'),
  ('e0000000-0000-0000-0000-0000000a0006', '306980000096');
\set TSK 'e0000000-0000-0000-0000-0000000a0001'
\set THO 'e0000000-0000-0000-0000-0000000a0002'
\set TCO 'e0000000-0000-0000-0000-0000000a0003'
\set TDE 'e0000000-0000-0000-0000-0000000a0004'
\set REAL 'e0000000-0000-0000-0000-0000000a0005'
\set TCL 'e0000000-0000-0000-0000-0000000a0006'

select pg_temp.act('authenticated', :'TSK'); select complete_registration('Δοκιμαστικός Skipper', null, '+306980000091', 'skipper', false);
select pg_temp.act('authenticated', :'THO'); select complete_registration('Δοκιμαστική Hostess', null, '+306980000092', 'hostess', false);
select pg_temp.act('authenticated', :'TCO'); select complete_registration('Δοκιμαστικός Cook', null, '+306980000093', 'cook', false);
select pg_temp.act('authenticated', :'TDE'); select complete_registration('Δοκιμαστικός Ναύτης', null, '+306980000094', 'deckhand', false);
select pg_temp.act('authenticated', :'REAL'); select complete_registration('Πραγματικός Skipper', null, '+306900008891', 'skipper', false);
select pg_temp.act('authenticated', :'TCL'); select complete_registration('Δοκιμαστικός Πελάτης', null, '+306980000096', null, false);

-- Ορατοί στην αναζήτηση για όλα τα υπόλοιπα (έγκριση, τιμή, τύπος σκάφους).
select pg_temp.act('postgres');
select set_config('platform.trusted', 'true', false);
update skipper_profiles set approval_status = 'approved', price_per_day = 200, years_experience = 5 where user_id in (:'TSK', :'THO', :'TCO', :'TDE', :'REAL');
select set_config('platform.trusted', '', false);
insert into skipper_boat_types (skipper_id, boat_type_id)
  select id, :'boat' from skipper_profiles where user_id in (:'TSK', :'REAL');
-- Ο δοκιμαστικός skipper έχει και δεύτερο ρόλο (μάγειρας).
select set_config('platform.trusted', 'true', false);
insert into skipper_secondary_roles (skipper_id, role, price_per_day, approval_status)
  select id, 'cook', 90, 'approved' from skipper_profiles where user_id = :'TSK';
select set_config('platform.trusted', '', false);
-- Υπάρχουσα στενή διαθεσιμότητα (μόνο Κρήτη, 10 μέρες) και μία απουσία.
insert into availability_windows (skipper_id, start_date, end_date)
  select id, current_date + 5, current_date + 15 from skipper_profiles where user_id in (:'TSK', :'REAL');
insert into availability_window_regions (window_id, region_id)
  select w.id, :'crete' from availability_windows w join skipper_profiles sp on sp.id = w.skipper_id where sp.user_id in (:'TSK', :'REAL');
insert into availability_blocks (skipper_id, start_date, end_date)
  select id, current_date + 400, current_date + 410 from skipper_profiles where user_id = :'TSK';

select id as sp_tsk from skipper_profiles where user_id = :'TSK' \gset
select id as sp_tho from skipper_profiles where user_id = :'THO' \gset
select id as sp_tco from skipper_profiles where user_id = :'TCO' \gset
select id as sp_tde from skipper_profiles where user_id = :'TDE' \gset

select count(*) as windows_real_before from availability_windows w join skipper_profiles sp on sp.id = w.skipper_id where sp.user_id = :'REAL' \gset

\echo '== πριν: ο δοκιμαστικός skipper δεν βρίσκεται στις Κυκλάδες'
select pg_temp.act('authenticated', :'TCL');
select pg_temp.check('δεν βρίσκεται Κυκλάδες πριν',
  not exists (select 1 from search_available_skippers(current_date + 100, current_date + 104, :'cyclades', :'boat', null, null, 'skipper')));

\echo '== εκτέλεση του script'
select pg_temp.act('postgres');
\o /dev/null
\i scripts/sql/test_professionals_available.sql
\o
select count(*) as windows_after_1 from availability_windows w join skipper_profiles sp on sp.id = w.skipper_id join users u on u.id = sp.user_id where u.id in (:'TSK', :'THO', :'TCO', :'TDE') \gset
select pg_temp.check('μία νέα περίοδος ανά δοκιμαστικό (4 + 1 υπάρχουσα του skipper)', :windows_after_1 = 5);
select pg_temp.check('η περίοδος καλύπτει όλες τις περιοχές',
  (select count(*) from availability_window_regions wr join availability_windows w on w.id = wr.window_id join skipper_profiles sp on sp.id = w.skipper_id
     where sp.user_id = :'THO') = :nregions);
select pg_temp.check('λήγει 31/12/2027 και ξεκινά σήμερα',
  exists (select 1 from availability_windows w join skipper_profiles sp on sp.id = w.skipper_id
            where sp.user_id = :'THO' and w.start_date = current_date and w.end_date = date '2027-12-31' and w.crew_role is null));
select pg_temp.check('ο πραγματικός επαγγελματίας δεν άλλαξε',
  (select count(*) from availability_windows w join skipper_profiles sp on sp.id = w.skipper_id where sp.user_id = :'REAL') = :windows_real_before);

\echo '== μετά: βρίσκονται όλοι, σε κάθε ρόλο και περιοχή'
select pg_temp.act('authenticated', :'TCL');
select pg_temp.check('skipper · Κυκλάδες 2026',
  exists (select 1 from search_available_skippers(current_date + 100, current_date + 104, :'cyclades', :'boat', null, null, 'skipper') s where s.id = :'sp_tsk'));
select pg_temp.check('skipper · Κρήτη 2027',
  exists (select 1 from search_available_skippers(date '2027-08-10', date '2027-08-14', :'crete', :'boat', null, null, 'skipper') s where s.id = :'sp_tsk'));
select pg_temp.check('hostess · Κυκλάδες 2027',
  exists (select 1 from search_available_skippers(date '2027-06-01', date '2027-06-08', :'cyclades', :'boat', null, null, 'hostess') s where s.id = :'sp_tho'));
select pg_temp.check('cook · Κρήτη 2026-27 (κύριος ρόλος)',
  exists (select 1 from search_available_skippers(date '2027-01-02', date '2027-01-06', :'crete', :'boat', null, null, 'cook') s where s.id = :'sp_tco'));
select pg_temp.check('deckhand · Κρήτη',
  exists (select 1 from search_available_skippers(current_date + 30, current_date + 33, :'crete', :'boat', null, null, 'deckhand') s where s.id = :'sp_tde'));
select pg_temp.check('δεύτερος ρόλος (cook του skipper) · Κυκλάδες',
  exists (select 1 from search_available_skippers(current_date + 200, current_date + 203, :'cyclades', :'boat', null, null, 'cook') s where s.id = :'sp_tsk'));
select pg_temp.check('πέρα από 31/12/2027 δεν υπάρχει διαθεσιμότητα',
  not exists (select 1 from search_available_skippers(date '2028-01-10', date '2028-01-14', :'cyclades', :'boat', null, null, 'hostess') s where s.id = :'sp_tho'));
select pg_temp.check('η απουσία του μένει: δεν βρίσκεται μέσα της',
  not exists (select 1 from search_available_skippers(current_date + 402, current_date + 405, :'cyclades', :'boat', null, null, 'skipper') s where s.id = :'sp_tsk'));

\echo '== δεύτερη εκτέλεση: τίποτα νέο'
select pg_temp.act('postgres');
select count(*) as total_before from availability_windows \gset
\o /dev/null
\i scripts/sql/test_professionals_available.sql
\o
select pg_temp.check('καμία διπλή περίοδος', (select count(*) from availability_windows) = :total_before);
