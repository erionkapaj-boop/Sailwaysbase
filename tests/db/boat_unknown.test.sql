-- «Δεν ξέρω ακόμα» (0131): αναζήτηση skipper χωρίς τύπο σκάφους δεν φιλτράρει ανά σκάφος,
-- και το αίτημα αποθηκεύεται με boat_type_id null.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset

select pg_temp.act('authenticated', :'CLIENT');
select count(*) as with_type from search_available_skippers(current_date + 10, current_date + 12, :'cyclades', :'sailboat') \gset
select count(*) as without_type from search_available_skippers(current_date + 10, current_date + 12, :'cyclades', null) \gset
select pg_temp.check('χωρίς τύπο σκάφους βρίσκονται επαγγελματίες', :without_type > 0);
select pg_temp.check('χωρίς τύπο βρίσκονται τουλάχιστον όσοι με τύπο', :without_type >= :with_type);

\echo '== αίτημα χωρίς τύπο σκάφους'
select (post_open_request(current_date + 20, current_date + 22, :'cyclades', 'Νάξος', 'Νάξος', null, 'skipper', 2)).id as rn \gset
select pg_temp.act('postgres');
select pg_temp.check('το αίτημα αποθηκεύτηκε με boat_type_id null', (select boat_type_id is null from booking_requests where id = :'rn'));
