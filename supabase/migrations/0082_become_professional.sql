-- ============================================================================
-- Ζητήθηκε: ένας ήδη εγγεγραμμένος πελάτης να μπορεί να γίνει επαγγελματίας
-- αν θέλει, χωρίς να ξαναγραφτεί από την αρχή. Το complete_registration
-- (0074/0077) αρνείται ρητά να αλλάξει ρόλο σε ήδη ζωντανό λογαριασμό — ίδιο
-- σκεπτικό με τότε: δεν πρέπει μια απλή επανυποβολή φόρμας να αλλάζει ρόλο
-- σιωπηλά. Χρειάζεται ξεχωριστό, ρητό RPC, καλούμενο μόνο από ένα ρητό
-- κουμπί «Θέλεις να γίνεις επαγγελματίας;» στο προφίλ.
--
-- Χάρη στο 0081 (ενοποίηση φωτογραφίας/εθνικότητας/γλωσσών στο users), ο
-- πελάτης ΔΕΝ ξαναδίνει τίποτα από αυτά — μόνο ό,τι είναι πραγματικά
-- καινούριο: ιδιότητα, στοιχεία άδειας, τιμή/ημέρα. approval_status
-- ξεκινάει πάντα 'pending' — περνάει από την ίδια έγκριση admin όπως κάθε
-- νέος επαγγελματίας, καμία συντόμευση.
--
-- Το client_profiles/ιστορικό ΔΕΝ αγγίζεται — μπορεί να συνεχίσει να κλείνει
-- ναύλα και ως πελάτης, όπως ήδη μπορεί σήμερα ο admin/owner (0026).
-- ============================================================================

create or replace function become_professional(
  p_crew_role crew_role,
  p_license_number text,
  p_license_type text,
  p_years_experience int default 0,
  p_price_per_day numeric default 210
) returns void
language plpgsql security definer set search_path = public as $$
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
  if p_price_per_day < 210 then raise exception 'invalid_price'; end if;

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
$$;
grant execute on function become_professional(crew_role, text, text, int, numeric) to authenticated;
