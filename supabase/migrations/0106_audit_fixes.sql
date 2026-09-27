-- ============================================================================
-- Διορθώσεις από τον έλεγχο της εφαρμογής (docs/AUDIT.md).
--
-- Ο αριθμός σε κάθε ενότητα είναι το # του ευρήματος στο AUDIT.md.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Βοηθητικά
-- ---------------------------------------------------------------------------
create or replace function is_valid_email(p text) returns boolean
language sql immutable as $$
  select p is not null and char_length(p) <= 254 and p ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
$$;

-- Ο ιδιοκτήτης (role = 'admin'), όχι βοηθός διαχειριστή.
create or replace function is_owner_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and role = 'admin')
$$;
revoke execute on function is_owner_admin() from public, anon;

-- Αν ο συνδεδεμένος διαχειριστής μπορεί να πειράξει αυτόν τον λογαριασμό.
-- Ο ιδιοκτήτης: όλους εκτός από άλλον ιδιοκτήτη (τον εαυτό του ναι). Βοηθός:
-- μόνο απλούς χρήστες — ποτέ ιδιοκτήτη, άλλον βοηθό ή τον εαυτό του. (#9, #10)
create or replace function can_manage_account(p_target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users c, users t
     where c.id = auth.uid() and t.id = p_target
       and case
             when c.role = 'admin' then t.id = c.id or t.role <> 'admin'
             when c.is_staff_admin then t.role <> 'admin' and not t.is_staff_admin
             else false
           end)
$$;
revoke execute on function can_manage_account(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- #4 #5 #6 #48 Εγγραφή: τηλέφωνο και επαλήθευση από τη βάση, όχι από τον browser
--
-- Το τηλέφωνο είναι αυτό με το οποίο συνδέθηκε ο λογαριασμός στο Supabase Auth.
-- Επαληθευμένος είναι μόνο όποιος πέρασε πραγματικό κωδικό SMS: OTP ανοιχτό
-- και ο λογαριασμός δεν φτιάχτηκε από το pending-signup (που τον σημαδεύει
-- με app_metadata.signup = 'pending'). Σε ζωντανό λογαριασμό το όνομα και το
-- email δεν αλλάζουν από εδώ — μόνο όσο η εγγραφή δεν έχει ολοκληρωθεί
-- (draft) ή σε δοκιμαστικό λογαριασμό (Ghost Mode).
-- ---------------------------------------------------------------------------
create or replace function complete_registration(
  p_full_name text, p_email text, p_phone text,
  p_crew_role crew_role default null, p_phone_verified boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_pro boolean := p_crew_role is not null;
  v_role user_role := case when v_is_pro then 'skipper' else 'client' end;
  v_status user_status := case when v_is_pro then 'draft' else 'active' end;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_phone text;
  v_pending boolean;
  v_verified_at timestamptz;
  v_existing_user users%rowtype;
  v_existing_sp skipper_profiles%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_name = '' then raise exception 'name_required'; end if;
  if char_length(v_name) > 120 then raise exception 'invalid_name'; end if;
  if v_email is not null and not is_valid_email(v_email) then raise exception 'invalid_email'; end if;

  select nullif(btrim(phone), ''), coalesce(raw_app_meta_data ->> 'signup', '') = 'pending'
    into v_phone, v_pending
    from auth.users where id = v_uid;
  if v_phone is null then raise exception 'phone_required'; end if;
  v_phone := '+' || ltrim(v_phone, '+');

  if coalesce((select value from platform_settings where key = 'otp_enabled'), 0) = 1 and not v_pending then
    v_verified_at := now();
  end if;

  perform set_config('platform.trusted', 'true', true);

  select * into v_existing_user from users where id = v_uid;

  if not found then
    insert into users (id, role, full_name, email, phone_number, phone_verified_at, status)
      values (v_uid, v_role, v_name, v_email, v_phone, v_verified_at, v_status);
  elsif v_existing_user.status = 'deleted' then
    update users set role = v_role, full_name = v_name, email = v_email,
      phone_verified_at = v_verified_at, status = v_status
      where id = v_uid;
  elsif v_existing_user.status = 'draft' or in_test_world(v_uid) then
    update users set full_name = v_name, email = v_email where id = v_uid;
  end if;

  if not v_is_pro then
    insert into client_profiles (user_id) values (v_uid) on conflict do nothing;
    return;
  end if;

  if p_crew_role in ('skipper', 'hostess', 'cook', 'deckhand') then
    select * into v_existing_sp from skipper_profiles where user_id = v_uid;
    if not found then
      insert into skipper_profiles (user_id, role, full_name, price_per_day)
        values (v_uid, p_crew_role, v_name, 210);
    elsif v_existing_sp.deleted_at is not null then
      update skipper_profiles set deleted_at = null, role = p_crew_role,
        full_name = v_name, approval_status = 'pending',
        approved_by = null, approved_at = null
        where id = v_existing_sp.id;
    elsif v_existing_user.status = 'draft' or in_test_world(v_uid) then
      update skipper_profiles set full_name = v_name where id = v_existing_sp.id;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- #7 #8 Όνομα και «πρέπει να αλλάξεις PIN» δεν αλλάζουν με απευθείας εγγραφή
-- ---------------------------------------------------------------------------
create or replace function guard_users_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
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
    new.pin_change_required := false;
    new.signup_bonus_at := null;
    return new;
  end if;
  new.role := old.role;
  new.status := old.status;
  new.is_test_account := old.is_test_account;
  new.is_staff_admin := old.is_staff_admin;
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

-- Όταν αλλάζει ο κωδικός στο Supabase Auth, το «πρέπει να αλλάξεις PIN»
-- σβήνει μόνο του. Η επαναφορά από τον διαχειριστή το ξανανάβει αμέσως μετά
-- (app/api/platform/admin/reset-pin), γιατί εκείνο το PIN είναι προσωρινό.
create or replace function auth_password_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    perform set_config('platform.trusted', 'true', true);
    update public.users set pin_change_required = false where id = new.id and pin_change_required;
  end if;
  return null;
end;
$$;
drop trigger if exists zz_password_changed on auth.users;
create trigger zz_password_changed after update of encrypted_password on auth.users
  for each row execute function auth_password_changed();

-- ---------------------------------------------------------------------------
-- #31 Μετά από επαναφορά PIN κλείνουν όλες οι ανοιχτές συνδέσεις
-- Μόνο για τον server (service_role).
-- ---------------------------------------------------------------------------
create or replace function revoke_user_sessions(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user_id;
  end if;
end;
$$;
revoke execute on function revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function revoke_user_sessions(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- #9 #10 #11 #12 Όρια στους βοηθούς διαχειριστή και στο δικό σου πορτοφόλι
-- ---------------------------------------------------------------------------
create or replace function admin_update_profile(
  p_user_id uuid, p_full_name text, p_email text default null, p_price_per_day numeric default null,
  p_license_number text default null, p_license_type text default null, p_years_experience integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sp skipper_profiles%rowtype;
  v_old_name text;
  v_old_email text;
  v_found boolean;
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_license text := nullif(btrim(coalesce(p_license_number, '')), '');
  v_license_type text := nullif(btrim(coalesce(p_license_type, '')), '');
  v_changes text[] := '{}';
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if coalesce(btrim(p_full_name), '') = '' then raise exception 'name_required'; end if;
  if char_length(btrim(p_full_name)) > 120 then raise exception 'invalid_name'; end if;
  if v_email is not null and not is_valid_email(v_email) then raise exception 'invalid_email'; end if;

  select true, full_name, email into v_found, v_old_name, v_old_email from users where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  if not can_manage_account(p_user_id) then raise exception 'cannot_edit_admin'; end if;

  perform set_config('platform.trusted', 'true', true);

  if btrim(p_full_name) is distinct from v_old_name then
    v_changes := array_append(v_changes, 'όνομα: «' || coalesce(v_old_name, '—') || '» → «' || btrim(p_full_name) || '»');
  end if;
  if v_email is distinct from v_old_email then
    v_changes := array_append(v_changes, 'email: «' || coalesce(v_old_email, '—') || '» → «' || coalesce(v_email, '—') || '»');
  end if;

  update users set full_name = btrim(p_full_name), email = v_email where id = p_user_id;

  select * into v_sp from skipper_profiles where user_id = p_user_id;
  if found then
    if p_price_per_day is not null and p_price_per_day < 210 then
      raise exception 'price_too_low';
    end if;
    if v_license is not null and v_license is distinct from v_sp.license_number
       and exists (select 1 from skipper_profiles where license_number = v_license and id <> v_sp.id) then
      raise exception 'license_taken';
    end if;

    if p_price_per_day is not null and p_price_per_day is distinct from v_sp.price_per_day then
      v_changes := array_append(v_changes, 'τιμή: ' || v_sp.price_per_day || '€ → ' || p_price_per_day || '€');
    end if;
    if v_license is not null and v_license is distinct from v_sp.license_number then
      v_changes := array_append(v_changes, 'αριθμός διπλώματος: «' || v_sp.license_number || '» → «' || v_license || '»');
    end if;
    if v_license_type is not null and v_license_type is distinct from v_sp.license_type then
      v_changes := array_append(v_changes, 'τύπος διπλώματος: «' || v_sp.license_type || '» → «' || v_license_type || '»');
    end if;
    if p_years_experience is not null and p_years_experience is distinct from v_sp.years_experience then
      v_changes := array_append(v_changes, 'εμπειρία: ' || v_sp.years_experience || ' → ' || p_years_experience || ' έτη');
    end if;

    update skipper_profiles set
      full_name = btrim(p_full_name),
      price_per_day = coalesce(p_price_per_day, price_per_day),
      license_number = coalesce(v_license, license_number),
      license_type = coalesce(v_license_type, license_type),
      years_experience = coalesce(p_years_experience, years_experience)
      where id = v_sp.id;
  end if;

  if array_length(v_changes, 1) > 0 then
    insert into admin_actions (admin_id, action_type, target_user_id, notes)
      values (auth.uid(), 'edit_profile', p_user_id, array_to_string(v_changes, ' · '));
  end if;
end;
$$;

-- Δικαιώματα διαχειριστή δίνει/παίρνει μόνο ο ιδιοκτήτης.
create or replace function admin_set_staff_admin(p_user_id uuid, p_flag boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_was_admin boolean; v_other_admins int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;

  select (role = 'admin' or is_staff_admin) into v_was_admin from users where id = p_user_id;
  if v_was_admin is null then raise exception 'user_not_found'; end if;

  if not p_flag and v_was_admin then
    select count(*) into v_other_admins
      from users where id <> p_user_id and (role = 'admin' or is_staff_admin);
    if v_other_admins = 0 then raise exception 'cannot_remove_last_admin'; end if;
  end if;

  perform set_config('platform.trusted', 'true', true);
  update users set is_staff_admin = p_flag where id = p_user_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), case when p_flag then 'staff_admin_grant' else 'staff_admin_revoke' end, p_user_id, '');
end;
$$;

create or replace function admin_credit_wallet(p_user_id uuid, p_amount numeric, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_credit_self'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from users where id = p_user_id) then raise exception 'invalid_role'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_amount where id = p_user_id;
  insert into wallet_transactions (user_id, type, amount, note, created_by)
    values (p_user_id, 'deposit', p_amount, nullif(btrim(p_notes), ''), auth.uid());
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'credit_wallet', p_user_id, coalesce(nullif(btrim(p_notes), ''), '') || ' (+' || p_amount || '€)');
end;
$$;

create or replace function admin_adjust_wallet(p_user_id uuid, p_amount numeric, p_reason text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_balance numeric;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_credit_self'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid_amount'; end if;
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
            btrim(p_reason) || ' (' || case when p_amount > 0 then '+' else '' end || p_amount || '€)');
  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- #14 #15 Όρια στα στοιχεία επαγγελματία
-- Ελέγχεται μόνο ό,τι αλλάζει, ώστε παλιές γραμμές να μην μπλοκάρουν άσχετες
-- αλλαγές.
-- ---------------------------------------------------------------------------
create or replace function validate_professional_fields()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT' or new.price_per_day is distinct from old.price_per_day)
     and new.price_per_day > 5000 then
    raise exception 'price_too_high';
  end if;
  if (tg_op = 'INSERT' or new.years_experience is distinct from old.years_experience)
     and (new.years_experience < 0 or new.years_experience > 70) then
    raise exception 'invalid_years_experience';
  end if;
  -- Μόνο το skipper_profiles έχει ημερομηνία γέννησης· ξεχωριστό if, γιατί το
  -- plpgsql διαβάζει όλη την έκφραση και θα έσπαγε στις δεύτερες ιδιότητες.
  if tg_table_name = 'skipper_profiles' then
    if (tg_op = 'INSERT' or new.date_of_birth is distinct from old.date_of_birth)
       and new.date_of_birth is not null
       and (new.date_of_birth > (current_date - interval '18 years')::date
            or new.date_of_birth < (current_date - interval '100 years')::date) then
      raise exception 'invalid_date_of_birth';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists ab_validate_professional_fields on skipper_profiles;
create trigger ab_validate_professional_fields before insert or update on skipper_profiles
  for each row execute function validate_professional_fields();
drop trigger if exists ab_validate_professional_fields on skipper_secondary_roles;
create trigger ab_validate_professional_fields before insert or update on skipper_secondary_roles
  for each row execute function validate_professional_fields();

-- ---------------------------------------------------------------------------
-- #22 Μηνύματα επικοινωνίας από ανώνυμους: όριο ανά στοιχείο επικοινωνίας και
-- συνολικά ανά ώρα
-- ---------------------------------------------------------------------------
create index if not exists contact_messages_created_idx on contact_messages (created_at);

create or replace function submit_contact_message(p_name text, p_contact text, p_topic text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_recent int;
  v_admin record;
begin
  p_name := btrim(coalesce(p_name, ''));
  p_contact := btrim(coalesce(p_contact, ''));
  p_message := btrim(coalesce(p_message, ''));
  p_topic := coalesce(nullif(btrim(p_topic), ''), 'general');

  if char_length(p_name) < 2 or char_length(p_name) > 120 then
    raise exception 'invalid_name';
  end if;
  if char_length(p_contact) < 3 or char_length(p_contact) > 160 then
    raise exception 'invalid_contact';
  end if;
  if char_length(p_message) < 10 or char_length(p_message) > 4000 then
    raise exception 'invalid_message';
  end if;
  if p_topic not in ('general', 'booking', 'payment', 'report', 'privacy', 'other') then
    raise exception 'invalid_topic';
  end if;

  if v_uid is not null then
    select count(*) into v_recent
      from contact_messages
      where user_id = v_uid and created_at > now() - interval '1 hour';
    if v_recent >= 5 then
      raise exception 'too_many_messages';
    end if;
  else
    -- Ανώνυμα: έως 3 την ώρα από το ίδιο τηλέφωνο/email, έως 30 την ώρα συνολικά.
    select count(*) into v_recent
      from contact_messages
      where user_id is null and lower(contact) = lower(p_contact) and created_at > now() - interval '1 hour';
    if v_recent >= 3 then
      raise exception 'too_many_messages';
    end if;
    select count(*) into v_recent
      from contact_messages
      where user_id is null and created_at > now() - interval '1 hour';
    if v_recent >= 30 then
      raise exception 'too_many_messages';
    end if;
  end if;

  insert into contact_messages (user_id, name, contact, topic, message)
    values (v_uid, p_name, p_contact, p_topic, p_message);

  for v_admin in select id from users where role = 'admin' or is_staff_admin loop
    perform notify_user(
      v_admin.id,
      'contact_message',
      jsonb_build_object('topic', p_topic, 'name', p_name),
      '/platform/admin/messages'
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- #23 Οι ρυθμίσεις: όλοι βλέπουν μόνο όσες χρειάζεται η εφαρμογή (τέλη, τιμές
-- μεταφοράς, λήξεις, OTP). Οι συντελεστές αξιοπιστίας μόνο ο διαχειριστής.
-- ---------------------------------------------------------------------------
drop policy if exists "settings readable by everyone" on platform_settings;
drop policy if exists "settings public keys readable" on platform_settings;
create policy "settings public keys readable" on platform_settings for select using (
  is_admin() or key in (
    'client_request_fee', 'skipper_claim_fee', 'otp_enabled', 'unclaimed_expiry_hours', 'delivery_expiry_hours',
    'delivery_min_fee', 'delivery_platform_fee_pct', 'delivery_skipper_rate_per_mile',
    'delivery_hostess_rate_per_mile', 'delivery_cook_rate_per_mile', 'delivery_deckhand_rate_per_mile')
);

-- Οι υπολογισμοί αξιοπιστίας διαβάζουν τους κρυφούς συντελεστές· τρέχουν
-- πλέον με τα δικαιώματα του ιδιοκτήτη της βάσης, όχι του χρήστη.
alter function cancellation_weight_for(timestamptz, date) security definer set search_path = public;
alter function cancellation_load(uuid) security definer set search_path = public;
alter function cancellation_standing(uuid) security definer set search_path = public;
-- Ο υπολογισμός βαθμίδας (trigger) τους καλεί κι αυτός.
alter function recompute_skipper_tier() security definer set search_path = public;
revoke execute on function cancellation_weight_for(timestamptz, date) from public, anon, authenticated;
revoke execute on function cancellation_load(uuid) from public, anon, authenticated;
revoke execute on function cancellation_standing(uuid) from public, anon, authenticated;

-- #51 Όρια ανά ρύθμιση
create or replace function admin_update_setting(p_key text, p_value numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_max numeric;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
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
    when p_key like '%fee%' then 1000
    else 1000 end;
  if p_value > v_max then raise exception 'invalid_value'; end if;
  if p_key like '%\_enabled' and p_value not in (0, 1) then raise exception 'invalid_value'; end if;
  if p_key like '%\_hours' and p_value < 1 then raise exception 'invalid_value'; end if;

  update platform_settings set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'unknown_setting'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- #24 Αξιολογήσεις για πελάτες: μόνο οι συμμετέχοντες, ο διαχειριστής και
-- επαγγελματίες που έλαβαν αίτημα από αυτόν τον πελάτη. Οι αξιολογήσεις
-- επαγγελματιών μένουν δημόσιες.
-- ---------------------------------------------------------------------------
-- Διαβάζει την κράτηση με τα δικαιώματα της βάσης: ο επισκέπτης δεν βλέπει
-- κρατήσεις, οπότε ένας έλεγχος μέσα στην πολιτική θα έβλεπε «καμία».
create or replace function is_review_of_client(p_booking_id uuid, p_reviewee_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings where id = p_booking_id and client_id = p_reviewee_id)
$$;

drop policy if exists "reviews publicly readable" on reviews;
drop policy if exists "reviews readable" on reviews;
create policy "reviews readable" on reviews for select using (
  is_admin()
  or reviewer_id = auth.uid()
  or reviewee_id = auth.uid()
  or not is_review_of_client(booking_id, reviewee_id)
  or skipper_was_pinged_by_client(reviewee_id)
);

-- ---------------------------------------------------------------------------
-- #25 #26 Φωτογραφίες: όχι λίστα για όλους· ο διαχειριστής μπορεί να σβήσει
-- Η δημόσια διεύθυνση κάθε φωτογραφίας δουλεύει χωρίς πολιτική ανάγνωσης
-- (δημόσιος κάδος). Ο κάτοχος και ο διαχειριστής χρειάζονται ανάγνωση για
-- αντικατάσταση και διαγραφή.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  drop policy if exists "crew photos public read" on storage.objects;
  drop policy if exists "crew photos owner or admin read" on storage.objects;
  drop policy if exists "crew photos admin delete" on storage.objects;
  create policy "crew photos owner or admin read" on storage.objects for select to authenticated using (
    bucket_id = 'crew-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
  create policy "crew photos admin delete" on storage.objects for delete to authenticated using (
    bucket_id = 'crew-photos' and public.is_admin());
end;
$$;

-- ---------------------------------------------------------------------------
-- #34 #35 Αίτημα: όχι στο παρελθόν, έως 60 ημέρες, έως 50 άτομα
-- ---------------------------------------------------------------------------
create or replace function validate_booking_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  if new.start_date < current_date then raise exception 'start_in_past'; end if;
  if new.end_date - new.start_date > 60 then raise exception 'trip_too_long'; end if;
  if new.party_size is not null and new.party_size > 50 then raise exception 'party_too_large'; end if;
  return new;
end;
$$;
drop trigger if exists ab_validate_booking_request on booking_requests;
create trigger ab_validate_booking_request before insert on booking_requests
  for each row execute function validate_booking_request();

-- #41 #42 Μεταφορά: όχι αναχώρηση στο παρελθόν, έως 30 ημέρες ευελιξία, έως 5.000 μίλια
create or replace function validate_delivery_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or auth.uid() is null then return new; end if;
  if new.departure_date < current_date then raise exception 'departure_in_past'; end if;
  if new.flexible_days > 30 then raise exception 'invalid_flexible_days'; end if;
  if new.distance_miles > 5000 then raise exception 'invalid_distance'; end if;
  return new;
end;
$$;
drop trigger if exists ab_validate_delivery_request on delivery_requests;
create trigger ab_validate_delivery_request before insert on delivery_requests
  for each row execute function validate_delivery_request();

-- ---------------------------------------------------------------------------
-- #39 #40 Όρια κειμένου σε νέα σχόλια αξιολόγησης και μηνύματα (οι παλιές
-- γραμμές δεν ξαναελέγχονται, ούτε όταν π.χ. σημειώνονται αναγνωσμένες)
-- ---------------------------------------------------------------------------
create or replace function validate_text_lengths()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'messages' then
    if btrim(coalesce(new.content, '')) = '' then raise exception 'message_empty'; end if;
    if char_length(new.content) > 4000 then raise exception 'message_too_long'; end if;
  elsif new.comment is not null and char_length(new.comment) > 2000 then
    raise exception 'comment_too_long';
  end if;
  return new;
end;
$$;
drop trigger if exists ab_validate_text_lengths on messages;
create trigger ab_validate_text_lengths before insert on messages
  for each row execute function validate_text_lengths();
drop trigger if exists ab_validate_text_lengths on reviews;
create trigger ab_validate_text_lengths before insert on reviews
  for each row execute function validate_text_lengths();

-- ---------------------------------------------------------------------------
-- #47 Όταν ένα αίτημα κλείνει ή αποσύρεται από κάποιον, η ειδοποίηση «νέο
-- αίτημα» του επαγγελματία σημειώνεται αναγνωσμένη (και δεν φεύγει email).
-- Αφορά ειδοποιήσεις από εδώ και πέρα: από τώρα κουβαλούν το request_id.
-- ---------------------------------------------------------------------------
create index if not exists notifications_request_idx on notifications ((data ->> 'request_id'))
  where data ? 'request_id';

create or replace function retire_request_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'booking_requests' then
    if old.status = 'open' and new.status <> 'open' then
      update notifications set read_at = now()
       where data ->> 'request_id' = new.id::text and read_at is null
         and kind in ('request_received', 'offer_received');
    end if;
    return null;
  end if;
  -- ο πελάτης απέσυρε έναν επαγγελματία
  update notifications set read_at = now()
   where data ->> 'request_id' = old.booking_request_id::text and read_at is null
     and kind in ('request_received', 'offer_received')
     and user_id = (select user_id from skipper_profiles where id = old.skipper_id);
  return null;
end;
$$;
drop trigger if exists zz_retire_request_notifications on booking_requests;
create trigger zz_retire_request_notifications after update of status on booking_requests
  for each row execute function retire_request_notifications();
drop trigger if exists zz_retire_request_notifications on booking_request_pings;
create trigger zz_retire_request_notifications after delete on booking_request_pings
  for each row execute function retire_request_notifications();

-- ---------------------------------------------------------------------------
-- #50 Το δώρο εγγραφής δίνεται όταν επαληθευτεί ο λογαριασμός, μία φορά
-- ---------------------------------------------------------------------------
alter table users add column if not exists signup_bonus_at timestamptz;
-- Όσοι υπάρχουν ήδη το πήραν (ή δεν δικαιούνταν) με τον παλιό κανόνα.
update users set signup_bonus_at = created_at where signup_bonus_at is null;

create or replace function apply_signup_bonus()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_bonus numeric;
begin
  if new.phone_verified_at is null or new.signup_bonus_at is not null then return null; end if;
  if tg_op = 'UPDATE' and old.phone_verified_at is not null then return null; end if;
  if current_date > date '2026-12-31' then return null; end if;

  v_bonus := case new.role when 'client' then 50 when 'skipper' then 100 end;
  if v_bonus is null then return null; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + v_bonus, signup_bonus_at = now() where id = new.id;
  insert into wallet_transactions (user_id, type, amount, note) values (new.id, 'deposit', v_bonus, 'Δώρο εγγραφής');
  return null;
end;
$$;
drop trigger if exists trg_signup_bonus on users;
create trigger trg_signup_bonus after insert or update of phone_verified_at on users
  for each row execute function apply_signup_bonus();

-- ---------------------------------------------------------------------------
-- #36 #37 #38 #44 #47 #49 (στις συναρτήσεις παρακάτω)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_booking_request(p_request_id uuid, p_skipper_id uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if v_req.origin = 'admin_replacement' then raise exception 'use_replacement_flow'; end if;
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;
  if v_req.fee_paid_at is null then raise exception 'fee_not_paid'; end if;
  if v_req.expires_at <= now() then raise exception 'request_expired'; end if;
  -- Το ταξίδι έχει ήδη ξεκινήσει: δεν δέχεται πια κανείς (0106).
  if v_req.start_date < current_date then raise exception 'request_expired'; end if;

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
    booking_request_id, client_id, skipper_id, start_date, end_date, port_id, region_id, departure_point, arrival_point, boat_type_id,
    party_size, private_cabin, crew_role,
    skipper_claim_fee_amount, skipper_claim_paid_at, confirmed_at, status,
    replaces_booking_id, assigned_by
  ) values (
    p_request_id, v_req.client_id, p_skipper_id, v_req.start_date, v_req.end_date, v_req.port_id, v_req.region_id, v_req.departure_point, v_req.arrival_point, v_req.boat_type_id,
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
$function$;

CREATE OR REPLACE FUNCTION public.accept_delivery_role_request(p_role_request_id uuid, p_skipper_id uuid)
 RETURNS delivery_bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Η αναχώρηση (και όλο το περιθώριο ευελιξίας) έχει περάσει (0106).
  if v_dr.departure_date + v_dr.flexible_days < current_date then raise exception 'expired'; end if;

  select * into v_ping from delivery_role_pings
    where delivery_role_request_id = p_role_request_id and skipper_id = p_skipper_id for update;
  if not found then raise exception 'not_pinged'; end if;
  if v_ping.status <> 'pending' then raise exception 'already_resolved'; end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if v_skipper.deleted_at is not null then raise exception 'skipper_not_eligible'; end if;
  -- Ξανά έλεγχος έγκρισης τη στιγμή της αποδοχής, όπως στο claim_booking_request (0106).
  if v_rr.crew_role = v_skipper.role then
    if v_skipper.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  elsif not exists (
    select 1 from skipper_secondary_roles
     where skipper_id = p_skipper_id and role = v_rr.crew_role and deleted_at is null and approval_status = 'approved'
  ) then
    raise exception 'skipper_not_eligible';
  end if;

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
    covers_tickets, covers_travel, covers_food, food_allowance_amount, covers_fuel, covers_port_expenses,
    offered_price, professional_fee_amount
  ) values (
    p_role_request_id, v_dr.id, v_dr.client_id, p_skipper_id, v_rr.crew_role,
    v_dr.origin_point, v_dr.destination_point, v_dr.distance_miles, v_dr.departure_date, v_dr.flexible_days,
    v_dr.covers_tickets, v_dr.covers_travel, v_dr.covers_food, v_dr.food_allowance_amount, v_dr.covers_fuel, v_dr.covers_port_expenses,
    v_rr.offered_price, v_rr.professional_fee
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
$function$;

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
  update users set wallet_balance = wallet_balance - v_req.fee_amount where id = v_uid;
  insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
    values (v_uid, 'request_fee', -v_req.fee_amount, p_request_id);

  update booking_requests set fee_paid_at = now() where id = p_request_id returning * into v_req;
  insert into booking_request_pings (booking_request_id, skipper_id)
    select p_request_id, s from unnest(p_skipper_ids) as s
    on conflict do nothing;
  return v_req;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_request_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid; v_req booking_requests%rowtype; v_fee numeric;
begin
  select user_id into v_uid from skipper_profiles where id = new.skipper_id;
  select * into v_req from booking_requests where id = new.booking_request_id;
  v_fee := coalesce(v_req.claim_fee_amount, (select value from platform_settings where key = 'skipper_claim_fee'));
  perform notify_user(
    v_uid,
    case when v_req.origin = 'client' then 'request_received' else 'offer_received' end,
    jsonb_build_object(
      'port', booking_place(v_req.departure_point, v_req.port_id, v_req.region_id),
      'start', v_req.start_date, 'end', v_req.end_date,
      'origin', v_req.origin, 'request_id', v_req.id, 'fee', v_fee, 'note', v_req.note, 'role', v_req.crew_role
    ),
    '/platform/requests'
  );
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_review_after_end_date()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare v_end date; v_status booking_status;
begin
  select end_date, status into v_end, v_status from bookings where id = new.booking_id;
  -- Ακυρωμένη κράτηση δεν αξιολογείται (0106).
  if v_status::text like 'cancelled%' then raise exception 'review_not_allowed_cancelled'; end if;
  if v_end is null or v_end >= current_date then
    raise exception 'review_not_allowed_before_end_date';
  end if;
  return new;
end;
$function$;
