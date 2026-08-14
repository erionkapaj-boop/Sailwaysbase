-- ============================================================================
-- The users list becomes a directory an operator can actually work from.
--
-- It listed everyone together, filtered only by the three account types, in
-- one fixed order. But "admin" is one person, "client" and "professional" are
-- different jobs to do, and a professional is a skipper *or* a hostess *or* a
-- cook — a distinction the list couldn't make at all even though the data has
-- carried it since 0012.
--
-- Two things were missing outright and are added here:
--
--   * activity. Nothing recorded whether an account had opened the app since
--     the day it registered, so there was no way to tell a live professional
--     from a dormant one — which is exactly who you'd hand short-notice work
--     to.
--
--   * age. Nowhere to put it, so it could not be asked for or sorted on.
--     Optional; sorting by it is only as useful as the number of people who
--     have filled it in.
-- ============================================================================

alter table users add column if not exists last_seen_at timestamptz;
create index if not exists users_last_seen_idx on users (last_seen_at desc nulls last);

alter table skipper_profiles add column if not exists date_of_birth date;

-- Throttled to once every five minutes: this fires on app load, and the
-- question it answers ("were they around today") does not need minute
-- precision at the cost of a write per page view.
create or replace function touch_last_seen() returns void
language sql security definer set search_path = public as $$
  update users
  set last_seen_at = now()
  where id = auth.uid()
    and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
$$;
grant execute on function touch_last_seen() to authenticated;

-- ----------------------------------------------------------------------------
-- One query behind every view of the directory.
--
-- Client and professional figures live in different tables, so they are
-- coalesced into one shape here rather than leaving the page to special-case
-- which columns exist for whom.
-- ----------------------------------------------------------------------------
create or replace function admin_list_accounts(
  p_role user_role default null,
  p_crew_role crew_role default null,
  p_search text default '',
  p_sort text default 'recent',
  p_limit int default 200
)
returns table(
  id uuid,
  role user_role,
  crew_role crew_role,
  full_name text,
  phone_number text,
  email text,
  status user_status,
  approval_status skipper_approval_status,
  created_at timestamptz,
  last_seen_at timestamptz,
  date_of_birth date,
  rating_avg numeric,
  rating_count int,
  reliability_percentage numeric,
  completed_bookings_count int,
  tier skipper_tier
)
language sql stable security definer set search_path = public as $$
  select
    u.id, u.role, sp.role,
    coalesce(nullif(sp.full_name, ''), u.full_name),
    u.phone_number, u.email, u.status, sp.approval_status,
    u.created_at, u.last_seen_at, sp.date_of_birth,
    coalesce(sp.rating_avg, cp.rating_avg),
    coalesce(sp.rating_count, cp.rating_count),
    coalesce(sp.reliability_percentage, cp.reliability_percentage),
    coalesce(sp.completed_bookings_count, cp.completed_bookings_count),
    sp.tier
  from users u
  left join skipper_profiles sp on sp.user_id = u.id and sp.deleted_at is null
  left join client_profiles cp on cp.user_id = u.id
  where is_admin()
    and (p_role is null or u.role = p_role)
    and (p_crew_role is null or sp.role = p_crew_role)
    and (
      coalesce(p_search, '') = ''
      or u.phone_number ilike '%' || p_search || '%'
      or u.full_name ilike '%' || p_search || '%'
      or sp.full_name ilike '%' || p_search || '%'
      or u.email ilike '%' || p_search || '%'
    )
  -- Only the branch matching p_sort yields a non-null key; the rest collapse
  -- to null and leave the ordering alone.
  order by
    case when p_sort = 'name' then coalesce(nullif(sp.full_name, ''), u.full_name) end asc nulls last,
    case when p_sort = 'active' then u.last_seen_at end desc nulls last,
    case when p_sort = 'rating' then
      bayesian_rating(coalesce(sp.rating_avg, cp.rating_avg), coalesce(sp.rating_count, cp.rating_count))
    end desc nulls last,
    case when p_sort = 'bookings' then coalesce(sp.completed_bookings_count, cp.completed_bookings_count) end desc nulls last,
    case when p_sort = 'age' then sp.date_of_birth end asc nulls last,
    u.created_at desc
  limit p_limit;
$$;
grant execute on function admin_list_accounts(user_role, crew_role, text, text, int) to authenticated;

-- How many people have actually been around lately, for the overview.
create or replace function admin_activity_counts()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_admin() then null else jsonb_build_object(
    'active_24h', (select count(*) from users where role <> 'admin' and last_seen_at > now() - interval '24 hours'),
    'active_7d',  (select count(*) from users where role <> 'admin' and last_seen_at > now() - interval '7 days'),
    'active_30d', (select count(*) from users where role <> 'admin' and last_seen_at > now() - interval '30 days'),
    'never_seen', (select count(*) from users where role <> 'admin' and last_seen_at is null)
  ) end;
$$;
grant execute on function admin_activity_counts() to authenticated;
