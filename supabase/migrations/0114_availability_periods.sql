-- ============================================================================
-- Διαθεσιμότητα ανά περίοδο και περιοχή.
--
-- Ο επαγγελματίας δηλώνει περιόδους: «Ιούνιο στο Ιόνιο, Αύγουστο στον
-- Σαρωνικό», ή «την άλλη εβδομάδα στη Σύρο, αφού θα είμαι εκεί». Μια νέα
-- περίοδος πάνω σε υπάρχουσα αλλάζει τις κοινές μέρες στη νέα περιοχή: η
-- παλιά περίοδος κόβεται (ή σπάει στα δύο) και οι υπόλοιπες μέρες της μένουν
-- όπως ήταν. Όλα σε μία κίνηση, ώστε να μην μείνει ποτέ μισή αλλαγή.
--
-- Με p_replace_id η ίδια κίνηση αλλάζει μια υπάρχουσα περίοδο (ημερομηνίες
-- ή περιοχές). Τρέχει με τα δικαιώματα του χρήστη: οι κανόνες πρόσβασης
-- ισχύουν όπως σε κάθε απευθείας εγγραφή.
-- ============================================================================

create or replace function set_availability_period(
  p_start date,
  p_end date,
  p_region_ids uuid[],
  p_crew_role crew_role default null,
  p_replace_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_sp uuid := my_skipper_profile_id();
  v_new uuid;
  v_tail uuid;
  w record;
begin
  if v_sp is null then raise exception 'not_professional'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'invalid_dates'; end if;
  if p_start < current_date then raise exception 'date_in_past'; end if;
  if p_end - p_start > 366 then raise exception 'period_too_long'; end if;
  if coalesce(array_length(p_region_ids, 1), 0) = 0 then raise exception 'region_required'; end if;
  if exists (select 1 from unnest(p_region_ids) r where not exists (select 1 from regions where id = r)) then
    raise exception 'invalid_region';
  end if;

  if p_replace_id is not null then
    delete from availability_windows where id = p_replace_id and skipper_id = v_sp;
    if not found then raise exception 'window_not_found'; end if;
  end if;

  -- Ό,τι επικαλύπτεται: κόβεται στα όρια της νέας περιόδου.
  for w in
    select * from availability_windows
     where skipper_id = v_sp
       and crew_role is not distinct from p_crew_role
       and start_date <= p_end and end_date >= p_start
     order by start_date
     for update
  loop
    if w.start_date >= p_start and w.end_date <= p_end then
      delete from availability_windows where id = w.id;
    elsif w.start_date < p_start and w.end_date > p_end then
      -- Η νέα περίοδος πέφτει στη μέση: η παλιά σπάει σε δύο.
      update availability_windows set end_date = p_start - 1 where id = w.id;
      insert into availability_windows (skipper_id, start_date, end_date, crew_role)
        values (v_sp, p_end + 1, w.end_date, w.crew_role)
        returning id into v_tail;
      insert into availability_window_regions (window_id, region_id)
        select v_tail, region_id from availability_window_regions where window_id = w.id;
    elsif w.start_date < p_start then
      update availability_windows set end_date = p_start - 1 where id = w.id;
    else
      update availability_windows set start_date = p_end + 1 where id = w.id;
    end if;
  end loop;

  insert into availability_windows (skipper_id, start_date, end_date, crew_role)
    values (v_sp, p_start, p_end, p_crew_role)
    returning id into v_new;
  insert into availability_window_regions (window_id, region_id)
    select v_new, r from (select distinct unnest(p_region_ids) r) x;
  return v_new;
end;
$$;
revoke execute on function set_availability_period(date, date, uuid[], crew_role, uuid) from public, anon;
grant execute on function set_availability_period(date, date, uuid[], crew_role, uuid) to authenticated;
