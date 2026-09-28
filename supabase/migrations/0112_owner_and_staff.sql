-- ============================================================================
-- Ιδιοκτήτης και υπάλληλοι.
--
-- Ιδιοκτήτης: πλήρης πρόσβαση — και credits στον δικό του λογαριασμό.
-- Μέχρι τώρα «ιδιοκτήτης» ήταν μόνο λογαριασμός με role = 'admin'· ο
-- πραγματικός ιδιοκτήτης όμως είναι επαγγελματίας με δικαιώματα διαχειριστή
-- (0038), οπότε η βάση τον έβλεπε ως υπάλληλο. Νέα σημαία users.is_owner.
--
-- Υπάλληλος (is_staff_admin): τα καθημερινά — εγκρίσεις, επαληθεύσεις,
-- φωτογραφίες, μηνύματα, αναφορές, αντικαταστάσεις, προτάσεις, αναστολή.
-- Όχι: credits, ρυθμίσεις, διαγραφές/επαναφορές, λογαριασμοί δοκιμών,
-- υπάλληλοι, λίστες τιμών (περιοχές, λιμάνια κ.λπ.). Ποτέ τον ιδιοκτήτη ή
-- άλλον υπάλληλο.
--
-- Κλείνει και ό,τι επέτρεπε σε υπάλληλο να τα παρακάμψει γράφοντας απευθείας
-- στους πίνακες (υπόλοιπα, δικαιώματα, ρυθμίσεις, προφίλ άλλων).
-- ============================================================================

alter table users add column if not exists is_owner boolean not null default false;

-- Ο ιδιοκτήτης της πλατφόρμας.
do $$
begin
  perform set_config('platform.trusted', 'true', true);
  update users set is_owner = true where phone_number = '+306983427643' and not is_owner;
end;
$$;

create or replace function is_owner_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and (role = 'admin' or is_owner))
$$;
-- Καλείται και μέσα από κανόνες πρόσβασης που ελέγχονται για ανώνυμους
-- (επιστρέφει false χωρίς σύνδεση).
grant execute on function is_owner_admin() to anon, authenticated;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and (role = 'admin' or is_staff_admin or is_owner))
$$;

-- Ιδιοκτήτης: όλους εκτός από άλλον ιδιοκτήτη (τον εαυτό του ναι).
-- Υπάλληλος: μόνο απλούς χρήστες.
create or replace function can_manage_account(p_target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users c, users t
     where c.id = auth.uid() and t.id = p_target
       and case
             when c.role = 'admin' or c.is_owner then t.id = c.id or not (t.role = 'admin' or t.is_owner)
             when c.is_staff_admin then not (t.role = 'admin' or t.is_owner or t.is_staff_admin)
             else false
           end)
$$;

-- Οι προνομιακές στήλες αλλάζουν μόνο από τις συναρτήσεις της πλατφόρμας ή
-- από τον ιδιοκτήτη — όχι από υπάλληλο με απευθείας εγγραφή.
create or replace function guard_users_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_owner_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'client';
    new.status := 'active';
    new.is_test_account := false;
    new.is_staff_admin := false;
    new.is_owner := false;
    new.wallet_balance := 0;
    new.phone_verified_at := null;
    new.photo_reviewed_at := null;
    new.deleted_at := null;
    new.deletion_reason := null;
    new.suspension_reason := null;
    new.pin_change_required := false;
    new.signup_bonus_at := null;
    return new;
  end if;
  new.role := old.role;
  new.status := old.status;
  new.is_test_account := old.is_test_account;
  new.is_staff_admin := old.is_staff_admin;
  new.is_owner := old.is_owner;
  new.wallet_balance := old.wallet_balance;
  new.phone_number := old.phone_number;
  new.email := old.email;
  new.full_name := old.full_name;
  new.pin_change_required := old.pin_change_required;
  new.signup_bonus_at := old.signup_bonus_at;
  new.photo_reviewed_at := old.photo_reviewed_at;
  new.phone_verified_at := old.phone_verified_at;
  new.deleted_at := old.deleted_at;
  new.deletion_reason := old.deletion_reason;
  new.suspension_reason := old.suspension_reason;
  return new;
end;
$$;

-- Υπάλληλοι: μόνο ο ιδιοκτήτης ορίζει ή αφαιρεί· ποτέ σε ιδιοκτήτη.
create or replace function admin_set_staff_admin(p_user_id uuid, p_flag boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_row users%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  select * into v_row from users where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.role = 'admin' or v_row.is_owner then raise exception 'cannot_edit_admin'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set is_staff_admin = p_flag where id = p_user_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), case when p_flag then 'staff_admin_grant' else 'staff_admin_revoke' end, p_user_id, '');
end;
$$;

-- Απευθείας εγγραφές: μόνο ο ιδιοκτήτης (οι υπάλληλοι περνούν από τις
-- συναρτήσεις, που ελέγχουν τι επιτρέπεται).
drop policy if exists "user updates own row" on users;
create policy "user updates own row" on users for update using (id = auth.uid() or is_owner_admin());

drop policy if exists "settings admin write" on platform_settings;
create policy "settings admin write" on platform_settings for all using (is_owner_admin()) with check (is_owner_admin());

drop policy if exists "lookups admin write" on regions;
create policy "lookups admin write" on regions for all using (is_owner_admin()) with check (is_owner_admin());
drop policy if exists "lookups admin write" on ports;
create policy "lookups admin write" on ports for all using (is_owner_admin()) with check (is_owner_admin());
drop policy if exists "lookups admin write" on boat_types;
create policy "lookups admin write" on boat_types for all using (is_owner_admin()) with check (is_owner_admin());
drop policy if exists "lookups admin write" on languages;
create policy "lookups admin write" on languages for all using (is_owner_admin()) with check (is_owner_admin());
drop policy if exists "lookups admin write" on nationalities;
create policy "lookups admin write" on nationalities for all using (is_owner_admin()) with check (is_owner_admin());

drop policy if exists "admin updates booking request" on booking_requests;
create policy "admin updates booking request" on booking_requests for update using (is_owner_admin());
drop policy if exists "admin updates booking" on bookings;
create policy "admin updates booking" on bookings for update using (is_owner_admin());

drop policy if exists "client updates own profile" on client_profiles;
create policy "client updates own profile" on client_profiles for update using (user_id = auth.uid() or is_owner_admin());
drop policy if exists "skipper updates own profile" on skipper_profiles;
create policy "skipper updates own profile" on skipper_profiles for update using (user_id = auth.uid() or is_owner_admin());
drop policy if exists "secondary role owner or admin update" on skipper_secondary_roles;
create policy "secondary role owner or admin update" on skipper_secondary_roles for update
  using (skipper_id = my_skipper_profile_id() or is_owner_admin());

-- ---------------------------------------------------------------------------
-- Μόνο για τον ιδιοκτήτη: credits (και στον δικό του λογαριασμό), ρυθμίσεις,
-- διαγραφή/επαναφορά λογαριασμών, λογαριασμοί δοκιμών.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_setting(p_key text, p_value numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_max numeric;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  if p_value is null or p_value < 0 then raise exception 'invalid_value'; end if;

  v_max := case
    when p_key like '%\_enabled' then 1
    when p_key = 'cancel_full_rate' then 1
    when p_key like '%\_pct' then 100
    when p_key like 'cancel\_weight\_%' then 10
    when p_key like '%\_hours' then 720
    when p_key like '%\_days' then 365
    when p_key like '%\_months' then 120
    when p_key like '%\_rate\_per\_mile' then 100
    when p_key like '%\_price' or p_key = 'credit_price_eur' then 100000
    when p_key in ('client_request_fee', 'skipper_claim_fee') then 100
    when p_key like '%\_credits%' or p_key like 'signup\_credits\_%' then 1000
    when p_key like '%fee%' then 1000
    else 1000 end;
  if p_value > v_max then raise exception 'invalid_value'; end if;
  if p_key like '%\_enabled' and p_value not in (0, 1) then raise exception 'invalid_value'; end if;
  if p_key like '%\_hours' and p_value < 1 then raise exception 'invalid_value'; end if;
  if (p_key like '%credits%' or p_key in ('client_request_fee', 'skipper_claim_fee')) and p_value <> round(p_value) then
    raise exception 'invalid_value';
  end if;
  if p_key = 'credit_price_eur' and p_value < 1 then raise exception 'invalid_value'; end if;

  update platform_settings set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'unknown_setting'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_credit_wallet(p_user_id uuid, p_amount numeric, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) or p_amount > 1000 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from users where id = p_user_id) then raise exception 'invalid_role'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_amount where id = p_user_id;
  insert into wallet_transactions (user_id, type, amount, note, created_by)
    values (p_user_id, 'deposit', p_amount, nullif(btrim(p_notes), ''), auth.uid());
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'credit_wallet', p_user_id, coalesce(nullif(btrim(p_notes), ''), '') || ' (+' || p_amount || ' credits)');
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(p_user_id uuid, p_amount numeric, p_reason text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_balance numeric;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  if p_amount is null or p_amount = 0 or p_amount <> round(p_amount) then raise exception 'invalid_amount'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  select wallet_balance into v_balance from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_balance + p_amount < 0 then raise exception 'insufficient_wallet'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_amount where id = p_user_id
    returning wallet_balance into v_balance;
  insert into wallet_transactions (user_id, type, amount, note, created_by)
    values (p_user_id, 'adjustment', p_amount, btrim(p_reason), auth.uid());
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'adjust_wallet', p_user_id,
            btrim(p_reason) || ' (' || case when p_amount > 0 then '+' else '' end || p_amount || ' credits)');
  return v_balance;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_record_purchase(p_user_id uuid, p_credits integer, p_price_eur numeric, p_note text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_balance numeric;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  if p_credits is null or p_credits <= 0 or p_credits > 1000 then raise exception 'invalid_amount'; end if;
  if p_price_eur is null or p_price_eur < 0 then raise exception 'invalid_amount'; end if;

  select wallet_balance into v_balance from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_credits where id = p_user_id
    returning wallet_balance into v_balance;
  insert into wallet_transactions (user_id, type, amount, price_eur, note, created_by)
    values (p_user_id, 'purchase', p_credits, p_price_eur, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'credit_wallet', p_user_id,
            'Αγορά ' || p_credits || ' credits (' || p_price_eur || '€)' || coalesce(' · ' || nullif(btrim(coalesce(p_note, '')), ''), ''));
  return v_balance;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_account(p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row users%rowtype;
  v_skipper_id uuid;
  v_req record;
  v_rr record;
  v_cancelled int := 0;
  v_refunded numeric := 0;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;

  select * into v_row from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status = 'deleted' then raise exception 'already_deleted'; end if;
  if v_row.role = 'admin' then raise exception 'cannot_delete_admin'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_delete_self'; end if;
  if not can_manage_account(p_user_id) then raise exception 'cannot_edit_admin'; end if;

  perform set_config('platform.trusted', 'true', true);

  -- Ανοιχτά αιτήματα πληρώματος του χρήστη → ακύρωση + επιστροφή τέλους.
  for v_req in
    select id, fee_paid_at, fee_amount from booking_requests
    where client_id = p_user_id and status = 'open' for update
  loop
    update booking_requests set status = 'cancelled' where id = v_req.id;
    delete from booking_request_pings where booking_request_id = v_req.id and status = 'pending';
    if v_req.fee_paid_at is not null and v_req.fee_amount > 0 then
      update users set wallet_balance = wallet_balance + v_req.fee_amount where id = p_user_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
        values (p_user_id, 'refund_credit', v_req.fee_amount, v_req.id);
      v_refunded := v_refunded + v_req.fee_amount;
    end if;
    v_cancelled := v_cancelled + 1;
  end loop;

  -- Ανοιχτές θέσεις σε αιτήματα μεταφοράς του χρήστη → ακύρωση + επιστροφή.
  for v_rr in
    select rr.id, rr.fee_paid_at, rr.client_fee
    from delivery_role_requests rr join delivery_requests dr on dr.id = rr.delivery_request_id
    where dr.client_id = p_user_id and rr.status = 'open' for update of rr
  loop
    update delivery_role_requests set status = 'cancelled' where id = v_rr.id;
    delete from delivery_role_pings where delivery_role_request_id = v_rr.id and status = 'pending';
    if v_rr.fee_paid_at is not null and v_rr.client_fee > 0 then
      update users set wallet_balance = wallet_balance + v_rr.client_fee where id = p_user_id;
      insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id)
        values (p_user_id, 'refund_credit', v_rr.client_fee, v_rr.id);
      v_refunded := v_refunded + v_rr.client_fee;
    end if;
    v_cancelled := v_cancelled + 1;
  end loop;

  -- Επαγγελματίας: κρύβεται από αναζητήσεις, και φεύγει από όσα αιτήματα
  -- δεν έχει απαντήσει ακόμα.
  select id into v_skipper_id from skipper_profiles where user_id = p_user_id;
  if v_skipper_id is not null then
    perform release_professional_bookings(p_user_id, 'Ο λογαριασμός του επαγγελματία διαγράφηκε');
    delete from booking_request_pings where skipper_id = v_skipper_id and status = 'pending';
    delete from delivery_role_pings where skipper_id = v_skipper_id and status = 'pending';
    update skipper_profiles set deleted_at = now() where id = v_skipper_id and deleted_at is null;
    update skipper_secondary_roles set deleted_at = now() where skipper_id = v_skipper_id and deleted_at is null;
  end if;

  -- Τα δικαιώματα διαχειριστή δεν επιστρέφουν αυτόματα με μια επαναφορά.
  update users
    set status = 'deleted',
        deletion_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        is_staff_admin = false
    where id = p_user_id;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'ban_account', p_user_id,
      'Διαγραφή από admin' || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '') || '.');

  return jsonb_build_object('cancelled_requests', v_cancelled, 'refunded', v_refunded);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_restore_account(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row users%rowtype;
  v_sp skipper_profiles%rowtype;
  v_new_status user_status;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;

  select * into v_row from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status <> 'deleted' then raise exception 'not_deleted'; end if;

  select * into v_sp from skipper_profiles where user_id = p_user_id;
  v_new_status := case
    when v_sp.id is not null and v_sp.approval_status <> 'approved' then 'draft'
    else 'active'
  end;

  perform set_config('platform.trusted', 'true', true);

  update users set status = v_new_status where id = p_user_id;

  if v_sp.id is not null then
    update skipper_secondary_roles set deleted_at = null
      where skipper_id = v_sp.id and deleted_at = v_sp.deleted_at;
    update skipper_profiles set deleted_at = null where id = v_sp.id;
  end if;

  perform notify_user(p_user_id, 'account_restored', '{}'::jsonb, '/platform');

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'ban_account', p_user_id, 'Επαναφορά διαγραμμένου λογαριασμού.');
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_skipper(p_skipper_id uuid, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  update skipper_profiles set deleted_at = now() where id = p_skipper_id returning user_id into v_uid;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'ban_account', v_uid, p_notes);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_test_account(p_user_id uuid, p_is_test boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set is_test_account = p_is_test where id = p_user_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), case when p_is_test then 'test_account_on' else 'test_account_off' end, p_user_id, '');
end;
$function$;
