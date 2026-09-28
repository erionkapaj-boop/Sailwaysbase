-- 0114: περίοδοι διαθεσιμότητας ανά περιοχή· νέα περίοδος πάνω σε
-- υπάρχουσα αλλάζει μόνο τις κοινές μέρες.
\i tests/db/helpers.sql
\set SP_NIKOS 'b0000000-0000-0000-0000-000000000003'
select pg_temp.act('postgres');
select id as ionio from regions where name = 'Ιόνιο' \gset
select id as saron from regions where name = 'Σαρωνικός' \gset
select id as kykl from regions where name = 'Κυκλάδες' \gset
delete from availability_windows where skipper_id = :'SP_NIKOS';

-- Περιοχές μιας ημέρας για τον Νίκο.
create or replace function pg_temp.regions_on(d date) returns text language sql as $$
  select coalesce(string_agg(r.name, ',' order by r.name), '-')
    from availability_windows w
    join availability_window_regions wr on wr.window_id = w.id
    join regions r on r.id = wr.region_id
   where w.skipper_id = 'b0000000-0000-0000-0000-000000000003' and d between w.start_date and w.end_date
$$;

select pg_temp.act('authenticated', :'NIKOS');
\echo '== περίοδοι σε διαφορετικές περιοχές'
select set_availability_period(current_date + 10, current_date + 40, array[:'ionio']::uuid[]) is not null;
select set_availability_period(current_date + 50, current_date + 80, array[:'saron']::uuid[]) is not null;
select pg_temp.check('Ιόνιο στην πρώτη, Σαρωνικός στη δεύτερη',
  pg_temp.regions_on(current_date + 20) = 'Ιόνιο' and pg_temp.regions_on(current_date + 60) = 'Σαρωνικός' and pg_temp.regions_on(current_date + 45) = '-');

\echo '== νέα περίοδος στη μέση: η παλιά σπάει στα δύο'
select set_availability_period(current_date + 20, current_date + 26, array[:'kykl']::uuid[]) is not null;
select pg_temp.check('πριν: Ιόνιο · μέσα: Κυκλάδες · μετά: Ιόνιο',
  pg_temp.regions_on(current_date + 19) = 'Ιόνιο' and pg_temp.regions_on(current_date + 20) = 'Κυκλάδες'
  and pg_temp.regions_on(current_date + 26) = 'Κυκλάδες' and pg_temp.regions_on(current_date + 27) = 'Ιόνιο');
select pg_temp.check('καμία ημέρα με δύο περιόδους', not exists (
  select 1 from generate_series(current_date, current_date + 90, interval '1 day') d
   where (select count(*) from availability_windows w where w.skipper_id = :'SP_NIKOS' and d::date between w.start_date and w.end_date) > 1));

\echo '== επικάλυψη στην άκρη: κόβεται μόνο το κοινό κομμάτι'
select set_availability_period(current_date + 75, current_date + 90, array[:'kykl', :'saron']::uuid[]) is not null;
select pg_temp.check('ο Σαρωνικός τελειώνει εκεί που αρχίζει η νέα',
  pg_temp.regions_on(current_date + 74) = 'Σαρωνικός' and pg_temp.regions_on(current_date + 75) = 'Κυκλάδες,Σαρωνικός');

\echo '== αλλαγή υπάρχουσας περιόδου'
select id as w_mid from availability_windows where skipper_id = :'SP_NIKOS' and start_date = current_date + 20 \gset
select set_availability_period(current_date + 21, current_date + 24, array[:'saron']::uuid[], null, :'w_mid') is not null;
select pg_temp.check('άλλαξαν ημερομηνίες και περιοχή· οι μέρες που βγήκαν έμειναν κενές',
  pg_temp.regions_on(current_date + 22) = 'Σαρωνικός' and pg_temp.regions_on(current_date + 20) = '-');

\echo '== έλεγχοι'
select pg_temp.expect(format('select set_availability_period(current_date - 1, current_date + 3, array[%L]::uuid[])', :'ionio'), 'date_in_past');
select pg_temp.expect(format('select set_availability_period(current_date + 5, current_date + 3, array[%L]::uuid[])', :'ionio'), 'invalid_dates');
select pg_temp.expect('select set_availability_period(current_date + 1, current_date + 3, array[]::uuid[])', 'region_required');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.expect(format('select set_availability_period(current_date + 1, current_date + 3, array[%L]::uuid[], null, %L)', :'ionio', :'w_mid'), 'window_not_found');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect(format('select set_availability_period(current_date + 1, current_date + 3, array[%L]::uuid[])', :'ionio'), 'not_professional');

\echo '== η αναζήτηση ακολουθεί την περιοχή της περιόδου'
select pg_temp.act('postgres');
select pg_temp.check('στο Ιόνιο διαθέσιμος τις μέρες του Ιονίου, όχι του Σαρωνικού',
  coalesce(net_availability(:'SP_NIKOS', null, :'ionio', 'skipper') @> daterange(current_date + 12, current_date + 14, '[]'), false)
  and not coalesce(net_availability(:'SP_NIKOS', null, :'ionio', 'skipper') @> daterange(current_date + 60, current_date + 62, '[]'), false));

-- επαναφορά όπως στο seed
delete from availability_windows where skipper_id = :'SP_NIKOS';
with w as (insert into availability_windows (skipper_id, start_date, end_date) values (:'SP_NIKOS', current_date + 5, current_date + 40) returning id)
insert into availability_window_regions select w.id, :'kykl' from w;
