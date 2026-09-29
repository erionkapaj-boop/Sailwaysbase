-- ============================================================================
-- Έλεγχος ασφαλείας (docs/SECURITY_REVIEW.md): διορθώσεις.
--
--  #2 Οι φύλακες των προφίλ, κριτικών και αιτημάτων άφηναν κάθε μέλος της
--     διαχείρισης να αλλάζει τα πάντα στις δικές του γραμμές (έγκριση,
--     βαθμολογίες, δωρεάν αιτήματα). Τώρα μόνο ο ιδιοκτήτης ή μια ελεγμένη
--     συνάρτηση.
--  #3 Ο υπάλληλος ενεργεί μόνο σε απλούς χρήστες: όχι στον εαυτό του, όχι σε
--     άλλον υπάλληλο, όχι στον ιδιοκτήτη.
--  #4 Έγκριση φωτογραφίας, επιβεβαίωση λογαριασμού και έγκριση επαγγελματία
--     από υπάλληλο δεν αποθηκεύονταν (από το 0112).
--  #6 Φωτογραφίες μόνο από τον δικό μας χώρο αποθήκευσης.
--  #7 Όρια σε αιτήματα, ειδοποιήσεις και αιτήματα αγοράς.
--  #8 Όρια μήκους σε κάθε ελεύθερο κείμενο· όριο στις περιόδους.
--  #9 Η αιτιολογία μιας απουσίας δεν διαβάζεται από τρίτους.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- #3 Ποιος μπορεί να ενεργήσει σε ποιον (ίδιος κανόνας με can_manage_account).
-- ---------------------------------------------------------------------------
create or replace function assert_admin_can_act_on(p_target uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_target is not null and not can_manage_account(p_target) then raise exception 'cannot_edit_admin'; end if;
end;
$$;
revoke execute on function assert_admin_can_act_on(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- #6 Φωτογραφίες: μόνο από τον χώρο αποθήκευσης της πλατφόρμας. Αλλιώς μια
-- διεύθυνση άλλου διακομιστή θα φόρτωνε σε κάθε επισκέπτη της αναζήτησης
-- (και θα κατέγραφε ποιος την είδε).
-- ---------------------------------------------------------------------------
create table if not exists platform_config (
  key text primary key,
  value text not null
);
alter table platform_config enable row level security;
revoke all on platform_config from public, anon, authenticated;

-- Ο διακομιστής των φωτογραφιών που ήδη υπάρχουν (όλες ανέβηκαν από την
-- εφαρμογή). Αν δεν υπάρχει καμία, ορίζεται με το χέρι (docs/PENDING.md).
insert into platform_config (key, value)
select 'photo_host', h from (
  select substring(photo_url from '^https://([^/]+)/') as h, count(*) as n
    from users where photo_url is not null group by 1 order by 2 desc limit 1
) x where h is not null
on conflict (key) do nothing;

create or replace function allowed_photo_host(p_host text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from platform_config where key = 'photo_host')
      then p_host = (select value from platform_config where key = 'photo_host')
    else p_host ~ '^[a-z0-9]+\.supabase\.co$'
  end;
$$;
revoke execute on function allowed_photo_host(text) from public, anon, authenticated;

create or replace function users_photo_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.photo_url is not distinct from old.photo_url then return new; end if;
  if new.photo_url is not null
     and (new.photo_url !~ ('^https://[^/[:space:]]+/storage/v1/object/public/crew-photos/' || new.id::text || '/[A-Za-z0-9._-]+$')
          or not allowed_photo_host(substring(new.photo_url from '^https://([^/]+)/'))) then
    raise exception 'invalid_photo_url';
  end if;
  new.photo_reviewed_at := null;
  return new;
end;
$$;

-- Ό,τι ήδη δείχνει αλλού, φεύγει.
do $$
begin
  perform set_config('platform.trusted', 'true', true);
  update users set photo_url = null
   where photo_url is not null
     and not allowed_photo_host(substring(photo_url from '^https://([^/]+)/'));
end;
$$;

-- ---------------------------------------------------------------------------
-- #8 Μήκος κειμένων. NOT VALID: ό,τι υπάρχει μένει, κάθε νέα εγγραφή ελέγχεται.
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select * from (values
    ('booking_requests', 'departure_point', 200), ('booking_requests', 'arrival_point', 200),
    ('booking_requests', 'note', 2000), ('booking_requests', 'gender_filter', 20),
    ('bookings', 'departure_point', 200), ('bookings', 'arrival_point', 200),
    ('bookings', 'cancellation_reason', 1000),
    ('delivery_requests', 'origin_point', 200), ('delivery_requests', 'destination_point', 200),
    ('delivery_requests', 'notes', 2000),
    ('delivery_bookings', 'origin_point', 200), ('delivery_bookings', 'destination_point', 200),
    ('delivery_bookings', 'cancellation_reason', 1000),
    ('cancellation_reports', 'reason', 2000),
    ('availability_blocks', 'reason', 300),
    ('skipper_profiles', 'full_name', 120), ('skipper_profiles', 'gender', 20),
    ('skipper_profiles', 'license_number', 60), ('skipper_profiles', 'license_type', 60),
    ('skipper_secondary_roles', 'license_number', 60), ('skipper_secondary_roles', 'license_type', 60)
  ) v(t, col, n) loop
    if not exists (select 1 from pg_constraint where conname = c.t || '_' || c.col || '_len') then
      execute format('alter table %I add constraint %I check (char_length(%I) <= %s) not valid',
                     c.t, c.t || '_' || c.col || '_len', c.col, c.n);
    end if;
  end loop;
end;
$$;

-- Περίοδοι και απουσίες: αρκετές για κάθε χρήση, όχι απεριόριστες.
create or replace function limit_availability_rows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('platform.trusted', true), '') = 'true' then return new; end if;
  if (select count(*) from (
        select 1 from availability_windows where skipper_id = new.skipper_id and end_date >= current_date
        union all select 1 from availability_blocks where skipper_id = new.skipper_id and end_date >= current_date
        union all select 1 from delivery_availability_windows where skipper_id = new.skipper_id and end_date >= current_date
      ) x) >= 300 then
    raise exception 'too_many_periods';
  end if;
  return new;
end;
$$;
revoke execute on function limit_availability_rows() from public, anon, authenticated;
drop trigger if exists ac_limit_rows on availability_windows;
create trigger ac_limit_rows before insert on availability_windows for each row execute function limit_availability_rows();
drop trigger if exists ac_limit_rows on availability_blocks;
create trigger ac_limit_rows before insert on availability_blocks for each row execute function limit_availability_rows();
drop trigger if exists ac_limit_rows on delivery_availability_windows;
create trigger ac_limit_rows before insert on delivery_availability_windows for each row execute function limit_availability_rows();

-- ---------------------------------------------------------------------------
-- #9 Απουσίες: οι ημερομηνίες είναι δημόσιες (η αναζήτηση τις χρειάζεται), η
-- αιτιολογία όχι.
-- ---------------------------------------------------------------------------
revoke select on availability_blocks from anon, authenticated;
grant select (id, skipper_id, start_date, end_date, created_at) on availability_blocks to anon, authenticated;

-- #2 Φύλακες: μόνο ο ιδιοκτήτης (ή μια ελεγμένη συνάρτηση) παρακάμπτει τους κανόνες.

CREATE OR REPLACE FUNCTION public.guard_skipper_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_owner_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.approval_status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
    new.tier := 'medium';
    new.rating_avg := null;
    new.rating_count := 0;
    new.rating_avg_safety := null; new.rating_avg_seamanship := null;
    new.rating_avg_professionalism := null; new.rating_avg_cleanliness := null;
    new.rating_avg_communication := null; new.rating_avg_hospitality := null;
    new.rating_avg_cooking := null; new.rating_avg_service := null;
    new.rating_avg_taste := null; new.rating_avg_variety := null;
    new.rating_avg_presentation := null; new.rating_avg_adaptability := null;
    new.rating_avg_organization := null; new.rating_avg_maintenance := null;
    new.rating_avg_teamwork := null; new.rating_avg_diligence := null;
    new.completed_bookings_count := 0;
    new.cancellation_flag_count := 0;
    new.deleted_at := null;
    return new;
  end if;
  new.role := old.role;
  new.approval_status := old.approval_status;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
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
  new.rating_avg_taste := old.rating_avg_taste;
  new.rating_avg_variety := old.rating_avg_variety;
  new.rating_avg_presentation := old.rating_avg_presentation;
  new.rating_avg_adaptability := old.rating_avg_adaptability;
  new.rating_avg_organization := old.rating_avg_organization;
  new.rating_avg_maintenance := old.rating_avg_maintenance;
  new.rating_avg_teamwork := old.rating_avg_teamwork;
  new.rating_avg_diligence := old.rating_avg_diligence;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  new.user_id := old.user_id;
  new.deleted_at := old.deleted_at;
  -- Εγκεκριμένος επαγγελματίας που αλλάζει δίπλωμα ή όνομα ξαναπερνά από
  -- έλεγχο (0107).
  if old.approval_status = 'approved'
     and (new.license_number is distinct from old.license_number
          or new.license_type is distinct from old.license_type
          or btrim(coalesce(new.full_name, '')) is distinct from btrim(coalesce(old.full_name, ''))) then
    new.approval_status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
    perform notify_user(new.user_id, 'profile_rereview', jsonb_build_object('role', new.role), '/platform/profile');
    -- (το trigger ειδοποίησης κοιτά μόνο αλλαγές που έστειλε ο ίδιος ο χρήστης)
    perform notify_admins('admin_pro_pending', jsonb_build_object('name', new.full_name, 'role', new.role),
                          '/platform/admin/approvals');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_client_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_owner_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.rating_avg := null;
    new.rating_count := 0;
    new.rating_avg_boat_respect := null;
    new.rating_avg_responsibility := null;
    new.rating_avg_cooperation := null;
    new.rating_avg_consistency := null;
    new.rating_avg_conduct := null;
    new.rating_avg_tidiness := null;
    new.completed_bookings_count := 0;
    new.cancellation_flag_count := 0;
    return new;
  end if;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.rating_avg_boat_respect := old.rating_avg_boat_respect;
  new.rating_avg_responsibility := old.rating_avg_responsibility;
  new.rating_avg_cooperation := old.rating_avg_cooperation;
  new.rating_avg_consistency := old.rating_avg_consistency;
  new.rating_avg_conduct := old.rating_avg_conduct;
  new.rating_avg_tidiness := old.rating_avg_tidiness;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_review_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_reply text := new.reply;
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_owner_admin() or auth.uid() is null then
    return new;
  end if;
  new := old;
  new.reply := v_reply;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_booking_request_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_owner_admin() or auth.uid() is null then
    return new;
  end if;
  new.client_id := auth.uid();
  new.origin := 'client';
  new.status := 'open';
  new.fee_amount := (select value from platform_settings where key = 'client_request_fee');
  new.fee_paid_at := null;
  new.claim_fee_amount := null;
  new.created_by := null;
  new.replaces_booking_id := null;
  new.expires_at := now() + (select value from platform_settings where key = 'unclaimed_expiry_hours') * interval '1 hour';
  new.client_decide_by := null;
  new.closed_reason := null;
  new.closed_at := null;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_booking_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_owner_admin() or auth.uid() is null then
    return new;
  end if;
  if new.start_date < current_date then raise exception 'start_in_past'; end if;
  if new.end_date - new.start_date > 60 then raise exception 'trip_too_long'; end if;
  if new.party_size is not null and new.party_size > 50 then raise exception 'party_too_large'; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_secondary_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_primary_role crew_role;
  v_trusted boolean := coalesce(current_setting('platform.trusted', true), '') = 'true' or is_owner_admin();
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
  if old.approval_status = 'approved'
     and (new.license_number is distinct from old.license_number
          or new.license_type is distinct from old.license_type) then
    new.approval_status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
    perform notify_user((select user_id from skipper_profiles where id = new.skipper_id), 'profile_rereview',
                        jsonb_build_object('role', new.role), '/platform/profile');
    perform notify_admins('admin_role_pending',
                          jsonb_build_object('name', (select full_name from skipper_profiles where id = new.skipper_id), 'role', new.role),
                          '/platform/admin/approvals');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_delivery_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if is_owner_admin() or auth.uid() is null then return new; end if;
  if new.departure_date < current_date then raise exception 'departure_in_past'; end if;
  if new.flexible_days > 30 then raise exception 'invalid_flexible_days'; end if;
  if new.distance_miles > 5000 then raise exception 'invalid_distance'; end if;
  return new;
end;
$function$;


-- #3 #4 Ενέργειες διαχείρισης: ο υπάλληλος μόνο σε απλούς χρήστες, όχι στον
-- εαυτό του· και οι αλλαγές αποθηκεύονται πραγματικά.

CREATE OR REPLACE FUNCTION public.admin_approve_skipper(p_user_id uuid)
 RETURNS skipper_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_new skipper_profiles%rowtype; v_existing skipper_profiles%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on(p_user_id);
  perform set_config('platform.trusted', 'true', true);

  select * into v_new from skipper_profiles where user_id = p_user_id;
  if not found then raise exception 'profile_not_found'; end if;

  update users set status = 'active' where id = p_user_id and status = 'draft';

  -- Licence is optional now, so only attempt the historical merge when one
  -- was actually supplied; otherwise every licence-less profile would match
  -- every other licence-less profile on NULL.
  if v_new.license_number is not null and btrim(v_new.license_number) <> '' then
    select * into v_existing from skipper_profiles
      where license_number = v_new.license_number and id <> v_new.id
      limit 1;
  end if;

  if found and v_existing.id is not null then
    delete from skipper_languages a using skipper_languages b
      where a.skipper_id = v_new.id and b.skipper_id = v_existing.id and a.language_id = b.language_id;
    update skipper_languages set skipper_id = v_existing.id where skipper_id = v_new.id;

    delete from skipper_boat_types a using skipper_boat_types b
      where a.skipper_id = v_new.id and b.skipper_id = v_existing.id and a.boat_type_id = b.boat_type_id;
    update skipper_boat_types set skipper_id = v_existing.id where skipper_id = v_new.id;

    delete from skipper_coverage_areas a using skipper_coverage_areas b
      where a.skipper_id = v_new.id and b.skipper_id = v_existing.id and a.port_id = b.port_id;
    update skipper_coverage_areas set skipper_id = v_existing.id where skipper_id = v_new.id;

    update skipper_availability set skipper_id = v_existing.id where skipper_id = v_new.id;

    delete from skipper_profiles where id = v_new.id;

    update skipper_profiles set
      user_id = p_user_id,
      full_name = v_new.full_name,
      role = v_new.role,
      photo_url = coalesce(v_new.photo_url, photo_url),
      gender = coalesce(v_new.gender, gender),
      years_experience = greatest(v_new.years_experience, years_experience),
      price_per_day = v_new.price_per_day,
      approval_status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      deleted_at = null
    where id = v_existing.id
    returning * into v_existing;

    insert into admin_actions (admin_id, action_type, target_user_id, notes)
      values (auth.uid(), 'approve_skipper', p_user_id, 'restored history from prior profile ' || v_existing.id);

    return v_existing;
  end if;

  update skipper_profiles set approval_status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = v_new.id
    returning * into v_new;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'approve_skipper', p_user_id, 'new profile');

  return v_new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reject_skipper(p_user_id uuid, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on(p_user_id);
  perform set_config('platform.trusted', 'true', true);
  update skipper_profiles set approval_status = 'rejected' where user_id = p_user_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'reject_skipper', p_user_id, p_notes);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_approve_photo(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on(p_user_id);
  perform set_config('platform.trusted', 'true', true);
  update users set photo_reviewed_at = now() where id = p_user_id and photo_url is not null;
  if not found then raise exception 'no_photo'; end if;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'approve_photo', p_user_id, '');
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_verify_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on(p_user_id);
  perform set_config('platform.trusted', 'true', true);
  update users set phone_verified_at = now() where id = p_user_id and phone_verified_at is null;
  get diagnostics v_count = row_count;
  if v_count = 1 then
    perform notify_user(p_user_id, 'account_verified', '{}'::jsonb, '/platform');
    insert into admin_actions (admin_id, action_type, target_user_id, notes)
      values (auth.uid(), 'verify_user', p_user_id, '');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_clear_photo(p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_had_photo boolean;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on(p_user_id);

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
$function$;

CREATE OR REPLACE FUNCTION public.admin_reactivate_account(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row users%rowtype;
  v_skipper_id uuid;
  v_new_status user_status;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on(p_user_id);

  select * into v_row from users where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status <> 'suspended' then raise exception 'not_suspended'; end if;

  select id into v_skipper_id from skipper_profiles where user_id = p_user_id;

  v_new_status := case
    when v_skipper_id is not null and exists (
      select 1 from skipper_profiles where id = v_skipper_id and approval_status <> 'approved'
    ) then 'draft'
    else 'active'
  end;

  perform set_config('platform.trusted', 'true', true);

  update users set status = v_new_status, suspension_reason = null where id = p_user_id;

  if v_skipper_id is not null then
    update skipper_profiles set deleted_at = null where id = v_skipper_id;
  end if;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'ban_account', p_user_id, 'Επαναφορά από αναστολή.');
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_approve_secondary_role(p_id uuid)
 RETURNS skipper_secondary_roles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v skipper_secondary_roles%rowtype; v_uid uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on((select sp.user_id from skipper_secondary_roles r join skipper_profiles sp on sp.id = r.skipper_id where r.id = p_id));
  perform set_config('platform.trusted', 'true', true);
  update skipper_secondary_roles set approval_status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = p_id returning * into v;
  if not found then raise exception 'role_not_found'; end if;
  select user_id into v_uid from skipper_profiles where id = v.skipper_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'approve_skipper', v_uid, 'δεύτερος ρόλος: ' || v.role::text);
  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reject_secondary_role(p_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v skipper_secondary_roles%rowtype; v_uid uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on((select sp.user_id from skipper_secondary_roles r join skipper_profiles sp on sp.id = r.skipper_id where r.id = p_id));
  perform set_config('platform.trusted', 'true', true);
  update skipper_secondary_roles set deleted_at = now() where id = p_id returning * into v;
  if not found then raise exception 'role_not_found'; end if;
  select user_id into v_uid from skipper_profiles where id = v.skipper_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'reject_skipper', v_uid, 'δεύτερος ρόλος (' || v.role::text || '): ' || coalesce(p_notes, ''));
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_flag(p_flag_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on((select user_id from admin_flags where id = p_flag_id));
  update admin_flags set resolved_at = now()
    where id = p_flag_id and resolved_at is null
    returning user_id into v_user;
  if v_user is null then raise exception 'flag_not_found'; end if;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'resolve_flag', v_user, '');
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_report(p_report_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on((select sp.user_id from cancellation_reports cr join bookings b on b.id = cr.booking_id join skipper_profiles sp on sp.id = b.skipper_id where cr.id = p_report_id));
  perform assert_admin_can_act_on((select b.client_id from cancellation_reports cr join bookings b on b.id = cr.booking_id where cr.id = p_report_id));

  update cancellation_reports
  set resolved_at = now(), resolved_by = auth.uid(), resolution_note = p_note
  where id = p_report_id and resolved_at is null;

  if not found then raise exception 'report_not_open'; end if;

  insert into admin_actions (admin_id, action_type, notes)
  values (auth.uid(), 'resolve_dispute', p_note);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_offer(p_skipper_ids uuid[], p_role crew_role DEFAULT 'skipper'::crew_role, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_port_id uuid DEFAULT NULL::uuid, p_boat_type_id uuid DEFAULT NULL::uuid, p_replaces_booking_id uuid DEFAULT NULL::uuid, p_claim_fee numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text, p_expires_hours integer DEFAULT 24)
 RETURNS booking_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_region uuid;
  v_departure text;
  v_arrival text;
  v_party int;
  v_cabin boolean;
  v_expires timestamptz;
  v_open record;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  -- «Δικό σου ναύλο» είναι του ιδιοκτήτη· ο υπάλληλος δεν προτείνει δουλειά στον εαυτό του.
  if p_replaces_booking_id is null and not is_owner_admin() then raise exception 'owner_only'; end if;
  if not is_owner_admin() and my_skipper_profile_id() = any(p_skipper_ids) then raise exception 'cannot_hire_self'; end if;
  perform set_config('platform.trusted', 'true', true);
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then
    raise exception 'no_skippers_selected';
  end if;

  if p_replaces_booking_id is not null then
    select * into v_old from bookings where id = p_replaces_booking_id for update;
    if not found then raise exception 'booking_not_found'; end if;
    perform pg_advisory_xact_lock(hashtext('trip:' || v_old.trip_root_id::text));
    if v_old.status <> 'cancelled_by_skipper' then raise exception 'not_awaiting_cover'; end if;
    if v_old.replacement_closed_at is not null then raise exception 'case_closed'; end if;
    if exists (
      select 1 from bookings r
      where r.trip_root_id = v_old.trip_root_id and r.status in ('confirmed', 'completed')
    ) then
      raise exception 'already_covered';
    end if;
    if exists (select 1 from bookings r where r.replaces_booking_id = p_replaces_booking_id) then
      raise exception 'not_latest_in_trip';
    end if;
    -- Μία ανοιχτή πρόταση ανά ταξίδι. Όποια έχει λήξει στην πράξη κλείνει
    -- εδώ (με ενημέρωση), αντί να περιμένει τη νυχτερινή εργασία.
    for v_open in
      select br.id from booking_requests br join bookings x on x.id = br.replaces_booking_id
      where x.trip_root_id = v_old.trip_root_id and br.origin = 'admin_replacement' and br.status = 'open'
    loop
      if replacement_offer_lapsed(v_open.id) then
        perform close_replacement_offer(v_open.id,
          case when (select client_decide_by from booking_requests where id = v_open.id) < now()
               then 'client_timeout' else 'no_response' end);
      else
        raise exception 'offer_already_open';
      end if;
    end loop;
    if exists (
      select 1 from bookings x
      where x.trip_root_id = v_old.trip_root_id and x.status = 'cancelled_by_skipper'
        and x.skipper_id = any(p_skipper_ids)
    ) then
      raise exception 'skipper_cancelled_this_trip';
    end if;

    v_client := v_old.client_id;
    v_origin := 'admin_replacement';
    v_start := v_old.start_date;
    v_end := v_old.end_date;
    v_port := v_old.port_id;
    v_boat := v_old.boat_type_id;
    v_region := v_old.region_id;
    v_departure := v_old.departure_point;
    v_arrival := v_old.arrival_point;
    v_party := v_old.party_size;
    v_cabin := v_old.private_cabin;
    v_role := coalesce(
      v_old.crew_role,
      (select sp.role from skipper_profiles sp where sp.id = v_old.skipper_id),
      'skipper'::crew_role
    );
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
      and not exists (
        select 1 from skipper_secondary_roles ssr
        where ssr.skipper_id = sp.id and ssr.role = v_role
          and ssr.approval_status = 'approved' and ssr.deleted_at is null
      )
  ) then
    raise exception 'role_mismatch';
  end if;

  v_expires := now() + make_interval(hours => greatest(coalesce(p_expires_hours, 24), 1));
  if v_expires > v_start::timestamptz then
    v_expires := greatest(now() + interval '30 minutes', v_start::timestamptz);
  end if;

  insert into booking_requests (
    client_id, start_date, end_date, port_id, boat_type_id,
    region_id, departure_point, arrival_point, party_size, private_cabin,
    fee_amount, fee_paid_at, status, expires_at,
    origin, created_by, replaces_booking_id, claim_fee_amount, note, crew_role
  ) values (
    v_client, v_start, v_end, v_port, v_boat,
    v_region, v_departure, v_arrival, v_party, v_cabin,
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_assign_replacement(p_booking_id uuid, p_skipper_id uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old bookings%rowtype;
  v_new bookings%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_secondary skipper_secondary_roles%rowtype;
  v_role crew_role;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() and p_skipper_id = my_skipper_profile_id() then raise exception 'cannot_hire_self'; end if;

  select * into v_old from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_old.status <> 'cancelled_by_skipper' then raise exception 'not_awaiting_cover'; end if;

  if exists (
    select 1 from bookings r
    where r.replaces_booking_id = p_booking_id and r.status in ('confirmed', 'completed')
  ) then
    raise exception 'already_covered';
  end if;

  v_role := coalesce(
    v_old.crew_role,
    (select sp.role from skipper_profiles sp where sp.id = v_old.skipper_id),
    'skipper'::crew_role
  );

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if not found or v_skipper.deleted_at is not null then
    raise exception 'skipper_not_eligible';
  end if;
  if v_role = v_skipper.role then
    if v_skipper.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  else
    select * into v_secondary from skipper_secondary_roles
      where skipper_id = p_skipper_id and role = v_role and deleted_at is null for update;
    if not found or v_secondary.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  end if;
  if v_skipper.user_id = v_old.client_id then raise exception 'cannot_hire_self'; end if;

  if exists (
    select 1 from bookings b
    where b.skipper_id = p_skipper_id
      and b.status in ('confirmed', 'completed')
      and daterange(b.start_date, b.end_date, '[]') && daterange(v_old.start_date, v_old.end_date, '[]')
  ) or exists (
    select 1 from delivery_bookings d
    where d.skipper_id = p_skipper_id
      and d.status = 'confirmed'
      and d.estimated_range && daterange(v_old.start_date, v_old.end_date, '[]')
  ) then
    raise exception 'skipper_already_booked';
  end if;

  insert into bookings (
    booking_request_id, client_id, skipper_id, start_date, end_date,
    port_id, region_id, departure_point, arrival_point, boat_type_id,
    party_size, private_cabin,
    skipper_claim_fee_amount, confirmed_at,
    status, replaces_booking_id, assigned_by, crew_role
  ) values (
    v_old.booking_request_id, v_old.client_id, p_skipper_id, v_old.start_date, v_old.end_date,
    v_old.port_id, v_old.region_id, v_old.departure_point, v_old.arrival_point, v_old.boat_type_id,
    v_old.party_size, v_old.private_cabin,
    0, now(),
    'confirmed', p_booking_id, auth.uid(), v_role
  ) returning * into v_new;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
  values (auth.uid(), 'edit_booking', v_skipper.user_id, 'Ανάθεση αντικατάστασης');

  return v_new;
end;
$function$;


-- #7 Όρια: ίδιο τέλος δεν ξαναγεμίζει ειδοποιήσεις επ' άπειρον.

CREATE OR REPLACE FUNCTION public.pay_and_broadcast(p_request_id uuid, p_skipper_ids uuid[])
 RETURNS booking_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_req booking_requests%rowtype; v_uid uuid := auth.uid(); v_wallet numeric;
begin
  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.client_id <> v_uid then raise exception 'not_owner'; end if;
  if v_req.status <> 'open' or v_req.fee_paid_at is not null then raise exception 'already_paid_or_closed'; end if;
  if v_req.origin = 'client' and (select count(*) from booking_requests
        where client_id = v_uid and origin = 'client' and fee_paid_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_requests';
  end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_skippers_selected'; end if;
  -- Ένα τέλος αιτήματος καλύπτει έως 30 επαγγελματίες (0106).
  if (select count(distinct s) from unnest(p_skipper_ids) s) > 30 then
    raise exception 'too_many_professionals';
  end if;
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
  -- Μόνο όσοι είναι διαθέσιμοι για αυτό ακριβώς το αίτημα: στην περιοχή,
  -- όλες τις ημέρες, όχι ήδη κλεισμένοι (0106).
  if v_req.origin = 'client' and exists (
    select 1 from unnest(p_skipper_ids) s
     where not coalesce(net_availability(s, null, v_req.region_id, v_req.crew_role)
                        @> daterange(v_req.start_date, v_req.end_date, '[]'), false)
        or exists (select 1 from bookings b
                    where b.skipper_id = s and b.status in ('confirmed', 'completed')
                      and daterange(b.start_date, b.end_date, '[]') && daterange(v_req.start_date, v_req.end_date, '[]'))
  ) then
    raise exception 'skipper_not_available';
  end if;

  select wallet_balance into v_wallet from users where id = v_uid for update;
  if v_wallet < v_req.fee_amount then
    raise exception 'insufficient_wallet';
  end if;

  perform set_config('platform.trusted', 'true', true);
  -- Με τέλος 0 (δωρεάν περίοδος) καμία κίνηση στο υπόλοιπο (0110).
  if v_req.fee_amount > 0 then
    update users set wallet_balance = wallet_balance - v_req.fee_amount where id = v_uid;
    insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
      values (v_uid, 'request_fee', -v_req.fee_amount, p_request_id);
  end if;

  update booking_requests set fee_paid_at = now() where id = p_request_id returning * into v_req;
  insert into booking_request_pings (booking_request_id, skipper_id)
    select p_request_id, s from unnest(p_skipper_ids) as s
    on conflict do nothing;
  return v_req;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_delivery_role_request(p_delivery_request_id uuid, p_crew_role crew_role, p_offered_price numeric, p_skipper_ids uuid[])
 RETURNS delivery_role_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dr delivery_requests%rowtype;
  v_rate numeric;
  v_pct numeric;
  v_min_fee numeric;
  v_credit_price numeric;
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

  if p_offered_price is null or p_offered_price < 0 then raise exception 'invalid_price'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_candidates_selected'; end if;
  if (select count(distinct s) from unnest(p_skipper_ids) s) > 30 then raise exception 'too_many_professionals'; end if;
  if (select count(*) from delivery_role_requests rr join delivery_requests d on d.id = rr.delivery_request_id
        where d.client_id = auth.uid() and rr.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_requests';
  end if;

  v_range := daterange(v_dr.departure_date - v_dr.flexible_days, v_dr.departure_date + v_dr.flexible_days, '[]');

  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_public sp on sp.id = s and sp.role = p_crew_role
    where sp.id is null or not (delivery_net_availability(s, p_crew_role) @> v_range)
  ) then
    raise exception 'invalid_candidate_selection';
  end if;

  v_rate := (select value from platform_settings where key = 'delivery_' || p_crew_role::text || '_rate_per_mile');
  -- greatest()/least() σιωπηλά αγνοούν NULL ορίσματα· χωρίς αυτόν τον έλεγχο
  -- ένα λείπον ρυθμό (typo, μη εφαρμοσμένη migration) θα γινόταν silent
  -- undercharge (client_fee = min_fee) αντί για σφάλμα.
  if v_rate is null then raise exception 'delivery_rate_not_configured'; end if;
  v_pct := (select value from platform_settings where key = 'delivery_platform_fee_pct');
  v_min_fee := (select value from platform_settings where key = 'delivery_min_fee');
  v_expiry_hours := (select value from platform_settings where key = 'delivery_expiry_hours');

  v_commission_base := v_dr.distance_miles * v_rate;
  v_platform_commission := v_commission_base * (v_pct / 100.0);
  v_client_fee := greatest(v_min_fee, v_platform_commission - v_min_fee);
  -- Σε credits (0110): το ποσό σε € διά την τιμή του credit, προς τα πάνω.
  -- Το ίδιο και για τον επαγγελματία (professional_fee = ελάχιστο τέλος).
  v_credit_price := greatest(coalesce((select value from platform_settings where key = 'credit_price_eur'), 50), 1);
  v_client_fee := ceil(v_client_fee / v_credit_price);
  v_min_fee := ceil(v_min_fee / v_credit_price);

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
$function$;

CREATE OR REPLACE FUNCTION public.relist_delivery_role_request(p_role_request_id uuid, p_new_price numeric, p_skipper_ids uuid[])
 RETURNS delivery_role_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if (select count(distinct s) from unnest(p_skipper_ids) s) > 30 then raise exception 'too_many_professionals'; end if;
  if (select count(*) from delivery_role_pings where delivery_role_request_id = p_role_request_id)
     + (select count(distinct s) from unnest(p_skipper_ids) s) > 90 then
    raise exception 'too_many_professionals';
  end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.request_credit_purchase(p_package text, p_credits integer DEFAULT NULL::integer)
 RETURNS credit_purchase_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_credits int;
  v_price numeric;
  v_ref text;
  v_row credit_purchase_requests%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from users where id = v_uid and status = 'active') then raise exception 'account_inactive'; end if;
  if (select count(*) from credit_purchase_requests where user_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'too_many_requests';
  end if;
  if exists (select 1 from credit_purchase_requests where user_id = v_uid and status = 'pending') then
    raise exception 'purchase_request_pending';
  end if;

  if p_package in ('starter', 'professional', 'pro') then
    v_credits := (select value from platform_settings where key = 'package_' || p_package || '_credits');
    v_price := (select value from platform_settings where key = 'package_' || p_package || '_price');
    if coalesce(v_credits, 0) <= 0 or v_price is null then raise exception 'invalid_package'; end if;
  elsif p_package = 'custom' then
    if p_credits is null or p_credits < 1 or p_credits > 100 then raise exception 'invalid_amount'; end if;
    v_credits := p_credits;
    v_price := p_credits * (select value from platform_settings where key = 'credit_price_eur');
    if v_price is null then raise exception 'invalid_package'; end if;
  else
    raise exception 'invalid_package';
  end if;

  loop
    v_ref := 'CR-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from credit_purchase_requests where reference = v_ref);
  end loop;

  insert into credit_purchase_requests (user_id, reference, package_key, credits, price_eur)
    values (v_uid, v_ref, nullif(p_package, 'custom'), v_credits, v_price)
    returning * into v_row;

  perform notify_owners('admin_credit_purchase',
    jsonb_build_object('name', (select full_name from users where id = v_uid), 'credits', v_credits,
                       'price', v_price, 'reference', v_ref),
    '/platform/admin/finance');
  return v_row;
end;
$function$;
