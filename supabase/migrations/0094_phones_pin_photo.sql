-- ============================================================================
-- Κωδικός, τηλέφωνο, φωτογραφία — τρεις αποφάσεις του ιδιοκτήτη:
--
--   A. Ο κωδικός του χρήστη ΔΕΝ αλλάζει από ενέργειες admin, με μία εξαίρεση:
--      όταν ο ίδιος τον ξέχασε, ο admin του δίνει προσωρινό. Ο προσωρινός
--      σημειώνεται (pin_change_required) και ο χρήστης ορίζει δικό του στην
--      επόμενη είσοδο. Η «Σύνδεση ως» (που άλλαζε τον κωδικό) καταργείται
--      στον κώδικα της εφαρμογής· εδώ τίποτα δεν χρειάζεται γι' αυτό.
--      Οι κωδικοί επαναφοράς μέσω email αποκτούν όριο λάθος προσπαθειών.
--
--   B. Ο χρήστης αλλάζει μόνος του τηλέφωνο. Κάθε τηλέφωνο που έχει χρησιμο-
--      ποιήσει ποτέ ένας λογαριασμός μένει δεμένο σε αυτόν (user_phones, με
--      το ίδιο το τηλέφωνο ως primary key): κανένας άλλος λογαριασμός δεν
--      μπορεί να το πάρει ποτέ. Το users.phone_number κλειδώνει για απευθείας
--      αλλαγή από τον χρήστη (θα αποσυγχρόνιζε την ταυτότητα σύνδεσης) — αλλάζει
--      μόνο μέσω apply_phone_change, από τα API routes που αλλάζουν ταυτόχρονα
--      και το Supabase Auth.
--
--   C. Φωτογραφία: δεκτό μόνο πραγματικό ανέβασμα του ίδιου του χρήστη στο
--      bucket crew-photos (κλείνει το κενό javascript:/CSS injection σε ΟΛΗ την
--      εφαρμογή, όχι μόνο στο admin). Κάθε νέα φωτογραφία μπαίνει σε ουρά
--      ελέγχου (photo_reviewed_at = null): φαίνεται αμέσως, ο admin την
--      εγκρίνει ή την αφαιρεί, και ο χρήστης ειδοποιείται με τον λόγο.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Κωδικός
-- ----------------------------------------------------------------------------
alter table users add column if not exists pin_change_required boolean not null default false;
alter table email_reset_codes add column if not exists failed_attempts int not null default 0;
alter table users add column if not exists photo_reviewed_at timestamptz;

-- ----------------------------------------------------------------------------
-- B. Ιστορικό τηλεφώνων
-- ----------------------------------------------------------------------------
create table if not exists user_phones (
  phone text primary key,
  user_id uuid not null references users(id) on delete cascade,
  added_at timestamptz not null default now(),
  retired_at timestamptz,
  source text not null default 'registration' check (source in ('registration', 'self', 'admin', 'backfill')),
  changed_by uuid references users(id) on delete set null
);
create index if not exists user_phones_user_idx on user_phones (user_id, added_at desc);
alter table user_phones enable row level security;
drop policy if exists "own or admin reads phones" on user_phones;
create policy "own or admin reads phones" on user_phones for select using (user_id = auth.uid() or is_admin());
-- Καμία insert/update/delete policy: γράφεται μόνο από τα triggers παρακάτω.

insert into user_phones (phone, user_id, added_at, source)
  select phone_number, id, created_at, 'backfill' from users where phone_number is not null
  on conflict (phone) do nothing;

-- Πριν από αποθήκευση: κανένα τηλέφωνο που ανήκει/ανήκε σε άλλον λογαριασμό.
create or replace function users_phone_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_number is null then return new; end if;
  if tg_op = 'UPDATE' and new.phone_number is not distinct from old.phone_number then return new; end if;
  if exists (select 1 from user_phones where phone = new.phone_number and user_id <> new.id) then
    raise exception 'phone_taken';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_users_phone_guard on users;
create trigger trg_users_phone_guard before insert or update of phone_number on users
  for each row execute function users_phone_guard();

-- Μετά: το παλιό τηλέφωνο «αποσύρεται» (μένει στο ιστορικό), το νέο
-- καταγράφεται. Αν ο χρήστης γυρίσει σε δικό του παλιό τηλέφωνο, ξαναενεργο-
-- ποιείται η ίδια γραμμή.
create or replace function users_phone_track() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_source text := case when tg_op = 'INSERT' then 'registration'
                   else coalesce(nullif(current_setting('platform.phone_source', true), ''), 'admin') end;
  v_by uuid := nullif(current_setting('platform.phone_changed_by', true), '')::uuid;
begin
  if tg_op = 'UPDATE' then
    if new.phone_number is not distinct from old.phone_number then return null; end if;
    update user_phones set retired_at = now()
      where user_id = new.id and phone = old.phone_number and retired_at is null;
  end if;
  if new.phone_number is not null then
    insert into user_phones (phone, user_id, added_at, source, changed_by)
      values (new.phone_number, new.id, now(), v_source, v_by)
      on conflict (phone) do update
        set retired_at = null, added_at = now(), source = excluded.source, changed_by = excluded.changed_by
        where user_phones.user_id = excluded.user_id;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_users_phone_track on users;
create trigger trg_users_phone_track after insert or update of phone_number on users
  for each row execute function users_phone_track();

-- Το phone_number μπαίνει στα κλειδωμένα πεδία: είναι η ταυτότητα σύνδεσης
-- και πρέπει να αλλάζει μαζί με το Supabase Auth, όχι μόνο του. Το ίδιο και
-- το photo_reviewed_at (C παρακάτω): αλλιώς ο χρήστης θα μπορούσε να
-- σημειώσει μόνος του τη φωτογραφία του ως «ελέγχθηκε» και να την κρύψει
-- από την ουρά ελέγχου. (Το trigger του C τρέχει μετά από αυτό και το
-- μηδενίζει σε κάθε αλλαγή φωτογραφίας.)
create or replace function guard_users_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.role := old.role;
  new.status := old.status;
  new.is_test_account := old.is_test_account;
  new.is_staff_admin := old.is_staff_admin;
  new.wallet_balance := old.wallet_balance;
  new.phone_number := old.phone_number;
  new.photo_reviewed_at := old.photo_reviewed_at;
  return new;
end;
$$;

-- Η μόνη πόρτα για αλλαγή τηλεφώνου — μόνο για τα API routes (service role),
-- που έχουν ήδη αλλάξει το Supabase Auth phone πριν την καλέσουν.
create or replace function apply_phone_change(p_user_id uuid, p_phone text, p_source text, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_source not in ('self', 'admin') then raise exception 'bad_source'; end if;
  perform set_config('platform.trusted', 'true', true);
  perform set_config('platform.phone_source', p_source, true);
  perform set_config('platform.phone_changed_by', coalesce(p_actor::text, ''), true);
  update users set phone_number = p_phone where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
end;
$$;
revoke execute on function apply_phone_change(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function apply_phone_change(uuid, text, text, uuid) to service_role;

-- Για την εγγραφή, πριν δημιουργηθεί οποιαδήποτε ταυτότητα:
--   free            — ελεύθερο (ή τρέχον τηλέφωνο διαγραμμένου λογαριασμού,
--                     που ξαναζωντανεύει με την εγγραφή — 0074)
--   registered      — τρέχον τηλέφωνο ενεργού λογαριασμού
--   previously_used — παλιό τηλέφωνο κάποιου λογαριασμού, δεν ξαναδίνεται
create or replace function phone_registration_status(p_phone text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when up.phone is null then 'free'
    when up.retired_at is null and u.status = 'deleted' then 'free'
    when up.retired_at is null then 'registered'
    else 'previously_used'
  end
  from (select 1) x
  left join user_phones up on up.phone = p_phone
  left join users u on u.id = up.user_id;
$$;
grant execute on function phone_registration_status(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- C. Φωτογραφία
-- ----------------------------------------------------------------------------
-- Ό,τι δεν είναι απλό https URL δεν μπορεί να είναι πραγματικό ανέβασμα
-- (javascript:, data:, εισαγωγικά/παρενθέσεις για CSS injection).
update users set photo_url = null
  where photo_url is not null and photo_url !~ '^https://[^[:space:]"''()<>\\]+$';

create or replace function users_photo_check() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.photo_url is not distinct from old.photo_url then return new; end if;
  if new.photo_url is not null
     and new.photo_url !~ ('^https://[^/[:space:]]+/storage/v1/object/public/crew-photos/' || new.id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'invalid_photo_url';
  end if;
  new.photo_reviewed_at := null;
  return new;
end;
$$;
drop trigger if exists trg_users_photo_check on users;
create trigger trg_users_photo_check before insert or update of photo_url on users
  for each row execute function users_photo_check();

-- Μόνο εικόνες στο bucket (όχι SVG/HTML με script), μέχρι 5MB — ίδιο όριο με
-- το PhotoUpload. Σε βάση χωρίς αυτές τις στήλες (τοπικό stub) παραλείπεται.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets
      set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'], file_size_limit = 5242880
      where id = 'crew-photos'$q$;
  end if;
end $$;

create or replace function admin_approve_photo(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update users set photo_reviewed_at = now() where id = p_user_id and photo_url is not null;
  if not found then raise exception 'no_photo'; end if;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'approve_photo', p_user_id, '');
end;
$$;
grant execute on function admin_approve_photo(uuid) to authenticated;

-- Ίδιο με το 0092, και ειδοποιεί πλέον τον χρήστη με τον λόγο — αλλιώς η
-- φωτογραφία του απλώς εξαφανιζόταν χωρίς εξήγηση.
create or replace function admin_clear_photo(p_user_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_had_photo boolean;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select photo_url is not null into v_had_photo from users where id = p_user_id;
  if v_had_photo is null then raise exception 'user_not_found'; end if;
  if not v_had_photo then raise exception 'no_photo'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set photo_url = null where id = p_user_id;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'clear_photo', p_user_id, coalesce(nullif(btrim(p_reason), ''), ''));
  perform notify_user(p_user_id, 'photo_removed',
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')), '/platform/profile');
end;
$$;
grant execute on function admin_clear_photo(uuid, text) to authenticated;

-- Η ουρά ελέγχου: νέες/αλλαγμένες φωτογραφίες, παλαιότερες πρώτα.
create or replace function admin_list_photos_to_review() returns table (
  user_id uuid, full_name text, role user_role, crew_role crew_role, photo_url text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select u.id, u.full_name, u.role, sp.role, u.photo_url, u.created_at
  from users u left join skipper_profiles sp on sp.user_id = u.id
  where (select is_admin()) and u.photo_url is not null and u.photo_reviewed_at is null and u.status <> 'deleted'
  order by u.created_at
  limit 200;
$$;
grant execute on function admin_list_photos_to_review() to authenticated;

-- ----------------------------------------------------------------------------
-- Admin: μετρητές, αναζήτηση με παλιό τηλέφωνο, καρτέλα λογαριασμού
-- ----------------------------------------------------------------------------
create or replace function admin_overview()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not is_admin() then null else jsonb_build_object(
    'users_total',        (select count(*) from users where role <> 'admin'),
    'users_new_7d',       (select count(*) from users where role <> 'admin' and created_at > now() - interval '7 days'),
    'clients_total',      (select count(*) from users where role = 'client'),
    'pros_total',         (select count(*) from users where role = 'skipper'),
    'pending_approvals',  (select count(*) from skipper_profiles where approval_status = 'pending' and deleted_at is null),
    'pending_secondary_roles', (select count(*) from skipper_secondary_roles
                                where approval_status = 'pending' and deleted_at is null),
    'open_disputes',      (select count(*) from cancellation_reports where resolved_at is null),
    'contact_new',        (select count(*) from contact_messages where status = 'new'),
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
    'wallet_total',       (select coalesce(sum(wallet_balance), 0) from users),
    'fees_30d',           (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee') and created_at > now() - interval '30 days'),
    'fees_all_time',      (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee')),
    'refunds_30d',        (select coalesce(sum(amount), 0) from wallet_transactions
                           where type = 'refund_credit' and created_at > now() - interval '30 days'),
    'profiles_invisible', (select count(*) from skipper_profiles sp
                           where sp.approval_status = 'approved' and sp.deleted_at is null
                             and not skipper_is_search_visible(sp.id)),
    'pending_verification', (select count(*) from users
                             where phone_verified_at is null and status <> 'deleted' and role <> 'admin'),
    'pending_photos',   (select count(*) from users
                         where photo_url is not null and photo_reviewed_at is null and status <> 'deleted'),
    'suspended_count', (select count(*) from users where status = 'suspended')
  ) end;
$function$;

create or replace function admin_list_accounts(p_role user_role DEFAULT NULL::user_role, p_crew_role crew_role DEFAULT NULL::crew_role, p_search text DEFAULT ''::text, p_sort text DEFAULT 'recent'::text, p_limit integer DEFAULT 200, p_invisible_only boolean DEFAULT false, p_deleted_only boolean DEFAULT false, p_pending_verification_only boolean DEFAULT false, p_suspended_only boolean DEFAULT false)
 RETURNS TABLE(id uuid, role user_role, crew_role crew_role, full_name text, phone_number text, email text, status user_status, approval_status skipper_approval_status, created_at timestamp with time zone, last_seen_at timestamp with time zone, date_of_birth date, rating_avg numeric, rating_count integer, reliability_percentage numeric, completed_bookings_count integer, tier skipper_tier, is_test_account boolean, photo_url text, phone_verified_at timestamp with time zone, suspension_reason text)
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
    u.is_test_account,
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

create or replace function admin_account_detail(p_user_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with u as (
    select * from users where id = p_user_id
  ),
  sp as (
    select * from skipper_profiles where user_id = p_user_id
  ),
  cp as (
    select * from client_profiles where user_id = p_user_id
  ),
  secondary_roles as (
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'role', s.role, 'approval_status', s.approval_status,
      'price_per_day', s.price_per_day, 'license_number', s.license_number,
      'license_type', s.license_type, 'years_experience', s.years_experience,
      'rating_avg', s.rating_avg, 'rating_count', s.rating_count,
      'created_at', s.created_at, 'deleted_at', s.deleted_at
    ) order by s.created_at) as v
    from skipper_secondary_roles s where s.skipper_id = (select id from sp)
  ),
  languages as (
    select jsonb_agg(l.name order by l.name) as v
    from user_languages ul join languages l on l.id = ul.language_id
    where ul.user_id = p_user_id
  ),
  boat_types as (
    select jsonb_agg(b.name order by b.name) as v
    from skipper_boat_types sbt join boat_types b on b.id = sbt.boat_type_id
    where sbt.skipper_id = (select id from sp)
  ),
  availability as (
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'start_date', w.start_date, 'end_date', w.end_date, 'crew_role', w.crew_role,
      'regions', (select jsonb_agg(r.name order by r.name) from availability_window_regions awr
                  join regions r on r.id = awr.region_id where awr.window_id = w.id)
    ) order by w.start_date) as v
    from availability_windows w where w.skipper_id = (select id from sp)
  ),
  requests as (
    select jsonb_agg(jsonb_build_object(
      'id', br.id, 'status', br.status, 'start_date', br.start_date, 'end_date', br.end_date,
      'crew_role', coalesce(br.crew_role, 'skipper'), 'place', booking_place(br.departure_point, br.port_id, br.region_id),
      'fee_amount', br.fee_amount, 'fee_paid_at', br.fee_paid_at, 'expires_at', br.expires_at,
      'origin', br.origin, 'created_at', br.created_at
    ) order by br.created_at desc) as v
    from booking_requests br where br.client_id = p_user_id
  ),
  pings as (
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'status', p.status, 'sent_at', p.sent_at,
      'request', jsonb_build_object(
        'id', br.id, 'status', br.status, 'start_date', br.start_date, 'end_date', br.end_date,
        'crew_role', coalesce(br.crew_role, 'skipper'),
        'place', booking_place(br.departure_point, br.port_id, br.region_id)
      )
    ) order by p.sent_at desc) as v
    from booking_request_pings p join booking_requests br on br.id = p.booking_request_id
    where p.skipper_id = (select id from sp)
  ),
  bookings_client as (
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'status', b.status, 'start_date', b.start_date, 'end_date', b.end_date,
      'crew_role', coalesce(b.crew_role, 'skipper'), 'place', booking_place(b.departure_point, b.port_id, b.region_id),
      'pro_id', sp2.user_id, 'pro_name', coalesce(nullif(btrim(sp2.full_name), ''), pu.full_name),
      'confirmed_at', b.confirmed_at, 'cancelled_at', b.cancelled_at
    ) order by b.created_at desc) as v
    from bookings b
    join skipper_profiles sp2 on sp2.id = b.skipper_id
    join users pu on pu.id = sp2.user_id
    where b.client_id = p_user_id
  ),
  bookings_pro as (
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'status', b.status, 'start_date', b.start_date, 'end_date', b.end_date,
      'crew_role', coalesce(b.crew_role, 'skipper'), 'place', booking_place(b.departure_point, b.port_id, b.region_id),
      'client_id', b.client_id, 'client_name', cu.full_name,
      'confirmed_at', b.confirmed_at, 'cancelled_at', b.cancelled_at
    ) order by b.created_at desc) as v
    from bookings b join users cu on cu.id = b.client_id
    where b.skipper_id = (select id from sp)
  ),
  delivery_requests_out as (
    select jsonb_agg(jsonb_build_object(
      'id', dr.id, 'origin_point', dr.origin_point, 'destination_point', dr.destination_point,
      'distance_miles', dr.distance_miles, 'departure_date', dr.departure_date, 'created_at', dr.created_at,
      'roles', (select jsonb_agg(jsonb_build_object(
                  'id', rr.id, 'crew_role', rr.crew_role, 'status', rr.status,
                  'offered_price', rr.offered_price, 'client_fee', rr.client_fee, 'expires_at', rr.expires_at
                ) order by rr.created_at) from delivery_role_requests rr where rr.delivery_request_id = dr.id)
    ) order by dr.created_at desc) as v
    from delivery_requests dr where dr.client_id = p_user_id
  ),
  delivery_pings as (
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'status', p.status, 'sent_at', p.sent_at,
      'role', rr.crew_role, 'offered_price', rr.offered_price,
      'origin_point', dr.origin_point, 'destination_point', dr.destination_point
    ) order by p.sent_at desc) as v
    from delivery_role_pings p
    join delivery_role_requests rr on rr.id = p.delivery_role_request_id
    join delivery_requests dr on dr.id = rr.delivery_request_id
    where p.skipper_id = (select id from sp)
  ),
  delivery_bookings_client as (
    select jsonb_agg(jsonb_build_object(
      'id', db.id, 'status', db.status, 'crew_role', db.crew_role, 'departure_date', db.departure_date,
      'origin_point', db.origin_point, 'destination_point', db.destination_point, 'offered_price', db.offered_price,
      'pro_id', sp3.user_id, 'pro_name', coalesce(nullif(btrim(sp3.full_name), ''), pu3.full_name),
      'cancelled_at', db.cancelled_at, 'cancelled_by', db.cancelled_by, 'created_at', db.created_at
    ) order by db.created_at desc) as v
    from delivery_bookings db
    join skipper_profiles sp3 on sp3.id = db.skipper_id
    join users pu3 on pu3.id = sp3.user_id
    where db.client_id = p_user_id
  ),
  delivery_bookings_pro as (
    select jsonb_agg(jsonb_build_object(
      'id', db.id, 'status', db.status, 'crew_role', db.crew_role, 'departure_date', db.departure_date,
      'origin_point', db.origin_point, 'destination_point', db.destination_point, 'professional_fee_amount', db.professional_fee_amount,
      'client_id', db.client_id, 'client_name', cu2.full_name,
      'cancelled_at', db.cancelled_at, 'cancelled_by', db.cancelled_by, 'created_at', db.created_at
    ) order by db.created_at desc) as v
    from delivery_bookings db join users cu2 on cu2.id = db.client_id
    where db.skipper_id = (select id from sp)
  ),
  wallet as (
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'type', w.type, 'amount', w.amount, 'created_at', w.created_at
    ) order by w.created_at desc) as v
    from (select * from wallet_transactions where user_id = p_user_id order by created_at desc limit 200) w
  ),
  disputes as (
    select jsonb_agg(jsonb_build_object(
      'id', cr.id, 'booking_id', cr.booking_id, 'at_fault_party', cr.at_fault_party, 'reason', cr.reason,
      'created_at', cr.created_at, 'resolved_at', cr.resolved_at, 'resolution_note', cr.resolution_note,
      'reported_by_self', cr.reported_by = p_user_id,
      'place', booking_place(b.departure_point, b.port_id, b.region_id), 'start_date', b.start_date
    ) order by cr.created_at desc) as v
    from cancellation_reports cr join bookings b on b.id = cr.booking_id
    where cr.reported_by = p_user_id or b.client_id = p_user_id
       or b.skipper_id = (select id from sp)
  ),
  contact_msgs as (
    select jsonb_agg(jsonb_build_object(
      'id', cm.id, 'topic', cm.topic, 'message', cm.message, 'status', cm.status, 'created_at', cm.created_at
    ) order by cm.created_at desc) as v
    from contact_messages cm where cm.user_id = p_user_id
  ),
  flags as (
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'type', f.type, 'detail', f.detail, 'created_at', f.created_at, 'resolved_at', f.resolved_at,
      'related_user_id', f.related_user_id,
      'related_name', ru.full_name
    ) order by f.created_at desc) as v
    from admin_flags f left join users ru on ru.id = f.related_user_id
    where f.user_id = p_user_id or f.related_user_id = p_user_id
  ),
  logins as (
    select jsonb_agg(jsonb_build_object(
      'success', la.success, 'created_at', la.created_at
    ) order by la.created_at desc) as v
    from (select * from login_attempts where phone in (select phone from user_phones where user_id = p_user_id union select phone_number from u) order by created_at desc limit 100) la
  ),
  phones as (
    select jsonb_agg(jsonb_build_object(
      'phone', up.phone, 'added_at', up.added_at, 'retired_at', up.retired_at, 'source', up.source,
      'changed_by_name', coalesce(nullif(btrim(cb.full_name), ''), cb.phone_number)
    ) order by up.retired_at is null desc, up.added_at desc) as v
    from user_phones up left join users cb on cb.id = up.changed_by
    where up.user_id = p_user_id
  ),
  reset_codes as (
    select jsonb_agg(jsonb_build_object(
      'created_at', e.created_at, 'used_at', e.used_at, 'expires_at', e.expires_at
    ) order by e.created_at desc) as v
    from email_reset_codes e where e.user_id = p_user_id
  ),
  actions as (
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'action_type', a.action_type, 'notes', a.notes, 'created_at', a.created_at,
      'actor_id', a.admin_id, 'actor_name', coalesce(nullif(btrim(au.full_name), ''), au.phone_number),
      'self', a.admin_id = p_user_id
    ) order by a.created_at desc) as v
    from (select * from admin_actions where target_user_id = p_user_id order by created_at desc limit 300) a
    join users au on au.id = a.admin_id
  ),
  -- Ενιαίο χρονολογικό ιστορικό — κάθε κλάδος ένα είδος γεγονότος, ίδιο
  -- (kind, at, data) σχήμα με describeNotification. Χωρίς ετικέτες εδώ: το
  -- κείμενο αποφασίζεται στο client (adminAudit.js), για να αλλάζει χωρίς
  -- migration.
  timeline_rows as (
    select 'account_created' as kind, u.created_at as at,
           jsonb_build_object('role', u.role) as data
    from u
    union all
    -- Χωρίς τις «επιτυχημένες συνδέσεις» που δεν έκανε ο ίδιος ο χρήστης: το
    -- reset-pin γράφει μια γραμμή success για να ξεκλειδώσει τον λογαριασμό,
    -- και η «Σύνδεση ως» μπαίνει με το τηλέφωνό του. Και οι δύο φαίνονται ήδη
    -- ως ενέργεια admin — ως «Σύνδεση» του χρήστη θα ήταν ψέμα στο ιστορικό.
    select case when la.success then 'login_success' else 'login_failed' end, la.created_at, '{}'::jsonb
    from login_attempts la
    where la.phone in (select phone from user_phones where user_id = p_user_id union select phone_number from u)
      and not (la.success and exists (
        select 1 from admin_actions a
        where a.target_user_id = p_user_id
          and ((a.action_type = 'reset_pin'
                and la.created_at between a.created_at - interval '5 seconds' and a.created_at + interval '1 second')
            or (a.action_type = 'impersonate_start'
                and la.created_at between a.created_at - interval '5 seconds' and a.created_at + interval '60 seconds'))
      ))
    union all
    select 'request_sent', br.created_at,
           jsonb_build_object('role', coalesce(br.crew_role, 'skipper'), 'place', booking_place(br.departure_point, br.port_id, br.region_id),
                              'start_date', br.start_date, 'end_date', br.end_date, 'status', br.status, 'fee_amount', br.fee_amount)
    from booking_requests br where br.client_id = p_user_id
    union all
    select 'booking_confirmed', b.confirmed_at,
           jsonb_build_object('side', case when b.client_id = p_user_id then 'client' else 'pro' end,
                              'place', booking_place(b.departure_point, b.port_id, b.region_id),
                              'start_date', b.start_date, 'end_date', b.end_date, 'role', coalesce(b.crew_role, 'skipper'),
                              'counterpart', case when b.client_id = p_user_id
                                then coalesce(nullif(btrim(sp4.full_name), ''), pu4.full_name) else cu3.full_name end)
    from bookings b
    join users cu3 on cu3.id = b.client_id
    join skipper_profiles sp4 on sp4.id = b.skipper_id
    join users pu4 on pu4.id = sp4.user_id
    where (b.client_id = p_user_id or b.skipper_id = (select id from sp)) and b.confirmed_at is not null
    union all
    select 'booking_cancelled', b.cancelled_at,
           jsonb_build_object('side', case when b.client_id = p_user_id then 'client' else 'pro' end,
                              'place', booking_place(b.departure_point, b.port_id, b.region_id),
                              'reason', b.cancellation_reason, 'status', b.status)
    from bookings b
    where (b.client_id = p_user_id or b.skipper_id = (select id from sp)) and b.cancelled_at is not null
    union all
    select 'delivery_request_sent', dr.created_at,
           jsonb_build_object('origin_point', dr.origin_point, 'destination_point', dr.destination_point, 'distance_miles', dr.distance_miles)
    from delivery_requests dr where dr.client_id = p_user_id
    union all
    select 'delivery_confirmed', db.created_at,
           jsonb_build_object('side', case when db.client_id = p_user_id then 'client' else 'pro' end,
                              'origin_point', db.origin_point, 'destination_point', db.destination_point, 'role', db.crew_role)
    from delivery_bookings db where db.client_id = p_user_id or db.skipper_id = (select id from sp)
    union all
    select 'delivery_cancelled', db.cancelled_at,
           jsonb_build_object('side', case when db.client_id = p_user_id then 'client' else 'pro' end,
                              'origin_point', db.origin_point, 'destination_point', db.destination_point,
                              'by', db.cancelled_by, 'reason', db.cancellation_reason)
    from delivery_bookings db
    where (db.client_id = p_user_id or db.skipper_id = (select id from sp)) and db.cancelled_at is not null
    union all
    select 'wallet_txn', w.created_at, jsonb_build_object('type', w.type, 'amount', w.amount)
    from wallet_transactions w where w.user_id = p_user_id
    union all
    select 'dispute_reported', cr.created_at,
           jsonb_build_object('self', cr.reported_by = p_user_id, 'reason', cr.reason,
                              'place', booking_place(b.departure_point, b.port_id, b.region_id))
    from cancellation_reports cr join bookings b on b.id = cr.booking_id
    where cr.reported_by = p_user_id or b.client_id = p_user_id or b.skipper_id = (select id from sp)
    union all
    select 'contact_message', cm.created_at, jsonb_build_object('topic', cm.topic, 'status', cm.status)
    from contact_messages cm where cm.user_id = p_user_id
    union all
    select 'email_reset_requested', e.created_at, jsonb_build_object('used', e.used_at is not null)
    from email_reset_codes e where e.user_id = p_user_id
    union all
    select 'admin_flag', f.created_at, jsonb_build_object('type', f.type, 'resolved', f.resolved_at is not null)
    from admin_flags f where f.user_id = p_user_id or f.related_user_id = p_user_id
    union all
    select 'secondary_role_requested', s.created_at, jsonb_build_object('role', s.role)
    from skipper_secondary_roles s where s.skipper_id = (select id from sp)
    union all
    -- Αλλαγή τηλεφώνου από τον ίδιο τον χρήστη. Η αλλαγή από admin φαίνεται
    -- ήδη ως ενέργεια admin (edit_contact) — δεν τη διπλογράφουμε.
    select 'phone_changed', up.added_at, jsonb_build_object('phone', up.phone)
    from user_phones up where up.user_id = p_user_id and up.source = 'self'
    union all
    select 'admin_action', a.created_at,
           jsonb_build_object('action_type', a.action_type, 'notes', a.notes,
                              'actor_name', coalesce(nullif(btrim(au.full_name), ''), au.phone_number),
                              'self', a.admin_id = p_user_id)
    from admin_actions a join users au on au.id = a.admin_id
    where a.target_user_id = p_user_id
  ),
  -- Όριο στα 500 πιο πρόσφατα: συνδέσεις και κινήσεις πορτοφολιού δεν έχουν
  -- άνω όριο, και ένας παλιός, ενεργός λογαριασμός θα φόρτωνε χιλιάδες γραμμές.
  timeline as (
    select jsonb_agg(jsonb_build_object('kind', kind, 'at', at, 'data', data) order by at desc) as v
    from (select * from timeline_rows where at is not null order by at desc limit 500) t
  )
  select jsonb_build_object(
    'user', (select to_jsonb(u) from u),
    'client_profile', (select to_jsonb(cp) from cp),
    'skipper_profile', (select to_jsonb(sp) from sp),
    'secondary_roles', coalesce((select v from secondary_roles), '[]'::jsonb),
    'languages', coalesce((select v from languages), '[]'::jsonb),
    'boat_types', coalesce((select v from boat_types), '[]'::jsonb),
    'availability', coalesce((select v from availability), '[]'::jsonb),
    'requests', coalesce((select v from requests), '[]'::jsonb),
    'pings', coalesce((select v from pings), '[]'::jsonb),
    'bookings_client', coalesce((select v from bookings_client), '[]'::jsonb),
    'bookings_pro', coalesce((select v from bookings_pro), '[]'::jsonb),
    'delivery_requests', coalesce((select v from delivery_requests_out), '[]'::jsonb),
    'delivery_pings', coalesce((select v from delivery_pings), '[]'::jsonb),
    'delivery_bookings_client', coalesce((select v from delivery_bookings_client), '[]'::jsonb),
    'delivery_bookings_pro', coalesce((select v from delivery_bookings_pro), '[]'::jsonb),
    'wallet', coalesce((select v from wallet), '[]'::jsonb),
    'disputes', coalesce((select v from disputes), '[]'::jsonb),
    'contact_messages', coalesce((select v from contact_msgs), '[]'::jsonb),
    'flags', coalesce((select v from flags), '[]'::jsonb),
    'logins', coalesce((select v from logins), '[]'::jsonb),
    'phones', coalesce((select v from phones), '[]'::jsonb),
    'reset_codes', coalesce((select v from reset_codes), '[]'::jsonb),
    'admin_actions', coalesce((select v from actions), '[]'::jsonb),
    'timeline', coalesce((select v from timeline), '[]'::jsonb)
  )
  from u
  where (select is_admin());
$$;
grant execute on function admin_account_detail(uuid) to authenticated;
