-- ============================================================================
-- Explicit table/function privileges for anon + authenticated.
--
-- RLS (enabled on every table in 0003_rls.sql) is what actually decides
-- which ROWS a role can see/change — but a role also needs a base
-- privilege grant to attempt the query at all, otherwise Postgres returns
-- zero rows (SELECT) or a permission error (INSERT/UPDATE) before RLS is
-- even evaluated. Supabase normally wires this up automatically for new
-- tables; this makes it explicit so it doesn't depend on that. Safe to
-- grant broadly because RLS still fully applies underneath for anon and
-- authenticated (neither role bypasses RLS the way service_role does).
-- ============================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- so any table/function added by future migrations keeps working the same way
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
