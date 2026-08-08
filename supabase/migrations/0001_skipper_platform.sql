-- ============================================================================
-- Skipper <-> Client booking platform — initial schema
-- Isolated from the pre-existing "kv" table used by the base task-management
-- app: no table/function name below collides with it, nothing here touches it.
--
-- Based on data-model-v1.md / functional-spec-v1(v2).md. Deviations from the
-- doc, and why, are called out inline with "DEVIATION:".
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- EXCLUDE ... USING gist on (uuid, daterange)

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type user_role as enum ('client', 'skipper', 'admin');
create type user_status as enum ('active', 'suspended', 'deleted');
create type skipper_approval_status as enum ('pending', 'approved', 'rejected');
create type skipper_tier as enum ('high', 'medium', 'low');
create type booking_request_status as enum ('open', 'matched', 'expired_unclaimed', 'cancelled');
create type ping_status as enum ('pending', 'claimed', 'missed');
create type booking_status as enum ('confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_skipper');
create type at_fault_party as enum ('client', 'skipper');
create type wallet_txn_type as enum ('deposit', 'request_fee', 'claim_fee', 'refund_credit');
create type admin_action_type as enum ('approve_skipper', 'reject_skipper', 'resolve_dispute', 'ban_account', 'edit_booking', 'confirm_wallet_topup');

-- ----------------------------------------------------------------------------
-- platform_settings — amounts/durations the spec marks as TBD (§11).
-- Kept adjustable without a redeploy instead of hardcoding.
-- ----------------------------------------------------------------------------
create table platform_settings (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);
insert into platform_settings (key, value) values
  ('client_request_fee', 15),
  ('skipper_claim_fee', 25),
  ('unclaimed_expiry_hours', 48),
  ('cancellation_flag_review_threshold', 3);

-- ----------------------------------------------------------------------------
-- 1. users — public.users mirrors auth.users 1:1, id shared with Supabase Auth
-- ----------------------------------------------------------------------------
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  phone_number text not null unique,
  phone_verified_at timestamptz,
  email text,
  status user_status not null default 'active',
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from users where id = auth.uid() and role = 'admin');
$$;

-- ----------------------------------------------------------------------------
-- 2. client_profiles
-- ----------------------------------------------------------------------------
create table client_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  rating_avg numeric,
  rating_count int not null default 0,
  completed_bookings_count int not null default 0,
  cancellation_flag_count int not null default 0,
  reliability_percentage numeric generated always as (
    case when (completed_bookings_count + cancellation_flag_count) = 0 then null
    else round(completed_bookings_count::numeric / (completed_bookings_count + cancellation_flag_count) * 100, 1)
    end
  ) stored,
  wallet_balance numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. skipper_profiles
-- DEVIATION: PK is a surrogate `id`, not `user_id`. A skipper's permanent
-- identity is (license_number, full_name) per §3 — the *login account*
-- (user_id) can change on re-registration after a soft-delete. Keeping `id`
-- stable lets every historical FK (bookings, reviews, pings...) stay intact
-- while an admin re-links a returning skipper's new auth account to their
-- old history by updating skipper_profiles.user_id, see restore logic in
-- 0002_functions.sql / the admin approve API route.
-- ----------------------------------------------------------------------------
create table skipper_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  full_name text not null,
  license_number text not null unique,
  license_type text not null,
  gender text,
  photo_url text,
  bio jsonb not null default '[]'::jsonb, -- structured tags, never free text (§11)
  years_experience int not null default 0,
  price_per_day numeric not null check (price_per_day >= 210),
  rating_avg numeric,
  rating_count int not null default 0,
  completed_bookings_count int not null default 0,
  cancellation_flag_count int not null default 0,
  reliability_percentage numeric generated always as (
    case when (completed_bookings_count + cancellation_flag_count) = 0 then null
    else round(completed_bookings_count::numeric / (completed_bookings_count + cancellation_flag_count) * 100, 1)
    end
  ) stored,
  tier skipper_tier not null default 'medium',
  wallet_balance numeric not null default 0,
  approval_status skipper_approval_status not null default 'pending',
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index skipper_profiles_license_idx on skipper_profiles (license_number);
create index skipper_profiles_search_idx on skipper_profiles (approval_status, deleted_at);

-- ----------------------------------------------------------------------------
-- 4-6. lookups + joins
-- ----------------------------------------------------------------------------
create table languages (id uuid primary key default gen_random_uuid(), name text not null unique);
create table skipper_languages (
  skipper_id uuid not null references skipper_profiles(id) on delete cascade,
  language_id uuid not null references languages(id) on delete cascade,
  primary key (skipper_id, language_id)
);

create table boat_types (id uuid primary key default gen_random_uuid(), name text not null unique);
create table skipper_boat_types (
  skipper_id uuid not null references skipper_profiles(id) on delete cascade,
  boat_type_id uuid not null references boat_types(id) on delete cascade,
  primary key (skipper_id, boat_type_id)
);

create table ports (id uuid primary key default gen_random_uuid(), name text not null unique, region text);
create table skipper_coverage_areas (
  skipper_id uuid not null references skipper_profiles(id) on delete cascade,
  port_id uuid not null references ports(id) on delete cascade,
  primary key (skipper_id, port_id)
);

-- ----------------------------------------------------------------------------
-- 7. skipper_availability — blackout calendar
-- ----------------------------------------------------------------------------
create table skipper_availability (
  id uuid primary key default gen_random_uuid(),
  skipper_id uuid not null references skipper_profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  created_at timestamptz not null default now()
);
create index skipper_availability_skipper_idx on skipper_availability (skipper_id, start_date, end_date);

-- ----------------------------------------------------------------------------
-- 8. booking_requests
-- ----------------------------------------------------------------------------
create table booking_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client_profiles(user_id),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  port_id uuid not null references ports(id),
  boat_type_id uuid not null references boat_types(id),
  max_price_filter numeric,
  gender_filter text,
  fee_amount numeric not null,
  fee_paid_at timestamptz,
  status booking_request_status not null default 'open',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index booking_requests_client_idx on booking_requests (client_id);
create index booking_requests_status_idx on booking_requests (status);

-- ----------------------------------------------------------------------------
-- 9. booking_request_pings
-- ----------------------------------------------------------------------------
create table booking_request_pings (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references booking_requests(id) on delete cascade,
  skipper_id uuid not null references skipper_profiles(id),
  sent_at timestamptz not null default now(),
  status ping_status not null default 'pending',
  unique (booking_request_id, skipper_id)
);
create index booking_request_pings_skipper_idx on booking_request_pings (skipper_id, status);

-- ----------------------------------------------------------------------------
-- 10. bookings
-- ----------------------------------------------------------------------------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null unique references booking_requests(id),
  client_id uuid not null references client_profiles(user_id),
  skipper_id uuid not null references skipper_profiles(id),
  start_date date not null,
  end_date date not null,
  port_id uuid not null references ports(id),
  boat_type_id uuid not null references boat_types(id),
  skipper_claim_fee_amount numeric not null,
  skipper_claim_paid_at timestamptz not null default now(),
  confirmed_at timestamptz,
  status booking_status not null default 'confirmed',
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  -- Critical integrity constraint from the data model: no two confirmed/
  -- completed bookings for the same skipper may have overlapping dates.
  -- Enforced at the DB level (not just app logic) so it holds even under
  -- concurrent claims.
  exclude using gist (
    skipper_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('confirmed', 'completed'))
);
create index bookings_skipper_idx on bookings (skipper_id, status);
create index bookings_client_idx on bookings (client_id);

-- ----------------------------------------------------------------------------
-- 11. reviews
-- ----------------------------------------------------------------------------
create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  reviewer_id uuid not null references users(id),
  reviewee_id uuid not null references users(id),
  rating int not null check (rating between 1 and 5),
  comment text,
  reply text check (char_length(reply) <= 500),
  created_at timestamptz not null default now(),
  unique (booking_id, reviewer_id)
);

create or replace function enforce_review_after_end_date() returns trigger
language plpgsql as $$
declare v_end date;
begin
  select end_date into v_end from bookings where id = new.booking_id;
  if v_end is null or v_end >= current_date then
    raise exception 'review_not_allowed_before_end_date';
  end if;
  return new;
end;
$$;
create trigger trg_review_after_end_date
  before insert on reviews
  for each row execute function enforce_review_after_end_date();

-- ----------------------------------------------------------------------------
-- 12. cancellation_reports
-- ----------------------------------------------------------------------------
create table cancellation_reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  reported_by uuid not null references users(id),
  at_fault_party at_fault_party not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 13. wallet_transactions
-- ----------------------------------------------------------------------------
create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  type wallet_txn_type not null,
  amount numeric not null,
  related_booking_request_id uuid references booking_requests(id),
  related_booking_id uuid references bookings(id),
  created_at timestamptz not null default now()
);
create index wallet_transactions_user_idx on wallet_transactions (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 14. messages
-- ----------------------------------------------------------------------------
create table messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  sender_id uuid not null references users(id),
  content text not null,
  sent_at timestamptz not null default now()
);
create index messages_booking_idx on messages (booking_id, sent_at);

-- ----------------------------------------------------------------------------
-- 15. admin_actions
-- ----------------------------------------------------------------------------
create table admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references users(id),
  action_type admin_action_type not null,
  target_user_id uuid references users(id),
  target_booking_id uuid references bookings(id),
  notes text,
  created_at timestamptz not null default now()
);
