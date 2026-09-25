-- One of two clients picking at the same moment; each holds its transaction
-- open for a moment so the two genuinely overlap. Exactly one may win.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;
begin;
select pg_sleep(0.3);
select client_select_replacement_candidate(:'req', :'sp');
select pg_sleep(0.5);
commit;
