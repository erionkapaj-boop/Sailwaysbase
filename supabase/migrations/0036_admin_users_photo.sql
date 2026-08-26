-- ============================================================================
-- Φωτογραφία σε κάθε γραμμή της λίστας χρηστών του admin. Ίδια προτεραιότητα
-- με το NavBar: για επαγγελματία η φωτογραφία του προφίλ του
-- (skipper_profiles.photo_url), αλλιώς η καθολική (users.photo_url, 0030).
-- ============================================================================

drop function if exists admin_list_accounts(user_role, crew_role, text, text, int, boolean);

create function admin_list_accounts(
  p_role user_role default null,
  p_crew_role crew_role default null,
  p_search text default '',
  p_sort text default 'recent',
  p_limit int default 200,
  p_invisible_only boolean default false
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
  tier skipper_tier,
  is_test_account boolean,
  photo_url text
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
    sp.tier,
    u.is_test_account,
    coalesce(sp.photo_url, u.photo_url)
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
    and (
      not p_invisible_only
      or (sp.id is not null and sp.approval_status = 'approved' and not skipper_is_search_visible(sp.id))
    )
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
grant execute on function admin_list_accounts(user_role, crew_role, text, text, int, boolean) to authenticated;
