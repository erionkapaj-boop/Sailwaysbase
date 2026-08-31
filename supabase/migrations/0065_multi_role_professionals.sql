-- ============================================================================
-- Ένας επαγγελματίας μπορεί να δηλώσει παραπάνω από έναν ρόλο (π.χ. skipper
-- ΚΑΙ cook) στον ίδιο λογαριασμό — με δική του τιμή, άδεια (όπου έχει νόημα)
-- και ΔΙΚΗ ΤΟΥ αξιολόγηση ανά ρόλο, χωρίς να μπορεί ποτέ να δουλέψει δύο
-- ρόλους ταυτόχρονα στο ίδιο ταξίδι.
--
-- Το skipper_profiles.id ΠΑΡΑΜΕΝΕΙ το ένα, μόνιμο αναγνωριστικό του
-- ΑΝΘΡΩΠΟΥ — ό,τι ήδη το χρησιμοποιεί (κρατήσεις, μηνύματα, ειδοποιήσεις,
-- πορτοφόλι, κανόνες πρόσβασης) μένει ΑΝΕΠΗΡΕΑΣΤΟ. Ο δεύτερος (τρίτος...)
-- ρόλος ζει σε ξεχωριστό πίνακα (skipper_secondary_roles) με τη δική του
-- τιμή/άδεια/έγκριση/αξιολόγηση, αλλά «κρεμασμένος» από το ίδιο skipper_id.
-- Επειδή μια κράτηση δείχνει πάντα στο ίδιο, ενιαίο skipper_id — ασχέτως
-- ρόλου — ο υπάρχων έλεγχος επικάλυψης ημερομηνιών (σε search και σε
-- claim_booking_request) εμποδίζει ήδη, χωρίς καμία αλλαγή, να δεχτεί
-- κάποιος δεύτερη δουλειά τις ίδιες μέρες σε άλλον ρόλο. Η διαθεσιμότητα
-- μπορεί να δηλωθεί είτε γενικά (crew_role = null, ισχύει για όλους τους
-- ρόλους του) είτε ειδικά για έναν ρόλο — έτσι κάποιος μπορεί να πει «αυτή
-- τη βδομάδα διαθέσιμος ως μάγειρας, την άλλη ως καπετάνιος».
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ο δεύτερος (τρίτος...) ρόλος.
-- ----------------------------------------------------------------------------
create table if not exists skipper_secondary_roles (
  id uuid primary key default gen_random_uuid(),
  skipper_id uuid not null references skipper_profiles(id) on delete cascade,
  role crew_role not null,
  price_per_day numeric not null check (price_per_day >= 210),
  license_number text,
  license_type text,
  years_experience int not null default 0,
  rating_avg numeric,
  rating_count int not null default 0,
  approval_status skipper_approval_status not null default 'pending',
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Ίδιες στήλες αξιολόγησης ανά κατηγορία με το skipper_profiles — μόνο
  -- όσες αφορούν αυτόν τον ρόλο θα γεμίσουν ποτέ (βλ. reviewCategories.js),
  -- οι υπόλοιπες μένουν null όπως και στην κύρια γραμμή.
  rating_avg_safety numeric, rating_avg_seamanship numeric, rating_avg_professionalism numeric,
  rating_avg_cleanliness numeric, rating_avg_communication numeric, rating_avg_hospitality numeric,
  rating_avg_cooking numeric, rating_avg_service numeric,
  rating_avg_taste numeric, rating_avg_variety numeric, rating_avg_presentation numeric,
  rating_avg_adaptability numeric, rating_avg_organization numeric,
  rating_avg_maintenance numeric, rating_avg_teamwork numeric, rating_avg_diligence numeric,
  unique (skipper_id, role)
);
create index if not exists skipper_secondary_roles_search_idx
  on skipper_secondary_roles (approval_status, deleted_at);

alter table skipper_secondary_roles enable row level security;

drop policy if exists "secondary role owner or admin read" on skipper_secondary_roles;
create policy "secondary role owner or admin read" on skipper_secondary_roles for select using (
  skipper_id = my_skipper_profile_id() or is_admin()
);
drop policy if exists "secondary role owner insert" on skipper_secondary_roles;
create policy "secondary role owner insert" on skipper_secondary_roles for insert with check (
  skipper_id = my_skipper_profile_id()
);
drop policy if exists "secondary role owner or admin update" on skipper_secondary_roles;
create policy "secondary role owner or admin update" on skipper_secondary_roles for update using (
  skipper_id = my_skipper_profile_id() or is_admin()
);
drop policy if exists "secondary role owner delete" on skipper_secondary_roles;
create policy "secondary role owner delete" on skipper_secondary_roles for delete using (
  skipper_id = my_skipper_profile_id()
);

-- Ίδια λογική με guard_skipper_profile_privileged_columns (0006): δεν μπορεί
-- κάποιος να εγκρίνει μόνος του τον εαυτό του ή να πειράξει την αξιολόγησή
-- του απευθείας. Επιπλέον, στο INSERT: δεν μπορεί να δηλώσει δεύτερη φορά
-- τον ρόλο που ήδη έχει ως κύριο προφίλ.
create or replace function guard_secondary_role() returns trigger
language plpgsql as $$
declare
  v_primary_role crew_role;
  v_trusted boolean := coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin();
begin
  if TG_OP = 'INSERT' then
    select role into v_primary_role from skipper_profiles where id = new.skipper_id;
    if v_primary_role is not null and v_primary_role = new.role then
      raise exception 'role_already_primary';
    end if;
    if not v_trusted then
      new.approval_status := 'pending';
      new.approved_by := null;
      new.approved_at := null;
      new.rating_avg := null;
      new.rating_count := 0;
    end if;
    return new;
  end if;

  if v_trusted then
    return new;
  end if;
  new.skipper_id := old.skipper_id;
  new.role := old.role;
  new.approval_status := old.approval_status;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.deleted_at := old.deleted_at;
  new.rating_avg_safety := old.rating_avg_safety; new.rating_avg_seamanship := old.rating_avg_seamanship;
  new.rating_avg_professionalism := old.rating_avg_professionalism; new.rating_avg_cleanliness := old.rating_avg_cleanliness;
  new.rating_avg_communication := old.rating_avg_communication; new.rating_avg_hospitality := old.rating_avg_hospitality;
  new.rating_avg_cooking := old.rating_avg_cooking; new.rating_avg_service := old.rating_avg_service;
  new.rating_avg_taste := old.rating_avg_taste; new.rating_avg_variety := old.rating_avg_variety;
  new.rating_avg_presentation := old.rating_avg_presentation; new.rating_avg_adaptability := old.rating_avg_adaptability;
  new.rating_avg_organization := old.rating_avg_organization; new.rating_avg_maintenance := old.rating_avg_maintenance;
  new.rating_avg_teamwork := old.rating_avg_teamwork; new.rating_avg_diligence := old.rating_avg_diligence;
  return new;
end;
$$;
drop trigger if exists trg_guard_secondary_role on skipper_secondary_roles;
create trigger trg_guard_secondary_role
  before insert or update on skipper_secondary_roles
  for each row execute function guard_secondary_role();

-- ----------------------------------------------------------------------------
-- 2. Διαθεσιμότητα ανά ρόλο (προαιρετικό — null εξακολουθεί να σημαίνει
--    "διαθέσιμος/η σε ό,τι ρόλο κι αν δουλεύει", όπως πάντα μέχρι τώρα).
-- ----------------------------------------------------------------------------
alter table availability_windows add column if not exists crew_role crew_role;

create or replace function net_availability(
  p_skipper_id uuid,
  p_port_id uuid default null,
  p_region_id uuid default null,
  p_crew_role crew_role default null
)
returns datemultirange
language sql stable as $$
  select
    coalesce((
      select range_agg(daterange(w.start_date, w.end_date, '[]'))
      from availability_windows w
      where w.skipper_id = p_skipper_id
        and (p_crew_role is null or w.crew_role is null or w.crew_role = p_crew_role)
        and (
          (p_port_id is null and p_region_id is null)
          or exists (
            select 1
            from availability_window_regions wr
            where wr.window_id = w.id
              and (
                (p_region_id is not null and wr.region_id = p_region_id)
                or (
                  p_region_id is null and p_port_id is not null and exists (
                    select 1 from ports p where p.id = p_port_id and p.region_id = wr.region_id
                  )
                )
              )
          )
        )
    ), '{}'::datemultirange)
    -
    coalesce((
      select range_agg(daterange(b.start_date, b.end_date, '[]'))
      from availability_blocks b
      where b.skipper_id = p_skipper_id
    ), '{}'::datemultirange);
$$;

-- ----------------------------------------------------------------------------
-- 3. Η δημόσια προβολή γίνεται UNION: η κύρια γραμμή του καθενός, ΣΥΝ μία
--    ακόμη γραμμή για κάθε εγκεκριμένο δεύτερο ρόλο του — πάντα με το ΙΔΙΟ
--    id (τον άνθρωπο), απλά με άλλη τιμή στο role/τιμή/αξιολόγηση. Έτσι η
--    αναζήτηση, που ήδη φιλτράρει με sp.role = p_crew_role, βρίσκει τον
--    σωστό άνθρωπο στον σωστό ρόλο χωρίς καμία αλλαγή στο search_available_skippers
--    πέρα από να περάσει τον ρόλο στο net_availability.
-- ----------------------------------------------------------------------------
create or replace view skipper_public as
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
         -- Η αξιοπιστία/βαθμίδα μένουν σε επίπεδο ανθρώπου, όχι ρόλου — μια
         -- ακύρωση είναι ακύρωση ασχέτως ρόλου, οπότε αντλούνται από την
         -- κύρια γραμμή του.
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
-- 3α. Οι κρατήσεις δεν κρατούσαν ποτέ δικό τους crew_role — άχρηστο όσο
--     κάθε άνθρωπος είχε έναν μόνο ρόλο (ήταν πάντα ίδιο με το
--     skipper_profiles.role), αλλά αναγκαίο τώρα: μια κράτηση σε δεύτερο
--     ρόλο πρέπει να θυμάται ΠΟΙΟΝ ρόλο αφορούσε, ανεξάρτητα από το ποιος
--     είναι ο κύριος ρόλος του ανθρώπου σήμερα.
-- ----------------------------------------------------------------------------
alter table bookings add column if not exists crew_role crew_role;
update bookings b set crew_role = br.crew_role
  from booking_requests br
  where br.id = b.booking_request_id and b.crew_role is null;

-- ----------------------------------------------------------------------------
-- 4. Η αποδοχή αιτήματος (broadcast + claim) πρέπει να ελέγχει την έγκριση
--    του ΣΩΣΤΟΥ ρόλου — του κύριου ή του δεύτερου, ανάλογα ποιον ζητάει το
--    συγκεκριμένο αίτημα — όχι πάντα μόνο του κύριου προφίλ.
-- ----------------------------------------------------------------------------
create or replace function pay_and_broadcast(p_request_id uuid, p_skipper_ids uuid[]) returns booking_requests
language plpgsql security definer set search_path = public as $$
declare v_req booking_requests%rowtype; v_uid uuid := auth.uid(); v_wallet numeric;
begin
  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.client_id <> v_uid then raise exception 'not_owner'; end if;
  if v_req.status <> 'open' or v_req.fee_paid_at is not null then raise exception 'already_paid_or_closed'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_skippers_selected'; end if;
  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_profiles sp on sp.id = s
    left join skipper_secondary_roles ssr
      on ssr.skipper_id = s and ssr.role = v_req.crew_role and ssr.deleted_at is null
    where sp.id is null
       or sp.deleted_at is not null
       or (
         v_req.crew_role = sp.role
           and sp.approval_status <> 'approved'
       )
       or (
         v_req.crew_role <> sp.role
           and (ssr.id is null or ssr.approval_status <> 'approved')
       )
  ) then
    raise exception 'invalid_skipper_selection';
  end if;

  select wallet_balance into v_wallet from users where id = v_uid for update;
  if v_wallet < v_req.fee_amount then
    raise exception 'insufficient_wallet';
  end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance - v_req.fee_amount where id = v_uid;
  insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
    values (v_uid, 'request_fee', -v_req.fee_amount, p_request_id);

  update booking_requests set fee_paid_at = now() where id = p_request_id returning * into v_req;
  insert into booking_request_pings (booking_request_id, skipper_id)
    select p_request_id, s from unnest(p_skipper_ids) as s
    on conflict do nothing;
  return v_req;
end;
$$;

create or replace function claim_booking_request(p_request_id uuid, p_skipper_id uuid) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_req booking_requests%rowtype;
  v_ping booking_request_pings%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_secondary skipper_secondary_roles%rowtype;
  v_booking bookings%rowtype;
  v_claim_fee numeric;
  v_overlap boolean;
  v_wallet numeric;
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_skipper_id::text));

  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;
  if v_req.fee_paid_at is null then raise exception 'fee_not_paid'; end if;
  if v_req.expires_at <= now() then raise exception 'request_expired'; end if;

  select * into v_ping from booking_request_pings
    where booking_request_id = p_request_id and skipper_id = p_skipper_id for update;
  if not found then raise exception 'not_pinged'; end if;
  if v_ping.status <> 'pending' then raise exception 'already_resolved'; end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if v_skipper.deleted_at is not null then
    raise exception 'skipper_not_eligible';
  end if;
  if v_req.crew_role = v_skipper.role then
    if v_skipper.approval_status <> 'approved' then
      raise exception 'skipper_not_eligible';
    end if;
  else
    select * into v_secondary from skipper_secondary_roles
      where skipper_id = p_skipper_id and role = v_req.crew_role and deleted_at is null for update;
    if not found or v_secondary.approval_status <> 'approved' then
      raise exception 'skipper_not_eligible';
    end if;
  end if;

  if v_req.replaces_booking_id is not null and exists (
    select 1 from bookings r
    where r.replaces_booking_id = v_req.replaces_booking_id
      and r.status in ('confirmed', 'completed')
  ) then
    update booking_requests set status = 'cancelled' where id = p_request_id;
    raise exception 'already_covered';
  end if;

  -- Ασχέτως ρόλου: το ίδιο skipper_id σε κάθε κράτησή του, οπότε αυτός ο
  -- έλεγχος εμποδίζει ήδη δύο δουλειές τις ίδιες μέρες σε διαφορετικούς
  -- ρόλους — δεν χρειάζεται να ξέρει καν ότι υπάρχουν δεύτεροι ρόλοι.
  select exists (
    select 1 from bookings
    where skipper_id = p_skipper_id
      and status in ('confirmed', 'completed')
      and daterange(start_date, end_date, '[]') && daterange(v_req.start_date, v_req.end_date, '[]')
  ) into v_overlap;
  if v_overlap then
    raise exception 'date_overlap';
  end if;

  v_claim_fee := coalesce(
    v_req.claim_fee_amount,
    (select value from platform_settings where key = 'skipper_claim_fee')
  );

  select wallet_balance into v_wallet from users where id = v_skipper.user_id for update;
  if v_claim_fee > 0 and v_wallet < v_claim_fee then
    raise exception 'insufficient_wallet';
  end if;

  insert into bookings (
    booking_request_id, client_id, skipper_id, start_date, end_date, port_id, region_id, departure_point, boat_type_id,
    party_size, private_cabin,
    skipper_claim_fee_amount, skipper_claim_paid_at, confirmed_at, status,
    replaces_booking_id, assigned_by, crew_role
  ) values (
    p_request_id, v_req.client_id, p_skipper_id, v_req.start_date, v_req.end_date, v_req.port_id, v_req.region_id, v_req.departure_point, v_req.boat_type_id,
    v_req.party_size, v_req.private_cabin,
    v_claim_fee, now(), now(), 'confirmed',
    v_req.replaces_booking_id, v_req.created_by, v_req.crew_role
  ) returning * into v_booking;

  if v_claim_fee > 0 then
    perform set_config('platform.trusted', 'true', true);
    update users set wallet_balance = wallet_balance - v_claim_fee where id = v_skipper.user_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_request_id, related_booking_id)
      values (v_skipper.user_id, 'claim_fee', -v_claim_fee, p_request_id, v_booking.id);
  end if;

  update booking_request_pings set status = 'claimed' where id = v_ping.id;
  update booking_request_pings set status = 'missed'
    where booking_request_id = p_request_id and id <> v_ping.id and status = 'pending';
  update booking_requests set status = 'matched' where id = p_request_id;

  return v_booking;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4α. Ποιες κατηγορίες αξιολόγησης ισχύουν έπρεπε ήδη να βασίζεται στο ΡΟΛΟ
--     ΤΗΣ ΣΥΓΚΕΚΡΙΜΕΝΗΣ ΚΡΑΤΗΣΗΣ (bookings.crew_role), όχι στον κύριο ρόλο
--     του ανθρώπου (skipper_profiles.role) — διαφορετικά μια δουλειά σε
--     δεύτερο ρόλο θα ζητούσε τις κατηγορίες του ΠΡΩΤΟΥ ρόλου του. Ίδιο
--     σώμα με πριν, μόνο η πηγή του v_skipper_role άλλαξε.
-- ----------------------------------------------------------------------------
create or replace function enforce_review_categories() returns trigger
language plpgsql as $$
declare
  v_client_id uuid;
  v_skipper_user_id uuid;
  v_skipper_role crew_role;
begin
  select b.client_id, sp.user_id, b.crew_role into v_client_id, v_skipper_user_id, v_skipper_role
    from bookings b join skipper_profiles sp on sp.id = b.skipper_id
    where b.id = new.booking_id;

  if new.reviewee_id = v_skipper_user_id then
    if new.reviewer_id <> v_client_id then raise exception 'reviewer_not_participant'; end if;
  elsif new.reviewee_id = v_client_id then
    if new.reviewer_id <> v_skipper_user_id then raise exception 'reviewer_not_participant'; end if;
  end if;

  if new.reviewee_id = v_skipper_user_id and v_skipper_role = 'skipper' then
    if new.rating_safety is null or new.rating_seamanship is null or new.rating_professionalism is null
       or new.rating_cleanliness is null or new.rating_communication is null or new.rating_hospitality is null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_boat_respect is not null or new.rating_responsibility is not null
       or new.rating_cooperation is not null or new.rating_consistency is not null
       or new.rating_conduct is not null or new.rating_tidiness is not null
       or new.rating_taste is not null or new.rating_variety is not null or new.rating_presentation is not null
       or new.rating_adaptability is not null or new.rating_organization is not null
       or new.rating_maintenance is not null or new.rating_teamwork is not null or new.rating_diligence is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_safety + new.rating_seamanship + new.rating_professionalism +
      new.rating_cleanliness + new.rating_communication + new.rating_hospitality
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_skipper_user_id and v_skipper_role = 'hostess' then
    if new.rating_cleanliness is null or new.rating_cooking is null or new.rating_service is null
       or new.rating_professionalism is null or new.rating_communication is null or new.rating_hospitality is null
       or new.rating_safety is not null or new.rating_seamanship is not null
       or new.rating_boat_respect is not null or new.rating_responsibility is not null
       or new.rating_cooperation is not null or new.rating_consistency is not null
       or new.rating_conduct is not null or new.rating_tidiness is not null
       or new.rating_taste is not null or new.rating_variety is not null or new.rating_presentation is not null
       or new.rating_adaptability is not null or new.rating_organization is not null
       or new.rating_maintenance is not null or new.rating_teamwork is not null or new.rating_diligence is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_cleanliness + new.rating_cooking + new.rating_service +
      new.rating_professionalism + new.rating_communication + new.rating_hospitality
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_skipper_user_id and v_skipper_role = 'cook' then
    if new.rating_taste is null or new.rating_variety is null or new.rating_presentation is null
       or new.rating_adaptability is null or new.rating_organization is null or new.rating_cleanliness is null
       or new.rating_safety is not null or new.rating_seamanship is not null or new.rating_professionalism is not null
       or new.rating_communication is not null or new.rating_hospitality is not null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_boat_respect is not null or new.rating_responsibility is not null
       or new.rating_cooperation is not null or new.rating_consistency is not null
       or new.rating_conduct is not null or new.rating_tidiness is not null
       or new.rating_maintenance is not null or new.rating_teamwork is not null or new.rating_diligence is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_taste + new.rating_variety + new.rating_presentation +
      new.rating_adaptability + new.rating_organization + new.rating_cleanliness
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_skipper_user_id and v_skipper_role = 'deckhand' then
    if new.rating_seamanship is null or new.rating_safety is null or new.rating_maintenance is null
       or new.rating_cleanliness is null or new.rating_teamwork is null or new.rating_diligence is null
       or new.rating_professionalism is not null or new.rating_communication is not null or new.rating_hospitality is not null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_boat_respect is not null or new.rating_responsibility is not null
       or new.rating_cooperation is not null or new.rating_consistency is not null
       or new.rating_conduct is not null or new.rating_tidiness is not null
       or new.rating_taste is not null or new.rating_variety is not null or new.rating_presentation is not null
       or new.rating_adaptability is not null or new.rating_organization is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_seamanship + new.rating_safety + new.rating_maintenance +
      new.rating_cleanliness + new.rating_teamwork + new.rating_diligence
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_client_id then
    if new.rating_boat_respect is null or new.rating_responsibility is null or new.rating_cooperation is null
       or new.rating_consistency is null or new.rating_conduct is null or new.rating_tidiness is null
       or new.rating_safety is not null or new.rating_seamanship is not null or new.rating_professionalism is not null
       or new.rating_cleanliness is not null or new.rating_communication is not null or new.rating_hospitality is not null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_taste is not null or new.rating_variety is not null or new.rating_presentation is not null
       or new.rating_adaptability is not null or new.rating_organization is not null
       or new.rating_maintenance is not null or new.rating_teamwork is not null or new.rating_diligence is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_boat_respect + new.rating_responsibility + new.rating_cooperation +
      new.rating_consistency + new.rating_conduct + new.rating_tidiness
    )::numeric / 6, 2);
  else
    raise exception 'reviewee_not_participant';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Η αξιολόγηση χωρίζεται πλέον ανά ΡΟΛΟ, όχι ανά άνθρωπο — μια δουλειά ως
--    μάγειρας βαθμολογεί το προφίλ μαγείρα, μια δουλειά ως καπετάνιος το
--    προφίλ καπετάνιου, ποτέ το ένα δεν επηρεάζει το άλλο. Ομαδοποιεί πλέον
--    ανά skipper_id (τη συγκεκριμένη κράτηση) αντί για user_id (όλες μαζί).
-- ----------------------------------------------------------------------------
create or replace function recalc_user_rating(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_client_avg numeric; v_client_count int;
  v_boat_respect numeric; v_responsibility numeric; v_cooperation numeric;
  v_consistency numeric; v_conduct numeric; v_tidiness numeric;
  v_primary_id uuid; v_primary_role crew_role;
  v_row record;
begin
  if p_user_id is null then return; end if;

  perform set_config('platform.trusted', 'true', true);

  select id, role into v_primary_id, v_primary_role from skipper_profiles where user_id = p_user_id;

  if v_primary_id is not null then
    -- Κύριος ρόλος: μόνο οι κρατήσεις που έγιναν ΜΕ αυτόν τον ρόλο.
    update skipper_profiles sp set
      rating_avg = agg.rating_avg, rating_count = coalesce(agg.rating_count, 0),
      rating_avg_safety = agg.rating_avg_safety, rating_avg_seamanship = agg.rating_avg_seamanship,
      rating_avg_professionalism = agg.rating_avg_professionalism, rating_avg_cleanliness = agg.rating_avg_cleanliness,
      rating_avg_communication = agg.rating_avg_communication, rating_avg_hospitality = agg.rating_avg_hospitality,
      rating_avg_cooking = agg.rating_avg_cooking, rating_avg_service = agg.rating_avg_service,
      rating_avg_taste = agg.rating_avg_taste, rating_avg_variety = agg.rating_avg_variety,
      rating_avg_presentation = agg.rating_avg_presentation, rating_avg_adaptability = agg.rating_avg_adaptability,
      rating_avg_organization = agg.rating_avg_organization, rating_avg_maintenance = agg.rating_avg_maintenance,
      rating_avg_teamwork = agg.rating_avg_teamwork, rating_avg_diligence = agg.rating_avg_diligence
    from (
      select round(avg(r.rating)::numeric, 2) as rating_avg, count(*) as rating_count,
             round(avg(r.rating_safety)::numeric, 2) as rating_avg_safety,
             round(avg(r.rating_seamanship)::numeric, 2) as rating_avg_seamanship,
             round(avg(r.rating_professionalism)::numeric, 2) as rating_avg_professionalism,
             round(avg(r.rating_cleanliness)::numeric, 2) as rating_avg_cleanliness,
             round(avg(r.rating_communication)::numeric, 2) as rating_avg_communication,
             round(avg(r.rating_hospitality)::numeric, 2) as rating_avg_hospitality,
             round(avg(r.rating_cooking)::numeric, 2) as rating_avg_cooking,
             round(avg(r.rating_service)::numeric, 2) as rating_avg_service,
             round(avg(r.rating_taste)::numeric, 2) as rating_avg_taste,
             round(avg(r.rating_variety)::numeric, 2) as rating_avg_variety,
             round(avg(r.rating_presentation)::numeric, 2) as rating_avg_presentation,
             round(avg(r.rating_adaptability)::numeric, 2) as rating_avg_adaptability,
             round(avg(r.rating_organization)::numeric, 2) as rating_avg_organization,
             round(avg(r.rating_maintenance)::numeric, 2) as rating_avg_maintenance,
             round(avg(r.rating_teamwork)::numeric, 2) as rating_avg_teamwork,
             round(avg(r.rating_diligence)::numeric, 2) as rating_avg_diligence
      from reviews r
      join bookings b on b.id = r.booking_id
      where r.reviewee_id = p_user_id and b.skipper_id = v_primary_id and b.crew_role = v_primary_role
    ) agg
    where sp.id = v_primary_id;

    -- Δεύτεροι ρόλοι: μία ομαδοποίηση ανά ρόλο, μόνο για ρόλους που έχει
    -- πράγματι δηλώσει (ό,τι δεν αντιστοιχεί σε δηλωμένο δεύτερο ρόλο απλά
    -- δεν μετράει πουθενά — π.χ. ρόλος που έχει πλέον αφαιρέσει).
    for v_row in
      select ssr.id as secondary_id, b.crew_role,
             round(avg(r.rating)::numeric, 2) as rating_avg, count(*) as rating_count,
             round(avg(r.rating_safety)::numeric, 2) as rating_avg_safety,
             round(avg(r.rating_seamanship)::numeric, 2) as rating_avg_seamanship,
             round(avg(r.rating_professionalism)::numeric, 2) as rating_avg_professionalism,
             round(avg(r.rating_cleanliness)::numeric, 2) as rating_avg_cleanliness,
             round(avg(r.rating_communication)::numeric, 2) as rating_avg_communication,
             round(avg(r.rating_hospitality)::numeric, 2) as rating_avg_hospitality,
             round(avg(r.rating_cooking)::numeric, 2) as rating_avg_cooking,
             round(avg(r.rating_service)::numeric, 2) as rating_avg_service,
             round(avg(r.rating_taste)::numeric, 2) as rating_avg_taste,
             round(avg(r.rating_variety)::numeric, 2) as rating_avg_variety,
             round(avg(r.rating_presentation)::numeric, 2) as rating_avg_presentation,
             round(avg(r.rating_adaptability)::numeric, 2) as rating_avg_adaptability,
             round(avg(r.rating_organization)::numeric, 2) as rating_avg_organization,
             round(avg(r.rating_maintenance)::numeric, 2) as rating_avg_maintenance,
             round(avg(r.rating_teamwork)::numeric, 2) as rating_avg_teamwork,
             round(avg(r.rating_diligence)::numeric, 2) as rating_avg_diligence
      from reviews r
      join bookings b on b.id = r.booking_id
      join skipper_secondary_roles ssr on ssr.skipper_id = v_primary_id and ssr.role = b.crew_role
      where r.reviewee_id = p_user_id and b.skipper_id = v_primary_id and b.crew_role <> v_primary_role
      group by ssr.id, b.crew_role
    loop
      update skipper_secondary_roles set
        rating_avg = v_row.rating_avg, rating_count = coalesce(v_row.rating_count, 0),
        rating_avg_safety = v_row.rating_avg_safety, rating_avg_seamanship = v_row.rating_avg_seamanship,
        rating_avg_professionalism = v_row.rating_avg_professionalism, rating_avg_cleanliness = v_row.rating_avg_cleanliness,
        rating_avg_communication = v_row.rating_avg_communication, rating_avg_hospitality = v_row.rating_avg_hospitality,
        rating_avg_cooking = v_row.rating_avg_cooking, rating_avg_service = v_row.rating_avg_service,
        rating_avg_taste = v_row.rating_avg_taste, rating_avg_variety = v_row.rating_avg_variety,
        rating_avg_presentation = v_row.rating_avg_presentation, rating_avg_adaptability = v_row.rating_avg_adaptability,
        rating_avg_organization = v_row.rating_avg_organization, rating_avg_maintenance = v_row.rating_avg_maintenance,
        rating_avg_teamwork = v_row.rating_avg_teamwork, rating_avg_diligence = v_row.rating_avg_diligence
      where id = v_row.secondary_id;
    end loop;
  end if;

  select round(avg(r.rating)::numeric, 2), count(*),
         round(avg(r.rating_boat_respect)::numeric, 2),
         round(avg(r.rating_responsibility)::numeric, 2),
         round(avg(r.rating_cooperation)::numeric, 2),
         round(avg(r.rating_consistency)::numeric, 2),
         round(avg(r.rating_conduct)::numeric, 2),
         round(avg(r.rating_tidiness)::numeric, 2)
    into v_client_avg, v_client_count,
         v_boat_respect, v_responsibility, v_cooperation, v_consistency, v_conduct, v_tidiness
    from reviews r
    join bookings b on b.id = r.booking_id
    where r.reviewee_id = p_user_id and b.client_id = p_user_id;

  update client_profiles set
    rating_avg = v_client_avg, rating_count = coalesce(v_client_count, 0),
    rating_avg_boat_respect = v_boat_respect, rating_avg_responsibility = v_responsibility,
    rating_avg_cooperation = v_cooperation, rating_avg_consistency = v_consistency,
    rating_avg_conduct = v_conduct, rating_avg_tidiness = v_tidiness
    where user_id = p_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Διαχείριση δεύτερου ρόλου από τον ίδιο τον επαγγελματία (πίνακας +
--    RLS παραπάνω καλύπτουν insert/update/delete) και έγκριση/απόρριψη από
--    τη διαχείριση.
-- ----------------------------------------------------------------------------
create or replace function admin_approve_secondary_role(p_id uuid) returns skipper_secondary_roles
language plpgsql security definer set search_path = public as $$
declare v skipper_secondary_roles%rowtype; v_uid uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform set_config('platform.trusted', 'true', true);
  update skipper_secondary_roles set approval_status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = p_id returning * into v;
  if not found then raise exception 'role_not_found'; end if;
  select user_id into v_uid from skipper_profiles where id = v.skipper_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'approve_skipper', v_uid, 'δεύτερος ρόλος: ' || v.role::text);
  return v;
end;
$$;

create or replace function admin_reject_secondary_role(p_id uuid, p_notes text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v skipper_secondary_roles%rowtype; v_uid uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform set_config('platform.trusted', 'true', true);
  update skipper_secondary_roles set deleted_at = now() where id = p_id returning * into v;
  if not found then raise exception 'role_not_found'; end if;
  select user_id into v_uid from skipper_profiles where id = v.skipper_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'reject_skipper', v_uid, 'δεύτερος ρόλος (' || v.role::text || '): ' || coalesce(p_notes, ''));
end;
$$;

create or replace function admin_list_pending_secondary_roles()
returns table (id uuid, skipper_id uuid, role crew_role, price_per_day numeric, license_number text,
               license_type text, years_experience int, created_at timestamptz,
               full_name text, phone_number text)
language sql stable security definer set search_path = public as $$
  select ssr.id, ssr.skipper_id, ssr.role, ssr.price_per_day, ssr.license_number,
         ssr.license_type, ssr.years_experience, ssr.created_at,
         sp.full_name, u.phone_number
  from skipper_secondary_roles ssr
  join skipper_profiles sp on sp.id = ssr.skipper_id
  join users u on u.id = sp.user_id
  where ssr.approval_status = 'pending' and ssr.deleted_at is null and (select is_admin())
  order by ssr.created_at;
$$;

grant execute on function admin_approve_secondary_role, admin_reject_secondary_role,
  admin_list_pending_secondary_roles to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Ό,τι δείχνει «ποιον ρόλο αφορά αυτή η κράτηση» στον απέναντι πρέπει να
--    διαβάζει το crew_role ΤΗΣ ΚΡΑΤΗΣΗΣ, όχι τον κύριο ρόλο του ανθρώπου —
--    ίδιος λόγος με το enforce_review_categories παραπάνω. Το get_booking_counterpart
--    είναι αυτό που τροφοδοτεί την ετικέτα ρόλου στο BookingPanel και ποιες
--    κατηγορίες θα ζητήσει η φόρμα αξιολόγησης.
-- ----------------------------------------------------------------------------
create or replace function get_booking_counterpart(p_booking_id uuid)
returns table(user_id uuid, full_name text, phone_number text, photo_url text, crew_role crew_role)
language plpgsql stable security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_uid uuid := auth.uid();
  v_counterpart_uid uuid;
  v_counterpart_is_client boolean;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found'; end if;

  if v_booking.status not in ('confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_skipper') then
    raise exception 'not_revealed';
  end if;

  if v_uid = v_booking.client_id then
    select sp.user_id into v_counterpart_uid from skipper_profiles sp where sp.id = v_booking.skipper_id;
    v_counterpart_is_client := false;
  elsif exists (select 1 from skipper_profiles sp where sp.id = v_booking.skipper_id and sp.user_id = v_uid) then
    v_counterpart_uid := v_booking.client_id;
    v_counterpart_is_client := true;
  else
    raise exception 'not_participant';
  end if;

  return query
    select
      u.id,
      coalesce(nullif(btrim(u.full_name), ''), sp2.full_name),
      u.phone_number,
      case
        when v_counterpart_is_client then coalesce(u.photo_url, sp2.photo_url)
        else coalesce(sp2.photo_url, u.photo_url)
      end,
      case when v_counterpart_is_client then null else v_booking.crew_role end
    from users u
    left join skipper_profiles sp2 on sp2.user_id = u.id
    where u.id = v_counterpart_uid;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Ανάθεση αντικατάστασης (admin_assign_replacement): η νέα κράτηση
--    κληρονομεί το crew_role της παλιάς (ίδια δουλειά, άλλος άνθρωπος), και
--    ο έλεγχος καταλληλότητας κοιτάει τον σωστό ρόλο — κύριο ή δεύτερο.
-- ----------------------------------------------------------------------------
create or replace function admin_assign_replacement(p_booking_id uuid, p_skipper_id uuid)
returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_old bookings%rowtype;
  v_new bookings%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_secondary skipper_secondary_roles%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select * into v_old from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_old.status <> 'cancelled_by_skipper' then raise exception 'not_awaiting_cover'; end if;

  if exists (
    select 1 from bookings r
    where r.replaces_booking_id = p_booking_id and r.status in ('confirmed', 'completed')
  ) then
    raise exception 'already_covered';
  end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if not found or v_skipper.deleted_at is not null then
    raise exception 'skipper_not_eligible';
  end if;
  if v_old.crew_role = v_skipper.role then
    if v_skipper.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  else
    select * into v_secondary from skipper_secondary_roles
      where skipper_id = p_skipper_id and role = v_old.crew_role and deleted_at is null for update;
    if not found or v_secondary.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  end if;
  if v_skipper.user_id = v_old.client_id then raise exception 'cannot_hire_self'; end if;

  -- The exclusion constraint on bookings would catch an overlap anyway; this
  -- turns it into an error an operator can read.
  if exists (
    select 1 from bookings b
    where b.skipper_id = p_skipper_id
      and b.status in ('confirmed', 'completed')
      and daterange(b.start_date, b.end_date, '[]') && daterange(v_old.start_date, v_old.end_date, '[]')
  ) then
    raise exception 'skipper_already_booked';
  end if;

  insert into bookings (
    booking_request_id, client_id, skipper_id, start_date, end_date,
    port_id, boat_type_id, skipper_claim_fee_amount, confirmed_at,
    status, replaces_booking_id, assigned_by, crew_role
  ) values (
    v_old.booking_request_id, v_old.client_id, p_skipper_id, v_old.start_date, v_old.end_date,
    v_old.port_id, v_old.boat_type_id, 0, now(),
    'confirmed', p_booking_id, auth.uid(), v_old.crew_role
  ) returning * into v_new;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
  values (auth.uid(), 'edit_booking', v_skipper.user_id, 'Ανάθεση αντικατάστασης');

  return v_new;
end;
$$;
