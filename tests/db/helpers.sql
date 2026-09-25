-- Shared helpers, loaded at the top of every *.test.sql file.
--
-- act('authenticated', <user id>) / act('anon') switch to the real API role
-- with that user's JWT claims, so row-level security and function grants
-- apply exactly as they do through Supabase. act('postgres') switches back
-- for setup and for checks that need to read everyone's rows.
--
-- Output contract (read by run.sh): every assertion prints one line starting
-- with "ok   " or "FAIL ". Any line containing "ERROR" also fails the run.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.act(p_role text, p_uid uuid default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  perform set_config('request.jwt.claims',
    case when p_role = 'postgres' then '' else json_build_object('sub', p_uid, 'role', p_role)::text end, false);
  if p_role <> 'postgres' then
    perform set_config('role', p_role, false);
  end if;
end $$;

-- Runs a statement that must fail; passes when the error message matches.
create or replace function pg_temp.expect(p_sql text, p_error text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'FAIL (expected error ' || p_error || ', got none): ' || left(p_sql, 120);
exception when others then
  return case when sqlerrm = p_error or sqlerrm like p_error
    then 'ok   rejected: ' || p_error
    else 'FAIL expected ' || p_error || ' got: ' || sqlerrm end;
end $$;

create or replace function pg_temp.check(p_label text, p_cond boolean) returns text language sql as $$
  select case when coalesce(p_cond, false) then 'ok   ' else 'FAIL ' end || p_label
$$;

create or replace function pg_temp.wallet(p_name text) returns numeric language sql as $$
  select wallet_balance from users where full_name = p_name
$$;
create or replace function pg_temp.sp(p_name text) returns uuid language sql as $$
  select id from skipper_profiles where full_name = p_name
$$;

\set ADMIN   'a0000000-0000-0000-0000-000000000001'
\set CLIENT  'a0000000-0000-0000-0000-000000000002'
\set NIKOS   'a0000000-0000-0000-0000-000000000003'
\set GIORGOS 'a0000000-0000-0000-0000-000000000004'
\set KOSTAS  'a0000000-0000-0000-0000-000000000005'
\set ELENI   'a0000000-0000-0000-0000-000000000006'
\set PETROS  'a0000000-0000-0000-0000-000000000007'
\set SOFIA   'a0000000-0000-0000-0000-000000000008'
