-- ============================================================================
-- Η διαθεσιμότητα για μεταφορές σκάφους (0067) ήταν ένα απλό on/off διακόπτη
-- — λάθος σχεδιασμός: σημαίνει να θυμάται κάποιος να το ξανακλείσει πριν το
-- καλοκαίρι (ναύλα, όχι μεταφορές) και να το ξανανοίξει τον χειμώνα. Αντί γι'
-- αυτό, ίδια λογική με την κανονική διαθεσιμότητα πληρώματος
-- (availability_windows/net_availability, 0013/0049): ο επαγγελματίας δηλώνει
-- συγκεκριμένα διαστήματα ημερομηνιών, και η αναζήτηση για ένα αίτημα
-- μεταφοράς ταιριάζει αυτόματα με ΤΙΣ ΗΜΕΡΟΜΗΝΙΕΣ ΤΟΥ ΑΙΤΗΜΑΤΟΣ (όχι με
-- "σήμερα"), αφαιρώντας ό,τι ήδη καλύπτεται από επιβεβαιωμένη κράτηση ή
-- μεταφορά — ένας άνθρωπος, ένα timeline, ασχέτως ρόλου.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. delivery_availability_windows — αντικαθιστά το boolean delivery_available.
-- ----------------------------------------------------------------------------
create table if not exists delivery_availability_windows (
  id uuid primary key default gen_random_uuid(),
  skipper_id uuid not null references skipper_profiles(id) on delete cascade,
  crew_role crew_role not null check (crew_role in ('skipper', 'deckhand')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  created_at timestamptz not null default now()
);
create index if not exists delivery_availability_windows_skipper_idx
  on delivery_availability_windows (skipper_id, crew_role);

alter table delivery_availability_windows enable row level security;
drop policy if exists "delivery availability public read" on delivery_availability_windows;
create policy "delivery availability public read" on delivery_availability_windows for select using (true);
drop policy if exists "delivery availability owner write" on delivery_availability_windows;
create policy "delivery availability owner write" on delivery_availability_windows for all using (
  exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
) with check (
  exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
);

-- ----------------------------------------------------------------------------
-- 2. delivery_net_availability — δηλωμένα διαστήματα ΜΕΙΟΝ ό,τι ήδη πιάνει
-- επιβεβαιωμένη κράτηση πληρώματος ή μεταφορά, ίδιου ανθρώπου, ασχέτως ρόλου
-- (ίδια αρχή με το ήδη υπάρχον date-overlap check).
-- ----------------------------------------------------------------------------
create or replace function delivery_net_availability(p_skipper_id uuid, p_crew_role crew_role)
returns datemultirange
language sql stable as $$
  select
    coalesce((
      select range_agg(daterange(w.start_date, w.end_date, '[]'))
      from delivery_availability_windows w
      where w.skipper_id = p_skipper_id and w.crew_role = p_crew_role
    ), '{}'::datemultirange)
    -
    coalesce((
      select range_agg(daterange(b.start_date, b.end_date, '[]'))
      from bookings b
      where b.skipper_id = p_skipper_id and b.status in ('confirmed', 'completed')
    ), '{}'::datemultirange)
    -
    coalesce((
      select range_agg(b.estimated_range)
      from delivery_bookings b
      where b.skipper_id = p_skipper_id and b.status = 'confirmed'
    ), '{}'::datemultirange);
$$;

-- ----------------------------------------------------------------------------
-- 3. Κατάργηση του boolean flag· skipper_public δεν το εκθέτει πια. Το view
-- δεν μπορεί να αλλάξει/αφαιρέσει στήλη με CREATE OR REPLACE — πρέπει να
-- πέσει, μαζί με ό,τι επιστρέφει τη σειρά του (ίδιο μάθημα με 0012/0027/0033
-- πιο πάνω στο ιστορικό), και να ξαναχτιστεί μετά.
-- ----------------------------------------------------------------------------
drop function if exists update_delivery_availability(boolean, crew_role);
drop function if exists search_available_skippers(date, date, uuid, uuid, numeric, text, crew_role, uuid);
drop function if exists search_delivery_candidates(crew_role);
drop view if exists skipper_public;

create view skipper_public as
  select sp.id, sp.role, sp.photo_url, sp.gender, sp.years_experience, sp.license_type, sp.price_per_day,
         sp.rating_avg, sp.rating_count,
         case
           when (sp.completed_bookings_count + sp.cancellation_flag_count)
                < (select value from platform_settings where key = 'reliability_min_history')
           then null
           else sp.reliability_percentage
         end as reliability_percentage,
         sp.tier,
         sp.rating_avg_safety, sp.rating_avg_seamanship, sp.rating_avg_professionalism,
         sp.rating_avg_cleanliness, sp.rating_avg_communication, sp.rating_avg_hospitality,
         sp.rating_avg_cooking, sp.rating_avg_service,
         sp.rating_avg_taste, sp.rating_avg_variety, sp.rating_avg_presentation,
         sp.rating_avg_adaptability, sp.rating_avg_organization,
         sp.rating_avg_maintenance, sp.rating_avg_teamwork, sp.rating_avg_diligence,
         (select n.name from nationalities n where n.id = sp.nationality_id) as nationality_name,
         (select array_agg(l.name order by l.name)
            from skipper_languages sl join languages l on l.id = sl.language_id
            where sl.skipper_id = sp.id) as languages,
         (select n.flag_emoji from nationalities n where n.id = sp.nationality_id) as nationality_flag,
         date_part('year', age(current_date, sp.date_of_birth))::int as age,
         (select n.country_name from nationalities n where n.id = sp.nationality_id) as nationality_country
  from skipper_profiles sp
  where sp.approval_status = 'approved' and sp.deleted_at is null
  union all
  select sp.id, ssr.role, sp.photo_url, sp.gender, ssr.years_experience, ssr.license_type, ssr.price_per_day,
         ssr.rating_avg, ssr.rating_count,
         case
           when (sp.completed_bookings_count + sp.cancellation_flag_count)
                < (select value from platform_settings where key = 'reliability_min_history')
           then null
           else sp.reliability_percentage
         end,
         sp.tier,
         ssr.rating_avg_safety, ssr.rating_avg_seamanship, ssr.rating_avg_professionalism,
         ssr.rating_avg_cleanliness, ssr.rating_avg_communication, ssr.rating_avg_hospitality,
         ssr.rating_avg_cooking, ssr.rating_avg_service,
         ssr.rating_avg_taste, ssr.rating_avg_variety, ssr.rating_avg_presentation,
         ssr.rating_avg_adaptability, ssr.rating_avg_organization,
         ssr.rating_avg_maintenance, ssr.rating_avg_teamwork, ssr.rating_avg_diligence,
         (select n.name from nationalities n where n.id = sp.nationality_id),
         (select array_agg(l.name order by l.name)
            from skipper_languages sl join languages l on l.id = sl.language_id
            where sl.skipper_id = sp.id),
         (select n.flag_emoji from nationalities n where n.id = sp.nationality_id),
         date_part('year', age(current_date, sp.date_of_birth))::int,
         (select n.country_name from nationalities n where n.id = sp.nationality_id)
  from skipper_secondary_roles ssr
  join skipper_profiles sp on sp.id = ssr.skipper_id
  where ssr.approval_status = 'approved' and ssr.deleted_at is null and sp.deleted_at is null;

alter table skipper_profiles drop column if exists delivery_available;
alter table skipper_secondary_roles drop column if exists delivery_available;

-- Ξαναχτίζεται όπως ήταν (0049) — δεν αλλάζει καθόλου, έπεσε μόνο επειδή
-- επιστρέφει setof skipper_public.
create or replace function search_available_skippers(
  p_start date,
  p_end date,
  p_region_id uuid,
  p_boat_type_id uuid,
  p_max_price numeric default null,
  p_gender text default null,
  p_crew_role crew_role default 'skipper',
  p_language_id uuid default null
) returns setof skipper_public
language sql stable security definer set search_path = public as $$
  select sp.* from skipper_public sp
  where sp.role = p_crew_role
    and (
      p_crew_role <> 'skipper' or exists (
        select 1 from skipper_boat_types bt where bt.skipper_id = sp.id and bt.boat_type_id = p_boat_type_id
      )
    )
    and not exists (
      select 1 from skipper_profiles own where own.id = sp.id and own.user_id = auth.uid()
    )
    and net_availability(sp.id, null, p_region_id, p_crew_role) @> daterange(p_start, p_end, '[]')
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
    and (p_max_price is null or sp.price_per_day <= p_max_price)
    and (p_gender is null or sp.gender = p_gender)
    and (
      p_language_id is null or exists (
        select 1 from skipper_languages sl where sl.skipper_id = sp.id and sl.language_id = p_language_id
      )
    )
  order by case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
           skipper_rank_score(
             sp.rating_avg,
             sp.rating_count,
             cancellation_standing(sp.id),
             skipper_response_rate(sp.id)
           ) desc;
$$;

-- ----------------------------------------------------------------------------
-- 4. search_delivery_candidates — τώρα ταιριάζει με τις ημερομηνίες ΤΟΥ
-- ΑΙΤΗΜΑΤΟΣ αντί για ένα ναι/όχι flag.
-- ----------------------------------------------------------------------------
create or replace function search_delivery_candidates(p_crew_role crew_role, p_start date, p_end date)
returns setof skipper_public
language sql stable security definer set search_path = public as $$
  select sp.* from skipper_public sp
  where sp.role = p_crew_role
    and not exists (
      select 1 from skipper_profiles own where own.id = sp.id and own.user_id = auth.uid()
    )
    and delivery_net_availability(sp.id, p_crew_role) @> daterange(p_start, p_end, '[]')
  order by case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
           skipper_rank_score(
             sp.rating_avg,
             sp.rating_count,
             cancellation_standing(sp.id),
             skipper_response_rate(sp.id)
           ) desc;
$$;
grant execute on function search_delivery_candidates(crew_role, date, date) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 5. create_delivery_role_request / relist_delivery_role_request — η
-- επιλεξιμότητα υποψηφίου ελέγχεται πλέον με βάση το εκτιμώμενο εύρος
-- ημερομηνιών του αιτήματος, όχι το παλιό flag.
-- ----------------------------------------------------------------------------
create or replace function create_delivery_role_request(
  p_delivery_request_id uuid,
  p_crew_role crew_role,
  p_offered_price numeric,
  p_skipper_ids uuid[]
) returns delivery_role_requests
language plpgsql security definer set search_path = public as $$
declare
  v_dr delivery_requests%rowtype;
  v_rate numeric;
  v_pct numeric;
  v_min_fee numeric;
  v_expiry_hours numeric;
  v_commission_base numeric;
  v_platform_commission numeric;
  v_client_fee numeric;
  v_wallet numeric;
  v_range daterange;
  v_row delivery_role_requests%rowtype;
begin
  select * into v_dr from delivery_requests where id = p_delivery_request_id;
  if not found then raise exception 'delivery_request_not_found'; end if;
  if v_dr.client_id <> auth.uid() then raise exception 'not_owner'; end if;

  if p_crew_role not in ('skipper', 'deckhand') then raise exception 'invalid_role'; end if;
  if p_offered_price is null or p_offered_price < 0 then raise exception 'invalid_price'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_candidates_selected'; end if;

  v_range := daterange(v_dr.departure_date - v_dr.flexible_days, v_dr.departure_date + v_dr.flexible_days, '[]');

  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_public sp on sp.id = s and sp.role = p_crew_role
    where sp.id is null or not (delivery_net_availability(s, p_crew_role) @> v_range)
  ) then
    raise exception 'invalid_candidate_selection';
  end if;

  v_rate := (select value from platform_settings where key =
    case when p_crew_role = 'skipper' then 'delivery_skipper_rate_per_mile' else 'delivery_deckhand_rate_per_mile' end);
  v_pct := (select value from platform_settings where key = 'delivery_platform_fee_pct');
  v_min_fee := (select value from platform_settings where key = 'delivery_min_fee');
  v_expiry_hours := (select value from platform_settings where key = 'delivery_expiry_hours');

  v_commission_base := v_dr.distance_miles * v_rate;
  v_platform_commission := v_commission_base * (v_pct / 100.0);
  v_client_fee := greatest(v_min_fee, v_platform_commission - v_min_fee);

  select wallet_balance into v_wallet from users where id = auth.uid() for update;
  if v_wallet < v_client_fee then raise exception 'insufficient_wallet'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance - v_client_fee where id = auth.uid();

  insert into delivery_role_requests (
    delivery_request_id, crew_role, offered_price,
    commission_base, platform_commission, client_fee, professional_fee,
    fee_paid_at, expires_at
  ) values (
    p_delivery_request_id, p_crew_role, p_offered_price,
    v_commission_base, v_platform_commission, v_client_fee, v_min_fee,
    now(), now() + (v_expiry_hours || ' hours')::interval
  ) returning * into v_row;

  insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id)
    values (auth.uid(), 'request_fee', -v_client_fee, v_row.id);

  insert into delivery_role_pings (delivery_role_request_id, skipper_id)
    select v_row.id, s from unnest(p_skipper_ids) as s
    on conflict do nothing;

  return v_row;
end;
$$;

create or replace function relist_delivery_role_request(
  p_role_request_id uuid,
  p_new_price numeric,
  p_skipper_ids uuid[]
) returns delivery_role_requests
language plpgsql security definer set search_path = public as $$
declare
  v_rr delivery_role_requests%rowtype;
  v_dr delivery_requests%rowtype;
  v_expiry_hours numeric;
  v_range daterange;
  v_row delivery_role_requests%rowtype;
begin
  select * into v_rr from delivery_role_requests where id = p_role_request_id for update;
  if not found then raise exception 'role_request_not_found'; end if;
  select * into v_dr from delivery_requests where id = v_rr.delivery_request_id;
  if v_dr.client_id <> auth.uid() then raise exception 'not_owner'; end if;
  if v_rr.status <> 'open' then raise exception 'not_open'; end if;

  if p_new_price is null or p_new_price < 0 then raise exception 'invalid_price'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_candidates_selected'; end if;

  v_range := daterange(v_dr.departure_date - v_dr.flexible_days, v_dr.departure_date + v_dr.flexible_days, '[]');

  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_public sp on sp.id = s and sp.role = v_rr.crew_role
    where sp.id is null or not (delivery_net_availability(s, v_rr.crew_role) @> v_range)
  ) then
    raise exception 'invalid_candidate_selection';
  end if;

  v_expiry_hours := (select value from platform_settings where key = 'delivery_expiry_hours');

  update delivery_role_requests
    set offered_price = p_new_price, expires_at = now() + (v_expiry_hours || ' hours')::interval
    where id = p_role_request_id
    returning * into v_row;

  insert into delivery_role_pings (delivery_role_request_id, skipper_id, status, sent_at, responded_at)
    select p_role_request_id, s, 'pending', now(), null from unnest(p_skipper_ids) as s
    on conflict (delivery_role_request_id, skipper_id)
    do update set status = 'pending', sent_at = now(), responded_at = null;

  return v_row;
end;
$$;
