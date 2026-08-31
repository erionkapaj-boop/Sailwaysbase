-- ============================================================================
-- Μεταφορά σκάφους (boat delivery) — νέα, αυτοτελής λειτουργία.
--
-- Ένας πελάτης χρειάζεται να μεταφερθεί ένα σκάφος από ένα σημείο σε άλλο.
-- Δηλώνει διαδρομή + μίλια (υποχρεωτικό, καθαρός αριθμός) + ημερομηνία
-- (σταθερή ή ευέλικτη ±Ν μέρες) + τι καλύπτεται (μεταφορικά/καύσιμα/φαγητό),
-- και για κάθε ρόλο που χρειάζεται (πάντα ένας skipper, προαιρετικά ναύτες)
-- προσφέρει τη δική του τιμή. Κάθε ρόλος είναι ξεχωριστή «σύνδεση»: δικό
-- του group υποψηφίων, δικό του accept/decline, δικό του fee.
--
-- Χρηματικό μοντέλο (συμφωνήθηκε ρητά με τον χρήστη):
--   - Η προσφερόμενη τιμή είναι ελεύθερη — δεν περνάει καν από την πλατφόρμα
--     (πληρώνεται απευθείας μεταξύ των δύο πλευρών, εκτός συστήματος).
--   - Η προμήθεια της πλατφόρμας υπολογίζεται ΑΝΕΞΑΡΤΗΤΑ από την προσφερόμενη
--     τιμή: μόνο από τα μίλια (το μοναδικό επαληθεύσιμο μέγεθος) επί ένα
--     σταθερό reference rate ανά ρόλο (4€/μίλι skipper, 1€/μίλι ναύτης).
--   - Ο επαγγελματίας πληρώνει πάντα σταθερό κατώφλι (default 50€) όταν
--     αναλαμβάνει. Ο πελάτης πληρώνει το υπόλοιπο της προμήθειας πάνω από
--     αυτό το κατώφλι, ποτέ λιγότερο από το ίδιο κατώφλι:
--       client_fee = greatest(min_fee, platform_commission - min_fee)
--   - Απόρριψη λόγω τιμής δεν είναι οριστική: ο πελάτης μπορεί να ανεβάσει
--     την τιμή στο ΙΔΙΟ αίτημα και να ειδοποιήσει ξανά όποιον είχε
--     απορρίψει, χωρίς νέα χρέωση (η προμήθεια δεν εξαρτάται από την τιμή).
--
-- Ορατότητα admin: κάθε αίτημα μεταφοράς είναι ορατό από τη στιγμή που
-- δημιουργείται (admin_list_delivery_requests), για spot-check στα μίλια —
-- το μόνο μέγεθος που μπορεί να "παίξει" κάποιος για να γλιτώσει προμήθεια.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Ρυθμίσεις
-- ----------------------------------------------------------------------------
insert into platform_settings (key, value) values
  ('delivery_platform_fee_pct', 5),
  ('delivery_min_fee', 50),
  ('delivery_skipper_rate_per_mile', 4),
  ('delivery_deckhand_rate_per_mile', 1),
  ('delivery_expiry_hours', 72)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 1. Δήλωση διαθεσιμότητας για μεταφορές — ανεξάρτητη από τη συνήθη
-- διαθεσιμότητα πληρώματος, ανά ρόλο (κύριος + δευτερεύοντες).
-- ----------------------------------------------------------------------------
alter table skipper_profiles add column if not exists delivery_available boolean not null default false;
alter table skipper_secondary_roles add column if not exists delivery_available boolean not null default false;

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
         (select n.country_name from nationalities n where n.id = sp.nationality_id) as nationality_country,
         sp.delivery_available
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
         (select n.country_name from nationalities n where n.id = sp.nationality_id),
         ssr.delivery_available
  from skipper_secondary_roles ssr
  join skipper_profiles sp on sp.id = ssr.skipper_id
  where ssr.approval_status = 'approved' and ssr.deleted_at is null and sp.deleted_at is null;

create or replace function update_delivery_availability(p_available boolean, p_crew_role crew_role default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_sp skipper_profiles%rowtype;
begin
  select * into v_sp from skipper_profiles where user_id = auth.uid();
  if not found then raise exception 'no_profile'; end if;

  if p_crew_role is null or p_crew_role = v_sp.role then
    update skipper_profiles set delivery_available = p_available where id = v_sp.id;
  end if;
  if p_crew_role is null or p_crew_role <> v_sp.role then
    update skipper_secondary_roles
      set delivery_available = p_available
      where skipper_id = v_sp.id and (p_crew_role is null or role = p_crew_role);
  end if;
end;
$$;
grant execute on function update_delivery_availability(boolean, crew_role) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. delivery_requests — η "αγγελία" μεταφοράς (διαδρομή, μίλια, ημερομηνία,
-- τι καλύπτεται). Δεν κρατάει τιμή — αυτή ζει ανά ρόλο, στο επόμενο table.
-- ----------------------------------------------------------------------------
create table if not exists delivery_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client_profiles(user_id),
  origin_point text not null check (btrim(origin_point) <> ''),
  destination_point text not null check (btrim(destination_point) <> ''),
  distance_miles numeric not null check (distance_miles > 0),
  date_mode text not null check (date_mode in ('fixed', 'flexible')),
  departure_date date not null,
  flexible_days int not null default 0 check (flexible_days >= 0 and (date_mode = 'flexible' or flexible_days = 0)),
  covers_travel boolean not null default false,
  covers_fuel boolean not null default false,
  covers_food boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists delivery_requests_client_idx on delivery_requests (client_id);

-- ----------------------------------------------------------------------------
-- 3. delivery_role_requests — μία θέση (ρόλος) πάνω σε ένα delivery_request.
-- Πάντα ένα skipper υποχρεωτικά· κάθε ναύτης είναι δική του, ξεχωριστή σειρά.
-- Οι commission_base/platform_commission/client_fee/professional_fee είναι
-- snapshot τη στιγμή δημιουργίας — ανεβάζοντας μετά μόνο το offered_price
-- (relist) δεν αλλάζουν, ακριβώς επειδή η προμήθεια δεν εξαρτάται απ' αυτό.
-- ----------------------------------------------------------------------------
create table if not exists delivery_role_requests (
  id uuid primary key default gen_random_uuid(),
  delivery_request_id uuid not null references delivery_requests(id) on delete cascade,
  crew_role crew_role not null check (crew_role in ('skipper', 'deckhand')),
  offered_price numeric not null check (offered_price >= 0),
  commission_base numeric not null,
  platform_commission numeric not null,
  client_fee numeric not null,
  professional_fee numeric not null,
  fee_paid_at timestamptz,
  status text not null default 'open' check (status in ('open', 'filled', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists delivery_role_requests_parent_idx on delivery_role_requests (delivery_request_id);
create index if not exists delivery_role_requests_status_idx on delivery_role_requests (status);

-- ----------------------------------------------------------------------------
-- 4. delivery_role_pings — οι υποψήφιοι που επέλεξε ο πελάτης για μία θέση.
-- Relist ξαναγράφει status='pending' στους ίδιους (ή νέους) υποψηφίους αντί
-- να φτιάχνει νέα γραμμή — είναι η ίδια αγγελία, όχι νέα.
-- ----------------------------------------------------------------------------
create table if not exists delivery_role_pings (
  id uuid primary key default gen_random_uuid(),
  delivery_role_request_id uuid not null references delivery_role_requests(id) on delete cascade,
  skipper_id uuid not null references skipper_profiles(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (delivery_role_request_id, skipper_id)
);
create index if not exists delivery_role_pings_skipper_idx on delivery_role_pings (skipper_id, status);

-- ----------------------------------------------------------------------------
-- 5. delivery_bookings — η επιβεβαιωμένη ανάθεση μιας θέσης.
-- Το exclude constraint εμποδίζει τον ίδιο skipper_id να έχει δύο
-- επιβεβαιωμένες μεταφορές με επικαλυπτόμενο εκτιμώμενο εύρος ημερομηνιών
-- (departure_date ± flexible_days) — η ίδια αρχή με το αντίστοιχο constraint
-- στο bookings, προσαρμοσμένη στο ότι εδώ η ημερομηνία μπορεί να είναι
-- ευέλικτη.
-- ----------------------------------------------------------------------------
create table if not exists delivery_bookings (
  id uuid primary key default gen_random_uuid(),
  delivery_role_request_id uuid not null unique references delivery_role_requests(id),
  delivery_request_id uuid not null references delivery_requests(id),
  client_id uuid not null references client_profiles(user_id),
  skipper_id uuid not null references skipper_profiles(id),
  crew_role crew_role not null,
  origin_point text not null,
  destination_point text not null,
  distance_miles numeric not null,
  departure_date date not null,
  flexible_days int not null default 0,
  estimated_range daterange generated always as (
    daterange(departure_date - flexible_days, departure_date + flexible_days, '[]')
  ) stored,
  covers_travel boolean not null default false,
  covers_fuel boolean not null default false,
  covers_food boolean not null default false,
  offered_price numeric not null,
  professional_fee_amount numeric not null,
  professional_fee_paid_at timestamptz not null default now(),
  status text not null default 'confirmed' check (status in ('confirmed', 'completed', 'cancelled')),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  exclude using gist (
    skipper_id with =,
    estimated_range with &&
  ) where (status = 'confirmed')
);
create index if not exists delivery_bookings_skipper_idx on delivery_bookings (skipper_id, status);
create index if not exists delivery_bookings_client_idx on delivery_bookings (client_id);

-- ----------------------------------------------------------------------------
-- 5β. wallet_transactions: δύο προαιρετικές στήλες αναφοράς, ίδιο μοτίβο με
-- τα ήδη υπάρχοντα related_booking_request_id/related_booking_id — ώστε η
-- κίνηση χρημάτων μιας μεταφοράς να είναι ανιχνεύσιμη μέχρι το ακριβές
-- αίτημα/κράτηση (ζητήθηκε ρητά πλήρης ορατότητα admin στις μεταφορές).
-- ----------------------------------------------------------------------------
alter table wallet_transactions add column if not exists related_delivery_role_request_id uuid references delivery_role_requests(id);
alter table wallet_transactions add column if not exists related_delivery_booking_id uuid references delivery_bookings(id);

-- ----------------------------------------------------------------------------
-- 6. RLS
-- ----------------------------------------------------------------------------
alter table delivery_requests enable row level security;
alter table delivery_role_requests enable row level security;
alter table delivery_role_pings enable row level security;
alter table delivery_bookings enable row level security;

drop policy if exists "client reads own delivery requests" on delivery_requests;
create policy "client reads own delivery requests" on delivery_requests for select using (
  client_id = auth.uid()
  or is_admin()
  or exists (
    select 1 from delivery_role_requests rr
    join delivery_role_pings p on p.delivery_role_request_id = rr.id
    join skipper_profiles sp on sp.id = p.skipper_id
    where rr.delivery_request_id = delivery_requests.id and sp.user_id = auth.uid()
  )
);
drop policy if exists "client inserts own delivery request" on delivery_requests;
create policy "client inserts own delivery request" on delivery_requests for insert with check (client_id = auth.uid());

drop policy if exists "delivery role requests visible to owner and pinged" on delivery_role_requests;
create policy "delivery role requests visible to owner and pinged" on delivery_role_requests for select using (
  is_admin()
  or exists (select 1 from delivery_requests dr where dr.id = delivery_request_id and dr.client_id = auth.uid())
  or exists (
    select 1 from delivery_role_pings p
    join skipper_profiles sp on sp.id = p.skipper_id
    where p.delivery_role_request_id = delivery_role_requests.id and sp.user_id = auth.uid()
  )
);

drop policy if exists "delivery ping visible to client and pinged skipper" on delivery_role_pings;
create policy "delivery ping visible to client and pinged skipper" on delivery_role_pings for select using (
  is_admin()
  or exists (
    select 1 from delivery_role_requests rr
    join delivery_requests dr on dr.id = rr.delivery_request_id
    where rr.id = delivery_role_request_id and dr.client_id = auth.uid()
  )
  or exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
);

drop policy if exists "delivery booking visible to participants" on delivery_bookings;
create policy "delivery booking visible to participants" on delivery_bookings for select using (
  is_admin()
  or client_id = auth.uid()
  or exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
);

-- ----------------------------------------------------------------------------
-- 7. create_delivery_request — φτιάχνει την αγγελία (χωρίς ρόλους/τιμές).
-- ----------------------------------------------------------------------------
create or replace function create_delivery_request(
  p_origin text,
  p_destination text,
  p_distance_miles numeric,
  p_date_mode text,
  p_departure_date date,
  p_flexible_days int,
  p_covers_travel boolean,
  p_covers_fuel boolean,
  p_covers_food boolean,
  p_notes text default null
) returns delivery_requests
language plpgsql security definer set search_path = public as $$
declare v_row delivery_requests%rowtype;
begin
  if not exists (select 1 from client_profiles where user_id = auth.uid()) then
    raise exception 'no_client_profile';
  end if;
  if p_distance_miles is null or p_distance_miles <= 0 then raise exception 'invalid_distance'; end if;
  if p_date_mode not in ('fixed', 'flexible') then raise exception 'invalid_date_mode'; end if;

  insert into delivery_requests (
    client_id, origin_point, destination_point, distance_miles,
    date_mode, departure_date, flexible_days,
    covers_travel, covers_fuel, covers_food, notes
  ) values (
    auth.uid(), btrim(p_origin), btrim(p_destination), p_distance_miles,
    p_date_mode, p_departure_date, case when p_date_mode = 'flexible' then coalesce(p_flexible_days, 0) else 0 end,
    coalesce(p_covers_travel, false), coalesce(p_covers_fuel, false), coalesce(p_covers_food, false), p_notes
  ) returning * into v_row;

  return v_row;
end;
$$;
grant execute on function create_delivery_request(text, text, numeric, text, date, int, boolean, boolean, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. create_delivery_role_request — προσθέτει μια θέση/ρόλο πάνω σε ένα ήδη
-- υπάρχον delivery_request, με τη δική της τιμή και υποψηφίους, και χρεώνει
-- αμέσως τον πελάτη το fee αυτής της θέσης (ίδιο μοτίβο με pay_and_broadcast).
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
  v_row delivery_role_requests%rowtype;
begin
  select * into v_dr from delivery_requests where id = p_delivery_request_id;
  if not found then raise exception 'delivery_request_not_found'; end if;
  if v_dr.client_id <> auth.uid() then raise exception 'not_owner'; end if;

  if p_crew_role not in ('skipper', 'deckhand') then raise exception 'invalid_role'; end if;
  if p_offered_price is null or p_offered_price < 0 then raise exception 'invalid_price'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_candidates_selected'; end if;

  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_public sp on sp.id = s and sp.role = p_crew_role
    where sp.id is null or coalesce(sp.delivery_available, false) = false
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
grant execute on function create_delivery_role_request(uuid, crew_role, numeric, uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. relist_delivery_role_request — ανέβασμα τιμής + νέα ειδοποίηση στους
-- ίδιους (ή/και νέους) υποψηφίους, ΧΩΡΙΣ νέα χρέωση πελάτη.
-- ----------------------------------------------------------------------------
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
  v_row delivery_role_requests%rowtype;
begin
  select * into v_rr from delivery_role_requests where id = p_role_request_id for update;
  if not found then raise exception 'role_request_not_found'; end if;
  select * into v_dr from delivery_requests where id = v_rr.delivery_request_id;
  if v_dr.client_id <> auth.uid() then raise exception 'not_owner'; end if;
  if v_rr.status <> 'open' then raise exception 'not_open'; end if;

  if p_new_price is null or p_new_price < 0 then raise exception 'invalid_price'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_candidates_selected'; end if;

  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_public sp on sp.id = s and sp.role = v_rr.crew_role
    where sp.id is null or coalesce(sp.delivery_available, false) = false
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
grant execute on function relist_delivery_role_request(uuid, numeric, uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. accept_delivery_role_request
-- ----------------------------------------------------------------------------
create or replace function accept_delivery_role_request(p_role_request_id uuid, p_skipper_id uuid)
returns delivery_bookings
language plpgsql security definer set search_path = public as $$
declare
  v_rr delivery_role_requests%rowtype;
  v_dr delivery_requests%rowtype;
  v_ping delivery_role_pings%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_wallet numeric;
  v_range daterange;
  v_overlap boolean;
  v_booking delivery_bookings%rowtype;
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_skipper_id::text));

  select * into v_rr from delivery_role_requests where id = p_role_request_id for update;
  if not found then raise exception 'role_request_not_found'; end if;
  if v_rr.status <> 'open' then raise exception 'not_open'; end if;
  if v_rr.expires_at <= now() then raise exception 'expired'; end if;
  select * into v_dr from delivery_requests where id = v_rr.delivery_request_id;

  select * into v_ping from delivery_role_pings
    where delivery_role_request_id = p_role_request_id and skipper_id = p_skipper_id for update;
  if not found then raise exception 'not_pinged'; end if;
  if v_ping.status <> 'pending' then raise exception 'already_resolved'; end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if v_skipper.deleted_at is not null then raise exception 'skipper_not_eligible'; end if;

  select wallet_balance into v_wallet from users where id = v_skipper.user_id for update;
  if v_wallet < v_rr.professional_fee then raise exception 'insufficient_wallet'; end if;

  v_range := daterange(v_dr.departure_date - v_dr.flexible_days, v_dr.departure_date + v_dr.flexible_days, '[]');

  select exists (
    select 1 from bookings
    where skipper_id = p_skipper_id
      and status in ('confirmed', 'completed')
      and daterange(start_date, end_date, '[]') && v_range
  ) into v_overlap;
  if v_overlap then raise exception 'date_overlap'; end if;

  select exists (
    select 1 from delivery_bookings
    where skipper_id = p_skipper_id
      and status = 'confirmed'
      and estimated_range && v_range
  ) into v_overlap;
  if v_overlap then raise exception 'date_overlap'; end if;

  insert into delivery_bookings (
    delivery_role_request_id, delivery_request_id, client_id, skipper_id, crew_role,
    origin_point, destination_point, distance_miles, departure_date, flexible_days,
    covers_travel, covers_fuel, covers_food, offered_price, professional_fee_amount
  ) values (
    p_role_request_id, v_dr.id, v_dr.client_id, p_skipper_id, v_rr.crew_role,
    v_dr.origin_point, v_dr.destination_point, v_dr.distance_miles, v_dr.departure_date, v_dr.flexible_days,
    v_dr.covers_travel, v_dr.covers_fuel, v_dr.covers_food, v_rr.offered_price, v_rr.professional_fee
  ) returning * into v_booking;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance - v_rr.professional_fee where id = v_skipper.user_id;
  insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id, related_delivery_booking_id)
    values (v_skipper.user_id, 'claim_fee', -v_rr.professional_fee, p_role_request_id, v_booking.id);

  update delivery_role_pings set status = 'accepted', responded_at = now() where id = v_ping.id;
  update delivery_role_pings set status = 'declined', responded_at = now()
    where delivery_role_request_id = p_role_request_id and id <> v_ping.id and status = 'pending';
  update delivery_role_requests set status = 'filled' where id = p_role_request_id;

  perform notify_user(
    v_dr.client_id, 'delivery_accepted',
    jsonb_build_object('origin', v_dr.origin_point, 'destination', v_dr.destination_point, 'role', v_rr.crew_role),
    '/platform/delivery/requests'
  );

  return v_booking;
end;
$$;
grant execute on function accept_delivery_role_request(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 11. decline_delivery_role_request
-- ----------------------------------------------------------------------------
create or replace function decline_delivery_role_request(p_role_request_id uuid, p_skipper_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_ping delivery_role_pings%rowtype;
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;

  select * into v_ping from delivery_role_pings
    where delivery_role_request_id = p_role_request_id and skipper_id = p_skipper_id for update;
  if not found then raise exception 'not_pinged'; end if;
  if v_ping.status <> 'pending' then raise exception 'already_resolved'; end if;

  update delivery_role_pings set status = 'declined', responded_at = now() where id = v_ping.id;
end;
$$;
grant execute on function decline_delivery_role_request(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 12. Αναγνώσεις
-- ----------------------------------------------------------------------------
create or replace function search_delivery_candidates(p_crew_role crew_role)
returns setof skipper_public
language sql stable security definer set search_path = public as $$
  select sp.* from skipper_public sp
  where sp.role = p_crew_role
    and coalesce(sp.delivery_available, false) = true
    and not exists (
      select 1 from skipper_profiles own where own.id = sp.id and own.user_id = auth.uid()
    )
  order by case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
           skipper_rank_score(
             sp.rating_avg,
             sp.rating_count,
             cancellation_standing(sp.id),
             skipper_response_rate(sp.id)
           ) desc;
$$;
grant execute on function search_delivery_candidates(crew_role) to authenticated, anon;

create or replace function list_my_delivery_requests()
returns table(
  request delivery_requests,
  role_requests jsonb
)
language sql stable security definer set search_path = public as $$
  select dr, coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', rr.id, 'crew_role', rr.crew_role, 'offered_price', rr.offered_price,
      'client_fee', rr.client_fee, 'professional_fee', rr.professional_fee,
      'status', rr.status, 'expires_at', rr.expires_at, 'created_at', rr.created_at,
      'pings', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'skipper_id', p.skipper_id, 'status', p.status,
          'full_name', sp.full_name, 'photo_url', sp.photo_url
        ) order by p.sent_at), '[]'::jsonb)
        from delivery_role_pings p
        join skipper_profiles sp on sp.id = p.skipper_id
        where p.delivery_role_request_id = rr.id
      ),
      'booking', (
        select to_jsonb(b) from delivery_bookings b where b.delivery_role_request_id = rr.id
      )
    ) order by rr.created_at)
    from delivery_role_requests rr where rr.delivery_request_id = dr.id
  ), '[]'::jsonb)
  from delivery_requests dr
  where dr.client_id = auth.uid()
  order by dr.created_at desc;
$$;
grant execute on function list_my_delivery_requests() to authenticated;

create or replace function list_my_delivery_pings()
returns table(
  ping delivery_role_pings,
  role_request delivery_role_requests,
  request delivery_requests
)
language sql stable security definer set search_path = public as $$
  select p, rr, dr
  from delivery_role_pings p
  join delivery_role_requests rr on rr.id = p.delivery_role_request_id
  join delivery_requests dr on dr.id = rr.delivery_request_id
  join skipper_profiles sp on sp.id = p.skipper_id
  where sp.user_id = auth.uid()
  order by p.sent_at desc;
$$;
grant execute on function list_my_delivery_pings() to authenticated;

create or replace function list_my_delivery_bookings()
returns setof delivery_bookings
language sql stable security definer set search_path = public as $$
  select b.* from delivery_bookings b
  where b.client_id = auth.uid()
     or exists (select 1 from skipper_profiles sp where sp.id = b.skipper_id and sp.user_id = auth.uid())
  order by b.created_at desc;
$$;
grant execute on function list_my_delivery_bookings() to authenticated;

create or replace function get_delivery_booking_counterpart(p_delivery_booking_id uuid)
returns table(user_id uuid, full_name text, phone_number text, photo_url text, crew_role crew_role)
language plpgsql stable security definer set search_path = public as $$
declare
  v_booking delivery_bookings%rowtype;
  v_uid uuid := auth.uid();
  v_counterpart_uid uuid;
  v_counterpart_is_client boolean;
begin
  select * into v_booking from delivery_bookings where id = p_delivery_booking_id;
  if not found then raise exception 'booking_not_found'; end if;

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
grant execute on function get_delivery_booking_counterpart(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 13. Admin — πλήρης ορατότητα σε κάθε αίτημα μεταφοράς, από τη δημιουργία.
-- ----------------------------------------------------------------------------
create or replace function admin_list_delivery_requests()
returns table(
  request delivery_requests,
  client_name text,
  role_requests jsonb
)
language sql stable security definer set search_path = public as $$
  select dr,
    coalesce(nullif(btrim(u.full_name), ''), u.phone_number),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rr.id, 'crew_role', rr.crew_role, 'offered_price', rr.offered_price,
        'commission_base', rr.commission_base, 'platform_commission', rr.platform_commission,
        'client_fee', rr.client_fee, 'professional_fee', rr.professional_fee,
        'status', rr.status, 'created_at', rr.created_at,
        'booking', (
          select jsonb_build_object(
            'skipper_id', b.skipper_id, 'skipper_name', sp.full_name, 'status', b.status
          )
          from delivery_bookings b join skipper_profiles sp on sp.id = b.skipper_id
          where b.delivery_role_request_id = rr.id
        )
      ) order by rr.created_at)
      from delivery_role_requests rr where rr.delivery_request_id = dr.id
    ), '[]'::jsonb)
  from delivery_requests dr
  join users u on u.id = dr.client_id
  where is_admin()
  order by dr.created_at desc;
$$;
grant execute on function admin_list_delivery_requests() to authenticated;

-- ----------------------------------------------------------------------------
-- 14. claim_booking_request: πλέον ελέγχει επίσης επικάλυψη με επιβεβαιωμένες
-- μεταφορές του ίδιου skipper_id — μία προσθήκη, καμία αλλαγή στην
-- υπάρχουσα λογική claim.
-- ----------------------------------------------------------------------------
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
      where skipper_id = p_skipper_id and role = v_req.crew_role and deleted_at is null;
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

  select exists (
    select 1 from bookings
    where skipper_id = p_skipper_id
      and status in ('confirmed', 'completed')
      and daterange(start_date, end_date, '[]') && daterange(v_req.start_date, v_req.end_date, '[]')
  ) into v_overlap;
  if v_overlap then
    raise exception 'date_overlap';
  end if;

  select exists (
    select 1 from delivery_bookings
    where skipper_id = p_skipper_id
      and status = 'confirmed'
      and estimated_range && daterange(v_req.start_date, v_req.end_date, '[]')
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
    party_size, private_cabin, crew_role,
    skipper_claim_fee_amount, skipper_claim_paid_at, confirmed_at, status,
    replaces_booking_id, assigned_by
  ) values (
    p_request_id, v_req.client_id, p_skipper_id, v_req.start_date, v_req.end_date, v_req.port_id, v_req.region_id, v_req.departure_point, v_req.boat_type_id,
    v_req.party_size, v_req.private_cabin, v_req.crew_role,
    v_claim_fee, now(), now(), 'confirmed',
    v_req.replaces_booking_id, v_req.created_by
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
-- 15. Ειδοποίηση όταν φτάνει ping μεταφοράς σε επαγγελματία.
-- ----------------------------------------------------------------------------
create or replace function notify_delivery_ping() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_rr delivery_role_requests%rowtype; v_dr delivery_requests%rowtype;
begin
  select user_id into v_uid from skipper_profiles where id = new.skipper_id;
  select * into v_rr from delivery_role_requests where id = new.delivery_role_request_id;
  select * into v_dr from delivery_requests where id = v_rr.delivery_request_id;
  perform notify_user(
    v_uid, 'delivery_request_received',
    jsonb_build_object(
      'origin', v_dr.origin_point, 'destination', v_dr.destination_point,
      'role', v_rr.crew_role, 'price', v_rr.offered_price
    ),
    '/platform/requests'
  );
  return null;
end;
$$;
drop trigger if exists trg_notify_delivery_ping on delivery_role_pings;
create trigger trg_notify_delivery_ping
  after insert on delivery_role_pings
  for each row execute function notify_delivery_ping();

-- relist_delivery_role_request() ξαναγράφει status='pending' σε ήδη
-- υπάρχουσες γραμμές (on conflict do update) αντί να φτιάχνει νέες — αυτό
-- δεν περνάει από το insert trigger πιο πάνω, οπότε χρειάζεται δικό του
-- update trigger για να ειδοποιηθεί ξανά ο υποψήφιος με τη νέα τιμή.
drop trigger if exists trg_notify_delivery_relist on delivery_role_pings;
create trigger trg_notify_delivery_relist
  after update of status on delivery_role_pings
  for each row when (new.status = 'pending' and old.status <> 'pending')
  execute function notify_delivery_ping();
