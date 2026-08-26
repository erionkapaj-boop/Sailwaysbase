-- ============================================================================
-- Bug: κάθε επαγγελματίας μπαίνει στο users.status = 'draft' κατά την εγγραφή
-- (createUserDraft) αλλά τίποτα ποτέ δεν το γυρνάει σε 'active' — ούτε καν η
-- έγκριση από τον admin (admin_approve_skipper άλλαζε μόνο το
-- skipper_profiles.approval_status). Αποτέλεσμα: κάθε εγκεκριμένος,
-- πλήρως ενεργός επαγγελματίας δείχνει μόνιμα «Ημιτελής» στο admin.
--
-- Διόρθωση: η έγκριση από τον admin είναι το φυσικό σημείο όπου ένας
-- επαγγελματίας παύει να είναι «μισός λογαριασμός» — οπότε
-- admin_approve_skipper τώρα ενεργοποιεί και το users.status.
-- Και ένα εφάπαξ backfill για τους ήδη εγκεκριμένους λογαριασμούς που έχουν
-- μείνει πιασμένοι σε 'draft'.
-- ============================================================================

create or replace function admin_approve_skipper(p_user_id uuid) returns skipper_profiles
language plpgsql security definer set search_path = public as $$
declare v_new skipper_profiles%rowtype; v_existing skipper_profiles%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

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
$$;

-- Backfill: όσοι είναι ήδη εγκεκριμένοι αλλά έμειναν κολλημένοι σε 'draft'
-- επειδή εγκρίθηκαν πριν από αυτή τη διόρθωση.
update users u set status = 'active'
where u.status = 'draft'
  and exists (
    select 1 from skipper_profiles sp
    where sp.user_id = u.id and sp.approval_status = 'approved'
  );
