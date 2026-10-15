-- Η ακριβής επιλογή καμπίνας (κουκέτα / ιδιωτική / καμπίνα σκίπερ) αποθηκεύεται
-- στο αίτημα και στην κράτηση. Το private_cabin (true/false) μένει ως έχει και
-- κρατιέται πάντα σε συμφωνία με το cabin_kind: κουκέτα = false, τα άλλα δύο = true.
-- Παλιές γραμμές χωρίς cabin_kind διαβάζονται από το private_cabin.

alter table booking_requests add column if not exists cabin_kind text;
alter table bookings add column if not exists cabin_kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'booking_requests_cabin_kind_check') then
    alter table booking_requests add constraint booking_requests_cabin_kind_check
      check (cabin_kind in ('bunk', 'private', 'skipper'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_cabin_kind_check') then
    alter table bookings add constraint bookings_cabin_kind_check
      check (cabin_kind in ('bunk', 'private', 'skipper'));
  end if;
end $$;

-- Συγχρονισμός: ο τύπος κερδίζει· αν αλλάξει μόνο το boolean, ο τύπος προκύπτει από αυτό·
-- μια κράτηση ή αντικατάσταση χωρίς τύπο τον παίρνει από το αίτημα ή την αρχική κράτηση
-- (μόνο όταν συμφωνεί με το boolean της).
create or replace function sync_cabin_kind() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  if tg_op = 'UPDATE' and new.cabin_kind is not distinct from old.cabin_kind
     and new.private_cabin is distinct from old.private_cabin then
    new.cabin_kind := case when new.private_cabin is null then null
                           when new.private_cabin then 'private' else 'bunk' end;
    return new;
  end if;
  if new.cabin_kind is not null then
    new.private_cabin := new.cabin_kind <> 'bunk';
    return new;
  end if;
  if new.private_cabin is not null then
    -- Εμφωλευμένα, γιατί το booking_requests δεν έχει στήλη booking_request_id.
    if tg_table_name = 'bookings' then
      if new.booking_request_id is not null then
        select cabin_kind into v_kind from booking_requests where id = new.booking_request_id;
      end if;
    end if;
    if v_kind is null and new.replaces_booking_id is not null then
      select cabin_kind into v_kind from bookings where id = new.replaces_booking_id;
    end if;
    if v_kind is not null and (v_kind <> 'bunk') = new.private_cabin then
      new.cabin_kind := v_kind;
    else
      new.cabin_kind := case when new.private_cabin then 'private' else 'bunk' end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists booking_requests_cabin_kind on booking_requests;
create trigger booking_requests_cabin_kind before insert or update on booking_requests
  for each row execute function sync_cabin_kind();
drop trigger if exists bookings_cabin_kind on bookings;
create trigger bookings_cabin_kind before insert or update on bookings
  for each row execute function sync_cabin_kind();

-- Ανοιχτό αίτημα πληρώματος: νέα παράμετρος p_cabin_kind (αντικαθιστά την παλιά υπογραφή).
drop function if exists post_open_request(date, date, uuid, text, text, uuid, crew_role, int, boolean, text, text, int, int);
create or replace function post_open_request(
  p_start date, p_end date, p_region_id uuid, p_departure_point text, p_arrival_point text,
  p_boat_type_id uuid, p_crew_role crew_role, p_party_size int default null,
  p_private_cabin boolean default null, p_note text default null,
  p_boat_model text default null, p_boat_length_ft int default null, p_boat_year int default null,
  p_cabin_kind text default null)
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
  if p_cabin_kind is not null and p_cabin_kind not in ('bunk', 'private', 'skipper') then raise exception 'invalid_request'; end if;
  perform check_boat_details(p_boat_model, p_boat_length_ft, p_boat_year);

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
    crew_role, party_size, private_cabin, cabin_kind, note, fee_amount, fee_paid_at, expires_at,
    board_open, board_posted_at, boat_model, boat_length_ft, boat_year)
  values (
    v_uid, 'client', p_start, p_end, p_region_id, nullif(btrim(p_departure_point), ''), nullif(btrim(p_arrival_point), ''),
    p_boat_type_id, p_crew_role, p_party_size, p_private_cabin, p_cabin_kind, nullif(btrim(p_note), ''),
    v_fee, now(), v_expires, true, now(), nullif(btrim(p_boat_model), ''), p_boat_length_ft, p_boat_year)
  returning * into v_req;
  return v_req;
end;
$$;
revoke execute on function post_open_request(date, date, uuid, text, text, uuid, crew_role, int, boolean, text, text, int, int, text) from public, anon;
grant execute on function post_open_request(date, date, uuid, text, text, uuid, crew_role, int, boolean, text, text, int, int, text) to authenticated;

-- Δημόσιος πίνακας: επιστρέφει και την ακριβή καμπίνα.
drop function if exists board_requests(crew_role, date, uuid, int);
create or replace function board_requests(
  p_role crew_role default null, p_after_start date default null, p_after_id uuid default null, p_limit int default 20)
returns table (
  id uuid, start_date date, end_date date, region_id uuid, departure_point text, arrival_point text,
  boat_type_id uuid, crew_role crew_role, party_size int, private_cabin boolean, note text,
  boat_model text, boat_length_ft int, boat_year int,
  claims_count int, claimed_by_me boolean, closes_at timestamptz, cabin_kind text)
language sql stable security definer set search_path = public as $$
  select br.id, br.start_date, br.end_date, br.region_id, br.departure_point, br.arrival_point,
         br.boat_type_id, br.crew_role, br.party_size, br.private_cabin, br.note,
         br.boat_model, br.boat_length_ft, br.boat_year,
         (select count(*)::int from open_request_claims c where c.request_id = br.id and c.status = 'active'),
         coalesce(exists (select 1 from open_request_claims c join skipper_profiles sp on sp.id = c.skipper_id
                           where c.request_id = br.id and c.status = 'active' and sp.user_id = auth.uid()), false),
         br.expires_at, br.cabin_kind
    from booking_requests br
   where br.board_open and br.status = 'open' and br.expires_at > now()
     and (p_role is null or br.crew_role = p_role)
     and (p_after_start is null or (br.start_date, br.id) > (p_after_start, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000')))
   order by br.start_date, br.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function board_requests(crew_role, date, uuid, int) from public;
grant execute on function board_requests(crew_role, date, uuid, int) to anon, authenticated;
