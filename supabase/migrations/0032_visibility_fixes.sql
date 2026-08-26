-- ============================================================================
-- Δύο διορθώσεις γύρω από την «ορατότητα» επαγγελματιών στην αναζήτηση:
--
-- 1) Το κουτί «εγκεκριμένοι χωρίς διαθεσιμότητα» στην Επισκόπηση admin
--    μετρούσε ΜΟΝΟ την απουσία διαθεσιμότητας, ενώ η πραγματική αναζήτηση
--    (search_available_skippers) απαιτεί επίσης δηλωμένο τύπο σκάφους. Ένας
--    εγκεκριμένος με διαθεσιμότητα αλλά χωρίς τύπο σκάφους ήταν εξίσου
--    αόρατος και δεν τον έπιανε καθόλου αυτό το κουτί.
--
-- 2) Ο σύνδεσμος του κουτιού πήγαινε σε
--    /platform/admin/users?filter=invisible, αλλά καμία συνάρτηση δεν ήξερε
--    τι σημαίνει «invisible» — η σελίδα έδειχνε απλά όλους τους χρήστες.
--
-- Και τα δύο μοιράζονται τώρα τον ίδιο ορισμό του «ορατός», ώστε να μην
-- ξαναγραφτεί σε τρίτο σημείο με ελαφρώς διαφορετική λογική.
-- ============================================================================

create or replace function skipper_is_search_visible(p_skipper_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from skipper_profiles sp
    where sp.id = p_skipper_id
      and sp.approval_status = 'approved'
      and sp.deleted_at is null
      and has_future_availability(sp.id)
      and exists (select 1 from skipper_boat_types bt where bt.skipper_id = sp.id)
  );
$$;
grant execute on function skipper_is_search_visible(uuid) to authenticated;

create or replace function admin_overview()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_admin() then null else jsonb_build_object(
    'users_total',        (select count(*) from users where role <> 'admin'),
    'users_new_7d',       (select count(*) from users where role <> 'admin' and created_at > now() - interval '7 days'),
    'clients_total',      (select count(*) from users where role = 'client'),
    'pros_total',         (select count(*) from users where role = 'skipper'),
    'pending_approvals',  (select count(*) from skipper_profiles where approval_status = 'pending' and deleted_at is null),
    'open_disputes',      (select count(*) from cancellation_reports where resolved_at is null),
    'coverage_needed',    (select count(*) from admin_coverage_needed() where offer_request_id is null),
    'coverage_offered',   (select count(*) from admin_coverage_needed() where offer_request_id is not null),
    'offers_open',        (select count(*) from booking_requests where origin <> 'client' and status = 'open'),
    'requests_open',      (select count(*) from booking_requests where status = 'open' and origin = 'client'),
    'requests_unclaimed_7d', (select count(*) from booking_requests
                              where status = 'expired_unclaimed' and created_at > now() - interval '7 days'),
    'bookings_confirmed', (select count(*) from bookings where status = 'confirmed'),
    'bookings_upcoming',  (select count(*) from bookings where status = 'confirmed' and start_date >= current_date),
    'bookings_completed', (select count(*) from bookings where status = 'completed'),
    'bookings_cancelled_30d', (select count(*) from bookings
                               where status in ('cancelled_by_client','cancelled_by_skipper')
                                 and created_at > now() - interval '30 days'),
    'wallet_clients',     (select coalesce(sum(wallet_balance), 0) from client_profiles),
    'wallet_pros',        (select coalesce(sum(wallet_balance), 0) from skipper_profiles),
    'fees_30d',           (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee') and created_at > now() - interval '30 days'),
    'fees_all_time',      (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee')),
    'refunds_30d',        (select coalesce(sum(amount), 0) from wallet_transactions
                           where type = 'refund_credit' and created_at > now() - interval '30 days'),
    -- ΔΙΟΡΘΩΣΗ 1: πριν έλεγχε μόνο «not has_future_availability», τώρα τον
    -- ίδιο ορισμό «ορατός» που χρησιμοποιεί η αναζήτηση.
    'profiles_invisible', (select count(*) from skipper_profiles sp
                           where sp.approval_status = 'approved' and sp.deleted_at is null
                             and not skipper_is_search_visible(sp.id))
  ) end;
$$;

-- ΔΙΟΡΘΩΣΗ 2: p_invisible_only δίνει στη λίστα χρηστών τρόπο να δείξει
-- ΑΚΡΙΒΩΣ ποιους εννοεί το κουτί, αντί να δείχνει όλους τους χρήστες.
create or replace function admin_list_accounts(
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
