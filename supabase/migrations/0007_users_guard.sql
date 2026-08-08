-- ============================================================================
-- Close a privilege-escalation gap: the "user updates own row" policy on
-- `users` has no column restriction, so an authenticated client could call
-- .update({ role: 'admin' }) on their own row directly. Lock role/status the
-- same way 0006_guards.sql locks skipper_profiles/client_profiles.
--
-- Also relaxes all three guards to allow changes when auth.uid() is null —
-- that only happens for requests with no user JWT at all (the Supabase SQL
-- editor, or the service_role key), never for a normal authenticated client
-- call, since auth.uid() there is always pinned to the caller's own JWT.
-- This is what makes the admin-bootstrap script below work without having
-- to flip the trusted flag by hand.
-- ============================================================================

create or replace function guard_users_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.role := old.role;
  new.status := old.status;
  return new;
end;
$$;
create trigger trg_guard_users
  before update on users
  for each row execute function guard_users_privileged_columns();

create or replace function guard_skipper_profile_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.approval_status := old.approval_status;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.wallet_balance := old.wallet_balance;
  new.tier := old.tier;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  new.user_id := old.user_id;
  new.deleted_at := old.deleted_at;
  return new;
end;
$$;

create or replace function guard_client_profile_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.wallet_balance := old.wallet_balance;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  return new;
end;
$$;
