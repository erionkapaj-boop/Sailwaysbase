-- Πελάτης που μπαίνει μόνο με Google (0132): χωρίς κινητό και χωρίς κωδικό στην εγγραφή.
-- Το κινητό παύει να είναι υποχρεωτικό στη στήλη (παραμένει μοναδικό όταν υπάρχει) και η εγγραφή
-- πελάτη με επαληθευμένη Google δεν το απαιτεί· το προσθέτει αργότερα (set_my_phone), όταν χρειαστεί.
-- Επαγγελματίες και εγγραφές χωρίς Google: αμετάβλητα (το κινητό μένει υποχρεωτικό).
-- Ασφαλές να ξανατρέξει.
alter table users alter column phone_number drop not null;

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
  v_google boolean;
  v_verified_at timestamptz;
  v_existing_user users%rowtype;
  v_existing_sp skipper_profiles%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_name = '' then raise exception 'name_required'; end if;
  if char_length(v_name) > 120 then raise exception 'invalid_name'; end if;

  select nullif(btrim(phone), ''), coalesce(raw_app_meta_data ->> 'signup', '') = 'pending'
    into v_phone, v_pending
    from auth.users where id = v_uid;
  -- Επαληθευμένο email από Google: το email του προφίλ είναι αυτό, όχι του browser.
  v_google := exists (
    select 1 from auth.identities
     where user_id = v_uid and provider = 'google'
       and coalesce(identity_data ->> 'email_verified', '') = 'true');
  if v_google then
    v_email := coalesce(nullif(btrim((select email from auth.users where id = v_uid)), ''), v_email);
  end if;
  -- Πελάτης με Google (0132): το τηλέφωνο δεν ζητείται στην εγγραφή· προστίθεται αργότερα, όταν χρειαστεί.
  -- Επαγγελματίες και λογαριασμοί χωρίς Google το έχουν πάντα υποχρεωτικό.
  if v_phone is null and not (v_google and not v_is_pro) then raise exception 'phone_required'; end if;
  if v_phone is not null then v_phone := '+' || ltrim(v_phone, '+'); end if;

  if v_email is not null and not is_valid_email(v_email) then raise exception 'invalid_email'; end if;

  if v_google
     or (coalesce((select value from platform_settings where key = 'otp_enabled'), 0) = 1 and not v_pending) then
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
        values (v_uid, p_crew_role, v_name, null);
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
