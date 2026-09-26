-- ============================================================================
-- Η αναζήτηση αντικαταστάτη δείχνει μόνο επαγγελματίες του κόσμου του πελάτη.
--
-- Από το 0102 δοκιμαστικοί και πραγματικοί λογαριασμοί δεν συναντιούνται. Η
-- λίστα «Ποιοι είναι ελεύθεροι» του admin, όμως, για την κράτηση πραγματικού
-- πελάτη πρότεινε και δοκιμαστικούς επαγγελματίες (π.χ. αυτούς του «Δημιουργία
-- demo»)· αν ο admin τους διάλεγε, η βάση απέρριπτε ολόκληρη την πρόταση
-- (test_account_mismatch). Τώρα, όταν η αναζήτηση γίνεται για συγκεκριμένο
-- ταξίδι (p_exclude_trip_of), κρατά μόνο όσους ανήκουν στον ίδιο κόσμο με τον
-- πελάτη. Χωρίς ταξίδι, ο admin βλέπει όλους όπως πριν.
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'admin_search_availability_all') then
    alter function admin_search_availability(crew_role, date, date, uuid, uuid, uuid)
      rename to admin_search_availability_all;
  end if;
end;
$$;

revoke execute on function admin_search_availability_all(crew_role, date, date, uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function admin_search_availability(
  p_role crew_role default 'skipper', p_start date default current_date, p_end date default current_date,
  p_port_id uuid default null, p_region_id uuid default null, p_exclude_trip_of uuid default null)
returns table (skipper_id uuid, user_id uuid, full_name text, phone_number text, crew_role crew_role,
               price_per_day numeric, rating_avg numeric, rating_count integer, reliability_percentage numeric,
               tier skipper_tier, photo_url text)
language sql stable security definer set search_path = public as $$
  select s.* from admin_search_availability_all(p_role, p_start, p_end, p_port_id, p_region_id, p_exclude_trip_of) s
   where p_exclude_trip_of is null
      or in_test_world(s.user_id) = in_test_world((select client_id from bookings where id = p_exclude_trip_of));
$$;

revoke execute on function admin_search_availability(crew_role, date, date, uuid, uuid, uuid) from public, anon;
grant execute on function admin_search_availability(crew_role, date, date, uuid, uuid, uuid) to authenticated;
