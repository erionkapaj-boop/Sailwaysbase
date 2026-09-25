-- ============================================================================
-- Θωράκιση ασφαλείας — από έλεγχο με πραγματικές επιθέσεις μέσω του δημόσιου
-- API (μόνο με το δημόσιο anon key, όπως θα έκανε οποιοσδήποτε).
--
-- Επιβεβαιωμένα κενά που κλείνουν εδώ:
--   1. Νέος χρήστης (μετά το pending-signup, πριν το complete_registration)
--      μπορούσε να γράψει μόνος του τη γραμμή του στο users ως admin, με
--      οποιοδήποτε υπόλοιπο → πλήρης έλεγχος της πλατφόρμας. Ο φρουρός του
--      users (και των προφίλ) έπιανε μόνο UPDATE, όχι INSERT.
--   2. soft_delete_account: ανώνυμος μπορούσε να διαγράψει οποιονδήποτε
--      λογαριασμό (ο έλεγχος υπήρχε μόνο στο API route, όχι στη συνάρτηση).
--   3. notify_user / notify_admins: ανώνυμος μπορούσε να στείλει ψεύτικες
--      ειδοποιήσεις σε οποιονδήποτε, με σύνδεσμο προς εξωτερική σελίδα.
--   4. Κριτικές: ο αξιολογούμενος μπορούσε να αλλάξει βαθμό/σχόλιο της
--      κριτικής που του έγραψαν (π.χ. 1★ → 5★), όχι μόνο να απαντήσει.
--   5. Αιτήματα κράτησης: ο πελάτης μπορούσε να δημιουργήσει αίτημα με τέλος
--      0€ (δεν πλήρωνε ποτέ), να μηδενίσει τη χρέωση του επαγγελματία, και να
--      ξανανοίξει/αλλάξει αίτημα που είχε ήδη κλείσει.
--   6. Ο χρήστης μπορούσε να «επαληθεύσει» μόνος του τον εαυτό του
--      (phone_verified_at), παρακάμπτοντας την επαλήθευση από τον admin.
--   7. Ανώνυμος μπορούσε να μηδενίζει τον μετρητή αποτυχημένων συνδέσεων
--      οποιουδήποτε τηλεφώνου.
--   8. Ανώνυμος μπορούσε να τρέχει τις νυχτερινές εργασίες.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. users: καμία απευθείας δημιουργία γραμμής από τον browser (η εγγραφή
--    γίνεται μόνο μέσω complete_registration), και ο φρουρός πιάνει πλέον
--    και INSERT και την επαλήθευση τηλεφώνου.
-- ----------------------------------------------------------------------------
drop policy if exists "user inserts own row" on users;

create or replace function guard_users_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'client';
    new.status := 'active';
    new.is_test_account := false;
    new.is_staff_admin := false;
    new.wallet_balance := 0;
    new.phone_verified_at := null;
    new.photo_reviewed_at := null;
    new.deleted_at := null;
    new.deletion_reason := null;
    new.suspension_reason := null;
    return new;
  end if;
  new.role := old.role;
  new.status := old.status;
  new.is_test_account := old.is_test_account;
  new.is_staff_admin := old.is_staff_admin;
  new.wallet_balance := old.wallet_balance;
  new.phone_number := old.phone_number;
  new.photo_reviewed_at := old.photo_reviewed_at;
  new.phone_verified_at := old.phone_verified_at;
  new.deleted_at := old.deleted_at;
  new.deletion_reason := old.deletion_reason;
  new.suspension_reason := old.suspension_reason;
  return new;
end;
$$;
drop trigger if exists trg_guard_users on users;
create trigger trg_guard_users before insert or update on users
  for each row execute function guard_users_privileged_columns();

-- ----------------------------------------------------------------------------
-- 2. Προφίλ: ο φρουρός πιάνει και INSERT — νέο προφίλ επαγγελματία ξεκινά
--    πάντα «σε αναμονή», χωρίς αξιολογήσεις.
-- ----------------------------------------------------------------------------
create or replace function guard_skipper_profile_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
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
  return new;
end;
$$;
drop trigger if exists trg_guard_skipper_profile on skipper_profiles;
create trigger trg_guard_skipper_profile before insert or update on skipper_profiles
  for each row execute function guard_skipper_profile_privileged_columns();

create or replace function guard_client_profile_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
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
$$;
drop trigger if exists trg_guard_client_profile on client_profiles;
create trigger trg_guard_client_profile before insert or update on client_profiles
  for each row execute function guard_client_profile_privileged_columns();

-- ----------------------------------------------------------------------------
-- 3. Κριτικές: ο αξιολογούμενος αλλάζει μόνο την απάντησή του.
-- ----------------------------------------------------------------------------
create or replace function guard_review_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_reply text := new.reply;
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new := old;
  new.reply := v_reply;
  return new;
end;
$$;
drop trigger if exists trg_guard_review_update on reviews;
create trigger trg_guard_review_update before update on reviews
  for each row execute function guard_review_update();

-- ----------------------------------------------------------------------------
-- 4. Αιτήματα κράτησης: ο πελάτης τα δημιουργεί (με τους όρους της
--    πλατφόρμας, όχι δικούς του) και δεν τα αλλάζει ποτέ απευθείας — κάθε
--    αλλαγή περνά από τις συναρτήσεις (πληρωμή, ακύρωση, αποδοχή).
-- ----------------------------------------------------------------------------
drop policy if exists "client updates own open request" on booking_requests;
drop policy if exists "admin updates booking request" on booking_requests;
create policy "admin updates booking request" on booking_requests
  for update using (is_admin());

create or replace function guard_booking_request_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
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
$$;
drop trigger if exists trg_guard_booking_request_insert on booking_requests;
-- Όνομα με «zz» ώστε να τρέχει ΤΕΛΕΥΤΑΙΟΣ από τους BEFORE INSERT triggers
-- (αλφαβητική σειρά) — καμία άλλη προεπιλογή δεν τον ξαναγράφει.
drop trigger if exists zz_guard_booking_request_insert on booking_requests;
create trigger zz_guard_booking_request_insert before insert on booking_requests
  for each row execute function guard_booking_request_insert();

-- ----------------------------------------------------------------------------
-- 5. Σύνδεση: ο μετρητής αποτυχιών δεν μηδενίζεται πια από τρίτους.
--    Αποτυχίες καταγράφονται από τον browser (δεν υπάρχει άλλος τρόπος χωρίς
--    διακομιστή)· επιτυχία/μηδενισμός μόνο για το τηλέφωνο του συνδεδεμένου.
-- ----------------------------------------------------------------------------
drop policy if exists "login attempts insert only" on login_attempts;
create policy "login attempts insert only" on login_attempts
  for insert with check (success = false);

create or replace function clear_login_attempts(p_phone text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  select phone_number into v_phone from users where id = auth.uid();
  if v_phone is null then return; end if;
  insert into login_attempts (phone, success) values (v_phone, true);
end;
$$;
revoke execute on function clear_login_attempts(text) from public, anon;
grant execute on function clear_login_attempts(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Διαγραφή λογαριασμού: μόνο μέσω του API route (service role) — και
--    αμυντικά, ακόμα κι αν ξαναδοθεί δικαίωμα κατά λάθος, μόνο ο ίδιος ή admin.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_account(p_user_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row users%rowtype;
  v_skipper_id uuid;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id and not is_admin() then
    raise exception 'not_allowed';
  end if;

  select * into v_row from users where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status = 'deleted' then raise exception 'already_deleted'; end if;
  if v_row.role = 'admin' or v_row.is_staff_admin then raise exception 'cannot_delete_admin'; end if;

  if exists (select 1 from booking_requests where client_id = p_user_id and status = 'open') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from delivery_requests dr join delivery_role_requests rr on rr.delivery_request_id = dr.id
             where dr.client_id = p_user_id and rr.status = 'open') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from bookings where client_id = p_user_id and status = 'confirmed') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from delivery_bookings where client_id = p_user_id and status = 'confirmed') then
    raise exception 'has_pending_activity';
  end if;

  select id into v_skipper_id from skipper_profiles where user_id = p_user_id;
  if v_skipper_id is not null then
    if exists (select 1 from bookings where skipper_id = v_skipper_id and status = 'confirmed') then
      raise exception 'has_pending_activity';
    end if;
    if exists (select 1 from delivery_bookings where skipper_id = v_skipper_id and status = 'confirmed') then
      raise exception 'has_pending_activity';
    end if;
  end if;

  -- Μόνο το status αλλάζει· τηλέφωνο/όνομα/email μένουν ακριβώς όπως ήταν,
  -- ώστε μια μελλοντική επανεγγραφή με το ίδιο νούμερο να ξαναβρεί την ίδια
  -- γραμμή (βλ. complete_registration).
  update users set status = 'deleted' where id = p_user_id;

  if v_skipper_id is not null then
    update skipper_profiles set deleted_at = now() where id = v_skipper_id and deleted_at is null;
    update skipper_secondary_roles set deleted_at = now() where skipper_id = v_skipper_id and deleted_at is null;
  end if;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (coalesce(auth.uid(), p_user_id), 'ban_account', p_user_id,
      coalesce(p_notes, 'Διαγραφή λογαριασμού (αυτοεξυπηρέτηση ή admin).'));
end;
$function$;

-- ----------------------------------------------------------------------------
-- 7. Εσωτερικές συναρτήσεις: καμία πρόσβαση από τον browser. Καλούνται μόνο
--    από άλλες συναρτήσεις/triggers της βάσης ή από διακομιστή (service_role).
-- ----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'soft_delete_account(uuid,text)',
    'notify_user(uuid,text,jsonb,text)',
    'notify_admins(text,jsonb,text)',
    'mark_bookings_completed()',
    'expire_stale_booking_requests()',
    'expire_stale_delivery_role_requests()',
    'recalc_user_rating(uuid)',
    'replacement_offer_lapsed(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
