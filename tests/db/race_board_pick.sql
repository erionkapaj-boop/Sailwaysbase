-- Ο πελάτης διαλέγει τον ίδιο επαγγελματία (1 credit) σε δύο αιτήματα την ίδια
-- στιγμή· μία μόνο επιλογή μπορεί να πετύχει.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;
begin;
select pg_sleep(0.3);
select client_choose_board_claim(:'claim');
select pg_sleep(0.5);
commit;
