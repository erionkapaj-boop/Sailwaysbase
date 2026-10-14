-- ============================================================================
-- Ανοιχτά αιτήματα από την αναζήτηση (0125).
--
-- Απόφαση ιδιοκτήτη 14/10/2026: κανένα αίτημα δεν απορρίπτεται επειδή δεν
-- υπάρχει διαθέσιμος επαγγελματίας. Αν η αναζήτηση δεν βρει κανέναν, ή ο
-- πελάτης δεν θέλει κανέναν από όσους βρέθηκαν, το αίτημα μένει ανοιχτό στον
-- πίνακα μέχρι την ημερομηνία έναρξης (ή μέχρι να διαλέξει / να το κλείσει).
--
-- - Η διάρκεια είναι πλέον «μέχρι την ημερομηνία έναρξης» (board_after_start_days
--   0, χωρίς πρακτικό όριο ημερών). Ισχύει για όσα αιτήματα αναρτηθούν από εδώ και πέρα.
-- - Ο τύπος σκάφους είναι προαιρετικός στο post_open_request: το ζητά μόνο το
--   skipper, όπως στο απλό αίτημα.
-- ============================================================================

update platform_settings set value = 0 where key = 'board_after_start_days';
update platform_settings set value = 365 where key = 'board_max_days';

create or replace function post_open_request(
  p_start date, p_end date, p_region_id uuid, p_departure_point text, p_arrival_point text,
  p_boat_type_id uuid, p_crew_role crew_role, p_party_size int default null,
  p_private_cabin boolean default null, p_note text default null)
returns booking_requests language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_fee numeric;
  v_wallet numeric;
  v_expires timestamptz;
  v_req booking_requests%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from client_profiles where user_id = v_uid) then raise exception 'not_a_client'; end if;
  if exists (select 1 from users where id = v_uid and phone_verified_at is null and role <> 'admin' and not is_staff_admin) then
    raise exception 'account_not_verified';
  end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'invalid_dates'; end if;
  if p_start < current_date then raise exception 'start_in_past'; end if;
  if p_end - p_start > 60 then raise exception 'trip_too_long'; end if;
  if p_party_size is not null and (p_party_size < 1 or p_party_size > 50) then raise exception 'party_too_large'; end if;
  -- Ο τύπος σκάφους είναι προαιρετικός: ρωτιέται μόνο για skipper (όπως στο απλό αίτημα).
  if p_region_id is null or p_crew_role is null then raise exception 'invalid_request'; end if;
  if nullif(btrim(p_departure_point), '') is null or nullif(btrim(p_arrival_point), '') is null then raise exception 'invalid_request'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'note_too_long'; end if;

  perform pg_advisory_xact_lock(hashtext('wallet:' || v_uid::text));
  if (select count(*) from booking_requests
       where client_id = v_uid and origin = 'client' and fee_paid_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_requests';
  end if;

  v_fee := (select value from platform_settings where key = 'client_request_fee');
  select wallet_balance into v_wallet from users where id = v_uid for update;
  if v_wallet - user_reserved_credits(v_uid) < v_fee then raise exception 'insufficient_wallet'; end if;

  v_expires := least(
    now() + (select value from platform_settings where key = 'board_max_days') * interval '1 day',
    (p_start + ((select value from platform_settings where key = 'board_after_start_days')::int + 1))::timestamptz);

  perform set_config('platform.trusted', 'true', true);
  insert into booking_requests (
    client_id, origin, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id,
    crew_role, party_size, private_cabin, note, fee_amount, fee_paid_at, expires_at,
    board_open, board_posted_at)
  values (
    v_uid, 'client', p_start, p_end, p_region_id, nullif(btrim(p_departure_point), ''), nullif(btrim(p_arrival_point), ''),
    p_boat_type_id, p_crew_role, p_party_size, p_private_cabin, nullif(btrim(p_note), ''),
    v_fee, now(), v_expires, true, now())
  returning * into v_req;
  return v_req;
end;
$$;
revoke execute on function post_open_request(date, date, uuid, text, text, uuid, crew_role, int, boolean, text) from public, anon;
grant execute on function post_open_request(date, date, uuid, text, text, uuid, crew_role, int, boolean, text) to authenticated;
