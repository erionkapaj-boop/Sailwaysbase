-- ============================================================================
-- Auth & registration (auth-pin-plan-v1).
--
-- Extends Supabase Auth rather than replacing it: the PIN *is* the password on
-- auth.users, so hashing, storage and verification stay with Supabase. What
-- lives here is only what Supabase can't know about — our profile columns, the
-- duplicate-email flag, the attempt counter, and email reset codes.
--
-- NOTE ON ENUMS: Postgres won't let a value added by ALTER TYPE be *used* in
-- the same transaction that adds it. The Supabase SQL editor runs a script as
-- one transaction, so 'draft' is only added here — nothing below may reference
-- it. Application code starts using it on the next request, which is fine.
-- ============================================================================

alter type user_status add value if not exists 'draft';

-- ----------------------------------------------------------------------------
-- users: full name from the shared registration form.
-- `email` already exists (0001) and stays plain: no unique constraint and no
-- verification, per the plan — duplicates raise an admin flag instead of
-- blocking anyone.
-- ----------------------------------------------------------------------------
alter table users add column if not exists full_name text;

-- ----------------------------------------------------------------------------
-- Skippers are now identified by phone, not by licence. The platform has
-- stepped out of licence verification entirely, so license_number can no
-- longer be required.
--
-- TRADE-OFF (worth being explicit about): the original spec used
-- licence+name as a permanent identity so a skipper couldn't delete and
-- re-register to shed flags or a low tier. A phone number is far easier to
-- change than a licence, so that protection is materially weaker now.
-- admin_approve_skipper still merges history when a licence *is* present, so
-- the old path keeps working for anyone who supplies one.
-- ----------------------------------------------------------------------------
alter table skipper_profiles alter column license_number drop not null;
alter table skipper_profiles alter column license_type drop not null;

-- ----------------------------------------------------------------------------
-- admin_flags — internal signals for the admin, never shown to the user and
-- never blocking a flow.
-- ----------------------------------------------------------------------------
do $$ begin
  create type admin_flag_type as enum ('duplicate_email');
exception when duplicate_object then null;
end $$;

create table if not exists admin_flags (
  id uuid primary key default gen_random_uuid(),
  type admin_flag_type not null,
  user_id uuid not null references users(id) on delete cascade,
  related_user_id uuid references users(id) on delete cascade,
  detail jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_flags_open_idx on admin_flags (resolved_at, created_at desc);

-- Runs after a user row lands; if the same email is already on another active
-- account, record it for the admin. Deliberately silent to the registrant.
create or replace function check_duplicate_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_other uuid;
begin
  if new.email is null or btrim(new.email) = '' then
    return new;
  end if;

  select id into v_other
  from users
  where id <> new.id
    and lower(email) = lower(new.email)
    and status <> 'deleted'
  limit 1;

  if found then
    insert into admin_flags (type, user_id, related_user_id, detail)
    values ('duplicate_email', new.id, v_other, jsonb_build_object('email', new.email));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_duplicate_email on users;
create trigger trg_check_duplicate_email
  after insert or update of email on users
  for each row execute function check_duplicate_email();

-- ----------------------------------------------------------------------------
-- login_attempts — consecutive-failure counter driving the hard block.
--
-- SCOPE: this is a UX guard, not a security control. Supabase's auth endpoint
-- is reachable directly with the anon key, so an attacker who ignores our UI
-- also ignores this counter; Supabase's own built-in rate limiting is what
-- actually defends the endpoint. Enforcing our 3-attempt rule for real would
-- mean routing sign-in through an Edge Function that alone holds the service
-- key — a larger change, noted rather than assumed.
-- ----------------------------------------------------------------------------
create table if not exists login_attempts (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_phone_idx on login_attempts (phone, created_at desc);

-- true = may still try; false = blocked until a PIN reset.
create or replace function check_login_rate_limit(p_phone text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_fails int;
begin
  select count(*) into v_fails
  from login_attempts
  where phone = p_phone
    and success = false
    and created_at > coalesce(
      (select max(created_at) from login_attempts where phone = p_phone and success = true),
      '-infinity'::timestamptz
    );
  return v_fails < 3;
end;
$$;

-- Called after a successful PIN reset so the user isn't still locked out.
create or replace function clear_login_attempts(p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into login_attempts (phone, success) values (p_phone, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- email_reset_codes — the email arm of "forgot PIN". Supabase can't help here
-- because the email was never verified through it.
--
-- Only a hash of the code is stored, so a leak of this table doesn't hand
-- anyone a working reset.
-- ----------------------------------------------------------------------------
create table if not exists email_reset_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_reset_codes_user_idx on email_reset_codes (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table admin_flags enable row level security;
alter table login_attempts enable row level security;
alter table email_reset_codes enable row level security;

drop policy if exists "admin flags admin only" on admin_flags;
create policy "admin flags admin only" on admin_flags for all
  using (is_admin()) with check (is_admin());

-- Anyone signing in must be able to log an attempt, including before they have
-- a session. Reads stay closed: the counter is only ever consulted through
-- check_login_rate_limit(), which is SECURITY DEFINER.
drop policy if exists "login attempts insert only" on login_attempts;
create policy "login attempts insert only" on login_attempts for insert with check (true);

drop policy if exists "login attempts admin read" on login_attempts;
create policy "login attempts admin read" on login_attempts for select using (is_admin());

-- Codes are handled exclusively through SECURITY DEFINER functions; no direct
-- client access, or the hash comparison could be sidestepped.
drop policy if exists "reset codes admin read" on email_reset_codes;
create policy "reset codes admin read" on email_reset_codes for select using (is_admin());

grant execute on function check_login_rate_limit, clear_login_attempts to anon, authenticated;
