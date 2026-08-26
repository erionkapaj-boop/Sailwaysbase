-- ============================================================================
-- Ενεργοποίηση της ιδιότητας hostess ως πλήρη επαγγελματική ιδιότητα, στην
-- ίδια λογική με τον skipper: προφίλ (ίδιος πίνακας skipper_profiles, sp.role
-- = 'hostess'), έγκριση από admin, εμφάνιση σε αναζήτηση, κράτηση, 6
-- κατηγορίες αξιολόγησης δικές της.
--
-- Η hostess δεν οδηγεί σκάφος — δεν έχει "τύπο σκάφους" και δεν πρέπει ποτέ
-- να χρειάζεται έναν για να βρεθεί ή να κλειστεί. Το boat_type_id σε
-- booking_requests/bookings ήταν "not null" επειδή μέχρι τώρα κάθε κράτηση
-- ήταν σκάφος+skipper· γίνεται προαιρετικό, και τα δύο σημεία που το
-- απαιτούσαν ρητά (η αναζήτηση, η δημιουργία πρότασης admin) χαλαρώνουν μόνο
-- όταν η ζητούμενη ιδιότητα δεν είναι skipper.
-- ============================================================================

alter table booking_requests alter column boat_type_id drop not null;
alter table bookings alter column boat_type_id drop not null;

-- ----------------------------------------------------------------------------
-- Το «column rating_avg_safety does not exist» σημαίνει ότι το 0033 δεν
-- πρόλαβε ποτέ να δεσμευτεί εδώ (πιθανότατα κάτι αργότερα στο ίδιο script
-- έσκασε και έκανε rollback ολόκληρο το batch, πριν προλάβει να τρέξει το
-- COMMIT — το ίδιο ακριβώς που έπαθε το 0038 με το foreign key). Οπότε αυτό
-- εδώ ξαναφτιάχνει από την αρχή, με ασφάλεια, ό,τι χρειαζόταν ήδη το 0033
-- (οι 6 αρχικές κατηγορίες) πριν προσθέσει τις 2 καινούργιες της hostess —
-- κάθε "if not exists"/drop-πριν-recreate είναι ήδη ακίνδυνο να ξανατρέξει
-- ακόμα κι αν το 0033 ΕΙΧΕ τελικά περάσει.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_apply_review_rating on reviews;
alter table reviews alter column rating type numeric using rating::numeric;
create trigger trg_apply_review_rating
  after insert or update of rating, reviewee_id or delete on reviews
  for each row execute function apply_review_rating();

alter table reviews
  add column if not exists rating_safety int check (rating_safety is null or rating_safety between 1 and 5),
  add column if not exists rating_seamanship int check (rating_seamanship is null or rating_seamanship between 1 and 5),
  add column if not exists rating_professionalism int check (rating_professionalism is null or rating_professionalism between 1 and 5),
  add column if not exists rating_cleanliness int check (rating_cleanliness is null or rating_cleanliness between 1 and 5),
  add column if not exists rating_communication int check (rating_communication is null or rating_communication between 1 and 5),
  add column if not exists rating_hospitality int check (rating_hospitality is null or rating_hospitality between 1 and 5),
  -- 6 κατηγορίες αξιολόγησης για hostess: Καθαριότητα & Τάξη, Μαγειρική &
  -- Διατροφή, Εξυπηρέτηση, Επαγγελματισμός, Επικοινωνία, Φιλοξενία. Οι 4 από
  -- αυτές μοιράζονται στήλη με τις παραπάνω (cleanliness/professionalism/
  -- communication/hospitality) — ίδιο νόημα, μόνο η ελληνική ετικέτα διαφέρει
  -- ανά ιδιότητα (στο app layer). Μόνο 2 λείπουν πραγματικά: μαγειρική,
  -- εξυπηρέτηση.
  add column if not exists rating_cooking int check (rating_cooking is null or rating_cooking between 1 and 5),
  add column if not exists rating_service int check (rating_service is null or rating_service between 1 and 5);

alter table skipper_profiles
  add column if not exists rating_avg_safety numeric,
  add column if not exists rating_avg_seamanship numeric,
  add column if not exists rating_avg_professionalism numeric,
  add column if not exists rating_avg_cleanliness numeric,
  add column if not exists rating_avg_communication numeric,
  add column if not exists rating_avg_hospitality numeric,
  add column if not exists rating_avg_cooking numeric,
  add column if not exists rating_avg_service numeric;

create or replace function guard_skipper_profile_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.role := old.role;
  new.approval_status := old.approval_status;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.wallet_balance := old.wallet_balance;
  new.tier := old.tier;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.rating_avg_safety := old.rating_avg_safety;
  new.rating_avg_seamanship := old.rating_avg_seamanship;
  new.rating_avg_professionalism := old.rating_avg_professionalism;
  new.rating_avg_cleanliness := old.rating_avg_cleanliness;
  new.rating_avg_communication := old.rating_avg_communication;
  new.rating_avg_hospitality := old.rating_avg_hospitality;
  new.rating_avg_cooking := old.rating_avg_cooking;
  new.rating_avg_service := old.rating_avg_service;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  new.user_id := old.user_id;
  new.deleted_at := old.deleted_at;
  return new;
end;
$$;

-- Ποιος επιτρέπεται να στείλει τι, τώρα ανά ιδιότητα του αξιολογούμενου:
-- skipper -> οι 6 ναυτικές κατηγορίες (0033/0034, όπως ήταν)· hostess -> οι 6
-- δικές της· οποιαδήποτε άλλη ιδιότητα (μη υποστηριζόμενη ακόμα) ή ο πελάτης
-- -> απλό μονό 1-5, καμία κατηγορία. Κάθε κλάδος απορρίπτει ρητά και τις
-- κατηγορίες της άλλης ιδιότητας, ώστε να μην μπορεί ποτέ μια hostess να
-- καταλήξει με "rating_safety" ή αντίστροφα.
create or replace function enforce_review_categories() returns trigger
language plpgsql as $$
declare
  v_client_id uuid;
  v_skipper_user_id uuid;
  v_skipper_role crew_role;
begin
  select b.client_id, sp.user_id, sp.role into v_client_id, v_skipper_user_id, v_skipper_role
    from bookings b join skipper_profiles sp on sp.id = b.skipper_id
    where b.id = new.booking_id;

  if new.reviewee_id = v_skipper_user_id and v_skipper_role = 'skipper' then
    if new.rating_safety is null or new.rating_seamanship is null or new.rating_professionalism is null
       or new.rating_cleanliness is null or new.rating_communication is null or new.rating_hospitality is null
       or new.rating_cooking is not null or new.rating_service is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_safety + new.rating_seamanship + new.rating_professionalism +
      new.rating_cleanliness + new.rating_communication + new.rating_hospitality
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_skipper_user_id and v_skipper_role = 'hostess' then
    if new.rating_cleanliness is null or new.rating_cooking is null or new.rating_service is null
       or new.rating_professionalism is null or new.rating_communication is null or new.rating_hospitality is null
       or new.rating_safety is not null or new.rating_seamanship is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_cleanliness + new.rating_cooking + new.rating_service +
      new.rating_professionalism + new.rating_communication + new.rating_hospitality
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_skipper_user_id or new.reviewee_id = v_client_id then
    if new.rating_safety is not null or new.rating_seamanship is not null or new.rating_professionalism is not null
       or new.rating_cleanliness is not null or new.rating_communication is not null or new.rating_hospitality is not null
       or new.rating_cooking is not null or new.rating_service is not null then
      raise exception 'categories_not_allowed';
    end if;
  else
    raise exception 'reviewee_not_participant';
  end if;
  return new;
end;
$$;

-- Ξαναφτιάχνεται και το ίδιο το trigger, όχι μόνο η συνάρτηση από πάνω —
-- αν το 0033 έκανε rollback πριν το COMMIT, ούτε αυτό υπήρχε ποτέ, και μια
-- CREATE OR REPLACE FUNCTION χωρίς το trigger της απλά δεν πυροδοτείται ποτέ.
drop trigger if exists trg_review_categories on reviews;
create trigger trg_review_categories
  before insert on reviews
  for each row execute function enforce_review_categories();

create or replace function recalc_user_rating(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_skipper_avg numeric; v_skipper_count int;
  v_client_avg numeric; v_client_count int;
  v_safety numeric; v_seamanship numeric; v_professionalism numeric;
  v_cleanliness numeric; v_communication numeric; v_hospitality numeric;
  v_cooking numeric; v_service numeric;
begin
  if p_user_id is null then return; end if;

  select round(avg(r.rating)::numeric, 2), count(*),
         round(avg(r.rating_safety)::numeric, 2),
         round(avg(r.rating_seamanship)::numeric, 2),
         round(avg(r.rating_professionalism)::numeric, 2),
         round(avg(r.rating_cleanliness)::numeric, 2),
         round(avg(r.rating_communication)::numeric, 2),
         round(avg(r.rating_hospitality)::numeric, 2),
         round(avg(r.rating_cooking)::numeric, 2),
         round(avg(r.rating_service)::numeric, 2)
    into v_skipper_avg, v_skipper_count,
         v_safety, v_seamanship, v_professionalism, v_cleanliness, v_communication, v_hospitality,
         v_cooking, v_service
    from reviews r
    join bookings b on b.id = r.booking_id
    join skipper_profiles sp on sp.id = b.skipper_id
    where r.reviewee_id = p_user_id and sp.user_id = p_user_id;

  select round(avg(r.rating)::numeric, 2), count(*)
    into v_client_avg, v_client_count
    from reviews r
    join bookings b on b.id = r.booking_id
    where r.reviewee_id = p_user_id and b.client_id = p_user_id;

  perform set_config('platform.trusted', 'true', true);

  update skipper_profiles set
    rating_avg = v_skipper_avg, rating_count = coalesce(v_skipper_count, 0),
    rating_avg_safety = v_safety, rating_avg_seamanship = v_seamanship,
    rating_avg_professionalism = v_professionalism, rating_avg_cleanliness = v_cleanliness,
    rating_avg_communication = v_communication, rating_avg_hospitality = v_hospitality,
    rating_avg_cooking = v_cooking, rating_avg_service = v_service
    where user_id = p_user_id;
  update client_profiles set rating_avg = v_client_avg, rating_count = coalesce(v_client_count, 0)
    where user_id = p_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Αναζήτηση: προστίθεται p_crew_role (προεπιλογή 'skipper', άρα καμία
-- υπάρχουσα κλήση δεν σπάει) + φιλτράρισμα στην πραγματική ιδιότητα (ΔΕΝ
-- υπήρχε καθόλου πριν — μια hostess θα μπορούσε ήδη να διαρρεύσει σε
-- αναζήτηση skipper αν είχε ποτέ καταχωρηθεί). Ο έλεγχος τύπου σκάφους
-- ισχύει μόνο όταν ζητείται skipper· για κάθε άλλη ιδιότητα παραλείπεται
-- εντελώς, όπως ακριβώς το ΑΚΡΙΒΩΣ ίδιο κριτήριο στο ProfileForm
-- (hasBoatTypes = !isSkipper || ...).
-- ----------------------------------------------------------------------------
drop function if exists search_available_skippers(date, date, uuid, uuid, numeric, text);

drop view if exists skipper_public;
create view skipper_public as
  select id, role, photo_url, gender, years_experience, license_type, price_per_day,
         rating_avg, rating_count,
         case
           when (completed_bookings_count + cancellation_flag_count)
                < (select value from platform_settings where key = 'reliability_min_history')
           then null
           else reliability_percentage
         end as reliability_percentage,
         tier,
         rating_avg_safety, rating_avg_seamanship, rating_avg_professionalism,
         rating_avg_cleanliness, rating_avg_communication, rating_avg_hospitality,
         rating_avg_cooking, rating_avg_service
  from skipper_profiles
  where approval_status = 'approved' and deleted_at is null;
grant select on skipper_public to anon, authenticated;

create function search_available_skippers(
  p_start date,
  p_end date,
  p_port_id uuid,
  p_boat_type_id uuid,
  p_max_price numeric default null,
  p_gender text default null,
  p_crew_role crew_role default 'skipper'
) returns setof skipper_public
language sql stable as $$
  select sp.* from skipper_public sp
  where sp.role = p_crew_role
    and (
      p_crew_role <> 'skipper' or p_boat_type_id is null or exists (
        select 1 from skipper_boat_types bt where bt.skipper_id = sp.id and bt.boat_type_id = p_boat_type_id
      )
    )
    and not exists (
      select 1 from skipper_profiles own where own.id = sp.id and own.user_id = auth.uid()
    )
    and net_availability(sp.id, p_port_id) @> daterange(p_start, p_end, '[]')
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
    and (p_max_price is null or sp.price_per_day <= p_max_price)
    and (p_gender is null or sp.gender = p_gender)
  order by case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
           skipper_rank_score(
             sp.rating_avg,
             sp.rating_count,
             cancellation_standing(sp.id),
             skipper_response_rate(sp.id)
           ) desc;
$$;
grant execute on function search_available_skippers to anon, authenticated;

-- admin_create_offer: το "δικό σου ναύλο" ζητούσε άνευ όρων τύπο σκάφους· τον
-- ζητά πλέον μόνο όταν η ζητούμενη ιδιότητα είναι skipper (η αντικατάσταση
-- ακύρωσης, v_boat := v_old.boat_type_id, μένει ως έχει — παίρνει ό,τι είχε
-- η ακυρωμένη κράτηση, null ή μη).
create or replace function admin_create_offer(
  p_skipper_ids uuid[],
  p_role crew_role default 'skipper',
  p_start date default null,
  p_end date default null,
  p_port_id uuid default null,
  p_boat_type_id uuid default null,
  p_replaces_booking_id uuid default null,
  p_claim_fee numeric default null,
  p_note text default null,
  p_expires_hours int default 24
)
returns booking_requests
language plpgsql security definer set search_path = public as $$
declare
  v_old bookings%rowtype;
  v_req booking_requests%rowtype;
  v_client uuid;
  v_origin text;
  v_start date := p_start;
  v_end date := p_end;
  v_port uuid := p_port_id;
  v_boat uuid := p_boat_type_id;
  v_role crew_role := p_role;
  v_expires timestamptz;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then
    raise exception 'no_skippers_selected';
  end if;

  if p_replaces_booking_id is not null then
    select * into v_old from bookings where id = p_replaces_booking_id for update;
    if not found then raise exception 'booking_not_found'; end if;
    if v_old.status <> 'cancelled_by_skipper' then raise exception 'not_awaiting_cover'; end if;
    if exists (
      select 1 from bookings r
      where r.replaces_booking_id = p_replaces_booking_id and r.status in ('confirmed', 'completed')
    ) then
      raise exception 'already_covered';
    end if;
    if exists (
      select 1 from booking_requests br
      where br.replaces_booking_id = p_replaces_booking_id and br.status = 'open'
    ) then
      raise exception 'offer_already_open';
    end if;

    v_client := v_old.client_id;
    v_origin := 'admin_replacement';
    v_start := v_old.start_date;
    v_end := v_old.end_date;
    v_port := v_old.port_id;
    v_boat := v_old.boat_type_id;
    select sp.role into v_role
      from skipper_profiles sp where sp.id = v_old.skipper_id;
    v_role := coalesce(v_role, 'skipper'::crew_role);
  else
    v_client := auth.uid();
    v_origin := 'admin_direct';
    if v_start is null or v_end is null or v_port is null or (v_boat is null and v_role = 'skipper') then
      raise exception 'missing_job_details';
    end if;
    if v_end < v_start then raise exception 'invalid_date_range'; end if;
    insert into client_profiles (user_id) values (v_client) on conflict do nothing;
  end if;

  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_profiles sp on sp.id = s
    where sp.id is null or sp.approval_status <> 'approved' or sp.deleted_at is not null
  ) then
    raise exception 'invalid_skipper_selection';
  end if;

  if exists (
    select 1 from skipper_profiles sp
    where sp.id = any(p_skipper_ids) and sp.role <> v_role
  ) then
    raise exception 'role_mismatch';
  end if;

  v_expires := now() + make_interval(hours => greatest(coalesce(p_expires_hours, 24), 1));
  if v_expires > v_start::timestamptz then
    v_expires := greatest(now() + interval '30 minutes', v_start::timestamptz);
  end if;

  insert into booking_requests (
    client_id, start_date, end_date, port_id, boat_type_id,
    fee_amount, fee_paid_at, status, expires_at,
    origin, created_by, replaces_booking_id, claim_fee_amount, note, crew_role
  ) values (
    v_client, v_start, v_end, v_port, v_boat,
    0, now(), 'open', v_expires,
    v_origin, auth.uid(), p_replaces_booking_id, p_claim_fee, nullif(btrim(coalesce(p_note, '')), ''), v_role
  ) returning * into v_req;

  insert into booking_request_pings (booking_request_id, skipper_id)
    select v_req.id, s from unnest(p_skipper_ids) as s
    on conflict do nothing;

  insert into admin_actions (admin_id, action_type, target_booking_id, notes)
  values (
    auth.uid(), 'edit_booking', p_replaces_booking_id,
    case when v_origin = 'admin_replacement' then 'Πρόταση αντικατάστασης' else 'Απευθείας πρόταση εργασίας' end
    || ' σε ' || array_length(p_skipper_ids, 1) || ' άτομα'
  );

  return v_req;
end;
$$;

-- get_booking_counterpart: προστίθεται crew_role του απέναντι επαγγελματία
-- (null όταν ο απέναντι είναι ο πελάτης) — το BookingPanel το χρειάζεται για
-- να ξέρει ποιο σετ από τις 6 κατηγορίες να δείξει στη φόρμα αξιολόγησης.
drop function if exists get_booking_counterpart(uuid);
create function get_booking_counterpart(p_booking_id uuid)
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
      u.id, u.full_name, u.phone_number,
      case
        when v_counterpart_is_client then coalesce(u.photo_url, sp2.photo_url)
        else coalesce(sp2.photo_url, u.photo_url)
      end,
      case when v_counterpart_is_client then null else sp2.role end
    from users u
    left join skipper_profiles sp2 on sp2.user_id = u.id
    where u.id = v_counterpart_uid;
end;
$$;
grant execute on function get_booking_counterpart(uuid) to authenticated;

-- Αναδρομικός επαναϋπολογισμός, ακίνδυνος να ξανατρέξει: αν το 0033 ποτέ δεν
-- πρόλαβε να γεμίσει τις 6 αρχικές στήλες μέσου όρου, το κάνει τώρα.
do $$
declare r record;
begin
  for r in select distinct user_id from skipper_profiles loop
    perform recalc_user_rating(r.user_id);
  end loop;
end $$;
