-- ============================================================================
-- Καμία τιμή από την πλατφόρμα.
--
-- Η ημερήσια τιμή του επαγγελματία τη ορίζει ο ίδιος. Η πλατφόρμα δεν βάζει
-- ούτε ελάχιστο ούτε προτεινόμενο ποσό, ούτε προεπιλεγμένη τιμή: ένα κοινό όριο
-- ή μια «τυπική» τιμή που φαίνεται σε όλους τους ανταγωνιστές μπορεί να
-- θεωρηθεί ρύθμιση τιμών (δίκαιο ανταγωνισμού). Μένουν μόνο οι τεχνικοί
-- έλεγχοι: μεγαλύτερη από 0 και όχι πάνω από 5.000 € (λάθος πληκτρολόγησης).
--
--  - Φεύγουν τα check (price_per_day >= 210) από skipper_profiles και
--    skipper_secondary_roles· η τιμή μπορεί να είναι κενή μέχρι να τη δηλώσει.
--  - Η εγγραφή και το become_professional δεν βάζουν πια 210.
--  - Επαγγελματίας χωρίς τιμή δεν εμφανίζεται στις αναζητήσεις.
--  - Οι τιμές που υπάρχουν μένουν όπως είναι· κάθε επαγγελματίας τις αλλάζει
--    ελεύθερα.
-- ============================================================================

alter table skipper_profiles drop constraint if exists skipper_profiles_price_per_day_check;
alter table skipper_secondary_roles drop constraint if exists skipper_secondary_roles_price_per_day_check;
alter table skipper_profiles alter column price_per_day drop not null;
alter table skipper_secondary_roles alter column price_per_day drop not null;
alter table skipper_profiles drop constraint if exists skipper_profiles_price_positive;
alter table skipper_profiles add constraint skipper_profiles_price_positive check (price_per_day is null or price_per_day > 0);
alter table skipper_secondary_roles drop constraint if exists skipper_secondary_roles_price_positive;
alter table skipper_secondary_roles add constraint skipper_secondary_roles_price_positive check (price_per_day is null or price_per_day > 0);

drop function if exists become_professional(crew_role, text, text, integer, numeric);
CREATE OR REPLACE FUNCTION public.become_professional(p_crew_role crew_role, p_license_number text, p_license_type text, p_years_experience integer DEFAULT 0, p_price_per_day numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_user users%rowtype;
  v_existing_sp skipper_profiles%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_user from users where id = v_uid;
  if not found then raise exception 'user_not_found'; end if;
  if v_user.status <> 'active' then raise exception 'account_not_active'; end if;
  if v_user.role <> 'client' then raise exception 'already_professional'; end if;

  if coalesce(btrim(p_license_number), '') = '' then raise exception 'license_number_required'; end if;
  if coalesce(btrim(p_license_type), '') = '' then raise exception 'license_type_required'; end if;
  if p_price_per_day is not null and p_price_per_day <= 0 then raise exception 'invalid_price'; end if;

  if exists (
    select 1 from skipper_profiles
    where license_number = btrim(p_license_number) and user_id <> v_uid
  ) then
    raise exception 'license_already_registered';
  end if;

  perform set_config('platform.trusted', 'true', true);

  -- Ίδιο μοτίβο με το complete_registration: ένα soft-deleted skipper_profiles
  -- από παλιότερη επαγγελματική ζωή αναβιώνει αντί να φτιαχτεί δεύτερο· ένα
  -- ζωντανό ήδη υπάρχον (θεωρητικά αδύνατο εφόσον ο ρόλος είναι 'client', αλλά
  -- ελέγχεται ρητά αντί να υποτεθεί) σταματάει τη ροή αντί να αντικατασταθεί.
  select * into v_existing_sp from skipper_profiles where user_id = v_uid;
  if not found then
    insert into skipper_profiles (user_id, role, full_name, license_number, license_type, years_experience, price_per_day)
      values (v_uid, p_crew_role, v_user.full_name, btrim(p_license_number), btrim(p_license_type),
        coalesce(p_years_experience, 0), p_price_per_day);
  elsif v_existing_sp.deleted_at is not null then
    update skipper_profiles set
      deleted_at = null, role = p_crew_role, full_name = v_user.full_name,
      license_number = btrim(p_license_number), license_type = btrim(p_license_type),
      years_experience = coalesce(p_years_experience, 0), price_per_day = p_price_per_day,
      approval_status = 'pending', approved_by = null, approved_at = null
      where id = v_existing_sp.id;
  else
    raise exception 'profile_already_exists';
  end if;

  update users set role = 'skipper' where id = v_uid;
end;
$function$;
revoke execute on function become_professional(crew_role, text, text, integer, numeric) from public, anon;
grant execute on function become_professional(crew_role, text, text, integer, numeric) to authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_profile(p_user_id uuid, p_full_name text, p_email text DEFAULT NULL::text, p_price_per_day numeric DEFAULT NULL::numeric, p_license_number text DEFAULT NULL::text, p_license_type text DEFAULT NULL::text, p_years_experience integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    if p_price_per_day is not null and p_price_per_day <= 0 then
      raise exception 'invalid_price';
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
$function$;

CREATE OR REPLACE FUNCTION public.complete_registration(p_full_name text, p_email text, p_phone text, p_crew_role crew_role DEFAULT NULL::crew_role, p_phone_verified boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.validate_professional_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (tg_op = 'INSERT' or new.price_per_day is distinct from old.price_per_day)
     and new.price_per_day is not null and new.price_per_day <= 0 then
    raise exception 'invalid_price';
  end if;
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
$function$;

create or replace view skipper_public as
 SELECT sp.id,
    sp.role,
    u.photo_url,
    sp.gender,
    sp.years_experience,
    sp.license_type,
    sp.price_per_day,
    sp.rating_avg,
    sp.rating_count,
        CASE
            WHEN (((sp.completed_bookings_count + sp.cancellation_flag_count))::numeric < ( SELECT platform_settings.value
               FROM platform_settings
              WHERE (platform_settings.key = 'reliability_min_history'::text))) THEN NULL::numeric
            ELSE sp.reliability_percentage
        END AS reliability_percentage,
    sp.tier,
    sp.rating_avg_safety,
    sp.rating_avg_seamanship,
    sp.rating_avg_professionalism,
    sp.rating_avg_cleanliness,
    sp.rating_avg_communication,
    sp.rating_avg_hospitality,
    sp.rating_avg_cooking,
    sp.rating_avg_service,
    sp.rating_avg_taste,
    sp.rating_avg_variety,
    sp.rating_avg_presentation,
    sp.rating_avg_adaptability,
    sp.rating_avg_organization,
    sp.rating_avg_maintenance,
    sp.rating_avg_teamwork,
    sp.rating_avg_diligence,
    ( SELECT n.name
           FROM nationalities n
          WHERE (n.id = u.nationality_id)) AS nationality_name,
    ( SELECT array_agg(l.name ORDER BY l.name) AS array_agg
           FROM (user_languages ul
             JOIN languages l ON ((l.id = ul.language_id)))
          WHERE (ul.user_id = sp.user_id)) AS languages,
    ( SELECT n.flag_emoji
           FROM nationalities n
          WHERE (n.id = u.nationality_id)) AS nationality_flag,
    (date_part('year'::text, age((CURRENT_DATE)::timestamp with time zone, (sp.date_of_birth)::timestamp with time zone)))::integer AS age,
    ( SELECT n.country_name
           FROM nationalities n
          WHERE (n.id = u.nationality_id)) AS nationality_country
   FROM (skipper_profiles sp
     JOIN users u ON ((u.id = sp.user_id)))
  WHERE ((sp.approval_status = 'approved'::skipper_approval_status) AND (sp.deleted_at IS NULL) AND (sp.price_per_day IS NOT NULL))
UNION ALL
 SELECT sp.id,
    ssr.role,
    u.photo_url,
    sp.gender,
    ssr.years_experience,
    ssr.license_type,
    ssr.price_per_day,
    ssr.rating_avg,
    ssr.rating_count,
        CASE
            WHEN (((sp.completed_bookings_count + sp.cancellation_flag_count))::numeric < ( SELECT platform_settings.value
               FROM platform_settings
              WHERE (platform_settings.key = 'reliability_min_history'::text))) THEN NULL::numeric
            ELSE sp.reliability_percentage
        END AS reliability_percentage,
    sp.tier,
    ssr.rating_avg_safety,
    ssr.rating_avg_seamanship,
    ssr.rating_avg_professionalism,
    ssr.rating_avg_cleanliness,
    ssr.rating_avg_communication,
    ssr.rating_avg_hospitality,
    ssr.rating_avg_cooking,
    ssr.rating_avg_service,
    ssr.rating_avg_taste,
    ssr.rating_avg_variety,
    ssr.rating_avg_presentation,
    ssr.rating_avg_adaptability,
    ssr.rating_avg_organization,
    ssr.rating_avg_maintenance,
    ssr.rating_avg_teamwork,
    ssr.rating_avg_diligence,
    ( SELECT n.name
           FROM nationalities n
          WHERE (n.id = u.nationality_id)) AS nationality_name,
    ( SELECT array_agg(l.name ORDER BY l.name) AS array_agg
           FROM (user_languages ul
             JOIN languages l ON ((l.id = ul.language_id)))
          WHERE (ul.user_id = sp.user_id)) AS languages,
    ( SELECT n.flag_emoji
           FROM nationalities n
          WHERE (n.id = u.nationality_id)) AS nationality_flag,
    (date_part('year'::text, age((CURRENT_DATE)::timestamp with time zone, (sp.date_of_birth)::timestamp with time zone)))::integer AS age,
    ( SELECT n.country_name
           FROM nationalities n
          WHERE (n.id = u.nationality_id)) AS nationality_country
   FROM ((skipper_secondary_roles ssr
     JOIN skipper_profiles sp ON ((sp.id = ssr.skipper_id)))
     JOIN users u ON ((u.id = sp.user_id)))
  WHERE ((ssr.approval_status = 'approved'::skipper_approval_status) AND (ssr.deleted_at IS NULL) AND (sp.deleted_at IS NULL) AND (ssr.price_per_day IS NOT NULL));

CREATE OR REPLACE FUNCTION public.skipper_is_search_visible(p_skipper_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from skipper_profiles sp
    where sp.id = p_skipper_id
      and sp.approval_status = 'approved'
      and sp.deleted_at is null
      and sp.price_per_day is not null
      and has_future_availability(sp.id)
      and exists (select 1 from skipper_boat_types bt where bt.skipper_id = sp.id)
  );
$function$;
