-- Un επαγγελματίας με 1 credit διεκδικεί δύο αιτήματα του ίδιου πελάτη, ώστε
-- να διαλεχτεί ταυτόχρονα και στα δύο (βλ. run.sh, βήμα 4b).
\i tests/db/helpers.sql
select pg_temp.act('postgres');
select id as cyclades from regions where name = 'Κυκλάδες' \gset
select id as sailboat from boat_types where name = 'Ιστιοπλοϊκό' \gset
select pg_temp.act('authenticated', :'ADMIN');
select admin_adjust_wallet(:'KOSTAS', -101, 'Τεστ');
select pg_temp.act('authenticated', :'CLIENT');
select (post_open_request(current_date + 10, current_date + 12, :'cyclades', 'Νάξος', 'Νάξος', :'sailboat', 'skipper', 2, null, null)).id as r1 \gset
select (post_open_request(current_date + 30, current_date + 32, :'cyclades', 'Πάρος', 'Πάρος', :'sailboat', 'skipper', 2, null, null)).id as r2 \gset
select pg_temp.act('authenticated', :'KOSTAS');
select claim_board_request(:'r1', 'b0000000-0000-0000-0000-000000000005');
select claim_board_request(:'r2', 'b0000000-0000-0000-0000-000000000005');
select pg_temp.act('postgres');
