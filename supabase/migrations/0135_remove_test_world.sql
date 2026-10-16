-- 0135 — Καθαρισμός του «δοκιμαστικού κόσμου» (νεκρός κώδικας μετά το 0134 και το format).
--
-- Δεν υπάρχουν δοκιμαστικοί λογαριασμοί, άρα φεύγουν: ο διαχωρισμός δύο κόσμων στην αναζήτηση και στις κρατήσεις
-- (in_test_world, guard_same_world), οι έλεγχοι δοκιμαστικού τηλεφώνου, η στήλη users.is_test_account. Ελευθερώνεται και η
-- σειρά τηλεφώνων +3069800000NN, που κρατούνταν για δοκιμές.

-- 1. Οι αναζητήσεις δεν φιλτράρουν πια ανά «κόσμο».
create or replace function admin_search_availability(
  p_role crew_role default 'skipper', p_start date default current_date, p_end date default current_date,
  p_port_id uuid default null, p_region_id uuid default null, p_exclude_trip_of uuid default null)
returns table(skipper_id uuid, user_id uuid, full_name text, phone_number text, crew_role crew_role, price_per_day numeric,
  rating_avg numeric, rating_count integer, reliability_percentage numeric, tier skipper_tier, photo_url text)
language sql stable security definer set search_path = public as $$
  select s.* from admin_search_availability_all(p_role, p_start, p_end, p_port_id, p_region_id, p_exclude_trip_of) s;
$$;

create or replace function search_available_skippers(
  p_start date, p_end date, p_region_id uuid, p_boat_type_id uuid, p_max_price numeric default null,
  p_gender text default null, p_crew_role crew_role default 'skipper', p_language_id uuid default null)
returns setof skipper_public language sql stable security definer set search_path = public as $$
  select s.* from search_available_skippers_all(p_start, p_end, p_region_id, p_boat_type_id, p_max_price,
                                                p_gender, p_crew_role, p_language_id) s;
$$;

create or replace function search_delivery_candidates(p_crew_role crew_role, p_start date, p_end date)
returns setof skipper_public language sql stable security definer set search_path = public as $$
  select s.* from search_delivery_candidates_all(p_crew_role, p_start, p_end) s;
$$;

-- 2. Οι κράτηση/πρόσκληση δεν ελέγχουν πια «ίδιο κόσμο».
drop trigger if exists zz_guard_same_world on booking_request_pings;
drop trigger if exists zz_guard_same_world on bookings;
drop trigger if exists zz_guard_same_world on delivery_role_pings;
drop trigger if exists zz_guard_same_world on delivery_bookings;
drop function if exists guard_same_world();

-- 3. Συναρτήσεις που αναφέρονται στους δύο κόσμους ή στη στήλη: αφαίρεση των αναφορών από τον ορισμό τους.
do $$
declare
  r record;
  v_def text;
  v_new text;
  v_patched int := 0;
begin
  for r in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('complete_registration', 'run_health_checks', 'guard_users_privileged_columns')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;
    -- «... or in_test_world(v_uid)» (complete_registration)
    v_new := regexp_replace(v_new, '\s+or\s+in_test_world\(v_uid\)', '', 'g');
    -- «where not in_test_world(u.id) and ...» και «... and not in_test_world(x)» (run_health_checks)
    v_new := regexp_replace(v_new, 'where\s+not\s+in_test_world\([^)]*\)\s+and\s+', 'where ', 'g');
    v_new := regexp_replace(v_new, '\s+and\s+not\s+in_test_world\([^)]*\)', '', 'g');
    -- ανάθεση της στήλης (guard_users_privileged_columns)
    v_new := regexp_replace(v_new, '\n\s*new\.is_test_account\s*:=\s*[a-z_.]+\s*;', '', 'g');
    if v_new ~* 'in_test_world|is_test_account|is_test_phone' then
      raise exception 'could not clean % (still references the test world)', r.proname;
    end if;
    if v_new <> v_def then
      execute v_new;
      v_patched := v_patched + 1;
    end if;
  end loop;
end $$;

-- 4. Η λίστα λογαριασμών δεν επιστρέφει πια τη στήλη (αλλάζει ο τύπος επιστροφής: διαγραφή και ξανά δημιουργία).
drop function if exists admin_list_accounts(user_role, crew_role, text, text, int, boolean, boolean, boolean, boolean);
CREATE FUNCTION public.admin_list_accounts(p_role user_role DEFAULT NULL::user_role, p_crew_role crew_role DEFAULT NULL::crew_role, p_search text DEFAULT ''::text, p_sort text DEFAULT 'recent'::text, p_limit integer DEFAULT 200, p_invisible_only boolean DEFAULT false, p_deleted_only boolean DEFAULT false, p_pending_verification_only boolean DEFAULT false, p_suspended_only boolean DEFAULT false)
 RETURNS TABLE(id uuid, role user_role, crew_role crew_role, full_name text, phone_number text, email text, status user_status, approval_status skipper_approval_status, created_at timestamp with time zone, last_seen_at timestamp with time zone, date_of_birth date, rating_avg numeric, rating_count integer, reliability_percentage numeric, completed_bookings_count integer, tier skipper_tier, photo_url text, phone_verified_at timestamp with time zone, suspension_reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    u.photo_url,
    u.phone_verified_at,
    u.suspension_reason
  from users u
  left join skipper_profiles sp on sp.user_id = u.id and sp.deleted_at is null
  left join client_profiles cp on cp.user_id = u.id
  where is_admin()
    and (case when p_deleted_only then u.status = 'deleted' else u.status <> 'deleted' end)
    and (not p_pending_verification_only or (u.phone_verified_at is null and u.role <> 'admin'))
    and (not p_suspended_only or u.status = 'suspended')
    and (p_role is null or u.role = p_role)
    and (p_crew_role is null or sp.role = p_crew_role)
    and (
      coalesce(p_search, '') = ''
      or u.phone_number ilike '%' || p_search || '%'
      or exists (select 1 from user_phones up where up.user_id = u.id and up.phone ilike '%' || p_search || '%')
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
$function$;
revoke execute on function admin_list_accounts(user_role, crew_role, text, text, int, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function admin_list_accounts(user_role, crew_role, text, text, int, boolean, boolean, boolean, boolean) to authenticated;

-- 5. Φεύγουν οι έλεγχοι, οι βοηθητικές και η στήλη.
drop trigger if exists zz_guard_no_test_accounts on users;
drop function if exists guard_no_test_accounts();
drop trigger if exists zz_guard_test_phone_admin on users;
drop function if exists guard_test_phone_admin();
drop function if exists in_test_world(uuid);
drop function if exists is_test_phone(text);
alter table users drop column if exists is_test_account;
