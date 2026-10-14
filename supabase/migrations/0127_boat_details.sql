-- ============================================================================
-- Στοιχεία σκάφους στα αιτήματα (0127): μοντέλο (π.χ. «Lagoon 42», «Bavaria 46»),
-- μήκος σε πόδια και κατά προσέγγιση έτος κατασκευής. Ο επαγγελματίας βλέπει
-- τι σκάφος θα αναλάβει, πριν διεκδικήσει ή αποδεχτεί.
--
-- Όλα προαιρετικά: ένα αίτημα χωρίς στοιχεία σκάφους παραμένει έγκυρο.
-- Ισχύει για αιτήματα πληρώματος και μεταφοράς, με κοινό έλεγχο τιμών
-- (check_boat_details). Η κράτηση παίρνει αντίγραφο από το αίτημα (trigger),
-- ώστε να μη χρειάζεται να αλλάξει κάθε συνάρτηση που δημιουργεί κράτηση.
-- ============================================================================

alter table booking_requests add column if not exists boat_model text;
alter table booking_requests add column if not exists boat_length_ft int;
alter table booking_requests add column if not exists boat_year int;
alter table bookings add column if not exists boat_model text;
alter table bookings add column if not exists boat_length_ft int;
alter table bookings add column if not exists boat_year int;
alter table delivery_requests add column if not exists boat_model text;
alter table delivery_requests add column if not exists boat_length_ft int;
alter table delivery_requests add column if not exists boat_year int;
alter table delivery_bookings add column if not exists boat_model text;
alter table delivery_bookings add column if not exists boat_length_ft int;
alter table delivery_bookings add column if not exists boat_year int;

-- Κοινός έλεγχος τιμών: 'invalid_boat' αν κάτι είναι εκτός ορίων.
create or replace function check_boat_details(p_model text, p_length_ft int, p_year int)
returns void language plpgsql immutable as $$
begin
  if p_model is not null and char_length(btrim(p_model)) > 60 then raise exception 'invalid_boat'; end if;
  if p_length_ft is not null and (p_length_ft < 10 or p_length_ft > 300) then raise exception 'invalid_boat'; end if;
  if p_year is not null and (p_year < 1900 or p_year > 2100) then raise exception 'invalid_boat'; end if;
end;
$$;
revoke execute on function check_boat_details(text, int, int) from public, anon, authenticated;

-- Το ίδιο, ως περιορισμός στους πίνακες αιτημάτων (δίχτυ ασφαλείας για άμεσες εγγραφές).
alter table booking_requests drop constraint if exists booking_requests_boat_check;
alter table booking_requests add constraint booking_requests_boat_check check (
  (boat_model is null or char_length(boat_model) <= 60)
  and (boat_length_ft is null or boat_length_ft between 10 and 300)
  and (boat_year is null or boat_year between 1900 and 2100));
alter table delivery_requests drop constraint if exists delivery_requests_boat_check;
alter table delivery_requests add constraint delivery_requests_boat_check check (
  (boat_model is null or char_length(boat_model) <= 60)
  and (boat_length_ft is null or boat_length_ft between 10 and 300)
  and (boat_year is null or boat_year between 1900 and 2100));

-- Η κράτηση παίρνει τα στοιχεία σκάφους από το αίτημά της.
create or replace function copy_boat_to_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.boat_model is null and new.boat_length_ft is null and new.boat_year is null and new.booking_request_id is not null then
    select boat_model, boat_length_ft, boat_year into new.boat_model, new.boat_length_ft, new.boat_year
      from booking_requests where id = new.booking_request_id;
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_copy_boat on bookings;
create trigger bookings_copy_boat before insert on bookings for each row execute function copy_boat_to_booking();

create or replace function copy_boat_to_delivery_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.boat_model is null and new.boat_length_ft is null and new.boat_year is null and new.delivery_request_id is not null then
    select boat_model, boat_length_ft, boat_year into new.boat_model, new.boat_length_ft, new.boat_year
      from delivery_requests where id = new.delivery_request_id;
  end if;
  return new;
end;
$$;
drop trigger if exists delivery_bookings_copy_boat on delivery_bookings;
create trigger delivery_bookings_copy_boat before insert on delivery_bookings for each row execute function copy_boat_to_delivery_booking();

-- Ανοιχτό αίτημα πληρώματος: νέες παράμετροι (αντικαθιστά την παλιά υπογραφή).
drop function if exists post_open_request(date, date, uuid, text, text, uuid, crew_role, int, boolean, text);
create or replace function post_open_request(
  p_start date, p_end date, p_region_id uuid, p_departure_point text, p_arrival_point text,
  p_boat_type_id uuid, p_crew_role crew_role, p_party_size int default null,
  p_private_cabin boolean default null, p_note text default null,
  p_boat_model text default null, p_boat_length_ft int default null, p_boat_year int default null)
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
    crew_role, party_size, private_cabin, note, fee_amount, fee_paid_at, expires_at,
    board_open, board_posted_at, boat_model, boat_length_ft, boat_year)
  values (
    v_uid, 'client', p_start, p_end, p_region_id, nullif(btrim(p_departure_point), ''), nullif(btrim(p_arrival_point), ''),
    p_boat_type_id, p_crew_role, p_party_size, p_private_cabin, nullif(btrim(p_note), ''),
    v_fee, now(), v_expires, true, now(), nullif(btrim(p_boat_model), ''), p_boat_length_ft, p_boat_year)
  returning * into v_req;
  return v_req;
end;
$$;
revoke execute on function post_open_request(date, date, uuid, text, text, uuid, crew_role, int, boolean, text, text, int, int) from public, anon;
grant execute on function post_open_request(date, date, uuid, text, text, uuid, crew_role, int, boolean, text, text, int, int) to authenticated;

-- Αίτημα μεταφοράς: νέες παράμετροι.
drop function if exists create_delivery_request(text, text, numeric, text, date, int, boolean, boolean, boolean, numeric, boolean, boolean, text);
create or replace function create_delivery_request(
  p_origin text,
  p_destination text,
  p_distance_miles numeric,
  p_date_mode text,
  p_departure_date date,
  p_flexible_days int,
  p_covers_tickets boolean,
  p_covers_travel boolean,
  p_covers_food boolean,
  p_food_allowance_amount numeric,
  p_covers_fuel boolean,
  p_covers_port_expenses boolean,
  p_notes text default null,
  p_boat_model text default null,
  p_boat_length_ft int default null,
  p_boat_year int default null
) returns delivery_requests
language plpgsql security definer set search_path = public as $$
declare v_row delivery_requests%rowtype;
begin
  if not exists (select 1 from client_profiles where user_id = auth.uid()) then
    raise exception 'no_client_profile';
  end if;
  if p_distance_miles is null or p_distance_miles <= 0 then raise exception 'invalid_distance'; end if;
  if p_date_mode not in ('fixed', 'flexible') then raise exception 'invalid_date_mode'; end if;
  if p_food_allowance_amount is not null and p_food_allowance_amount < 0 then raise exception 'invalid_food_allowance'; end if;
  perform check_boat_details(p_boat_model, p_boat_length_ft, p_boat_year);

  insert into delivery_requests (
    client_id, origin_point, destination_point, distance_miles,
    date_mode, departure_date, flexible_days,
    covers_tickets, covers_travel, covers_food, food_allowance_amount, covers_fuel, covers_port_expenses,
    notes, boat_model, boat_length_ft, boat_year
  ) values (
    auth.uid(), btrim(p_origin), btrim(p_destination), p_distance_miles,
    p_date_mode, p_departure_date, case when p_date_mode = 'flexible' then coalesce(p_flexible_days, 0) else 0 end,
    coalesce(p_covers_tickets, false), coalesce(p_covers_travel, false),
    coalesce(p_covers_food, false), case when coalesce(p_covers_food, false) then p_food_allowance_amount else null end,
    coalesce(p_covers_fuel, false), coalesce(p_covers_port_expenses, false),
    p_notes, nullif(btrim(p_boat_model), ''), p_boat_length_ft, p_boat_year
  ) returning * into v_row;

  return v_row;
end;
$$;
grant execute on function create_delivery_request(text, text, numeric, text, date, int, boolean, boolean, boolean, numeric, boolean, boolean, text, text, int, int) to authenticated;

-- Δημόσιοι πίνακες: επιστρέφουν και τα στοιχεία σκάφους.
drop function if exists board_requests(crew_role, date, uuid, int);
create or replace function board_requests(
  p_role crew_role default null, p_after_start date default null, p_after_id uuid default null, p_limit int default 20)
returns table (
  id uuid, start_date date, end_date date, region_id uuid, departure_point text, arrival_point text,
  boat_type_id uuid, crew_role crew_role, party_size int, private_cabin boolean, note text,
  boat_model text, boat_length_ft int, boat_year int,
  claims_count int, claimed_by_me boolean, closes_at timestamptz)
language sql stable security definer set search_path = public as $$
  select br.id, br.start_date, br.end_date, br.region_id, br.departure_point, br.arrival_point,
         br.boat_type_id, br.crew_role, br.party_size, br.private_cabin, br.note,
         br.boat_model, br.boat_length_ft, br.boat_year,
         (select count(*)::int from open_request_claims c where c.request_id = br.id and c.status = 'active'),
         coalesce(exists (select 1 from open_request_claims c join skipper_profiles sp on sp.id = c.skipper_id
                           where c.request_id = br.id and c.status = 'active' and sp.user_id = auth.uid()), false),
         br.expires_at
    from booking_requests br
   where br.board_open and br.status = 'open' and br.expires_at > now()
     and (p_role is null or br.crew_role = p_role)
     and (p_after_start is null or (br.start_date, br.id) > (p_after_start, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000')))
   order by br.start_date, br.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function board_requests(crew_role, date, uuid, int) from public;
grant execute on function board_requests(crew_role, date, uuid, int) to anon, authenticated;

drop function if exists delivery_board_requests(crew_role, date, uuid, int);
create or replace function delivery_board_requests(
  p_role crew_role default null, p_after_date date default null, p_after_id uuid default null, p_limit int default 20)
returns table (
  id uuid, crew_role crew_role, origin_point text, destination_point text, distance_miles numeric,
  departure_date date, flexible_days int, offered_price numeric,
  covers_tickets boolean, covers_travel boolean, covers_food boolean, food_allowance_amount numeric,
  covers_fuel boolean, covers_port_expenses boolean, notes text,
  boat_model text, boat_length_ft int, boat_year int,
  claims_count int, claimed_by_me boolean, closes_at timestamptz)
language sql stable security definer set search_path = public as $$
  select rr.id, rr.crew_role, dr.origin_point, dr.destination_point, dr.distance_miles,
         dr.departure_date, dr.flexible_days, rr.offered_price,
         dr.covers_tickets, dr.covers_travel, dr.covers_food, dr.food_allowance_amount,
         dr.covers_fuel, dr.covers_port_expenses, dr.notes,
         dr.boat_model, dr.boat_length_ft, dr.boat_year,
         (select count(*)::int from delivery_open_claims c where c.role_request_id = rr.id and c.status = 'active'),
         coalesce(exists (select 1 from delivery_open_claims c join skipper_profiles sp on sp.id = c.skipper_id
                           where c.role_request_id = rr.id and c.status = 'active' and sp.user_id = auth.uid()), false),
         rr.expires_at
    from delivery_role_requests rr join delivery_requests dr on dr.id = rr.delivery_request_id
   where rr.board_open and rr.status = 'open' and rr.expires_at > now()
     and (p_role is null or rr.crew_role = p_role)
     and (p_after_date is null or (dr.departure_date, rr.id) > (p_after_date, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000')))
   order by dr.departure_date, rr.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function delivery_board_requests(crew_role, date, uuid, int) from public;
grant execute on function delivery_board_requests(crew_role, date, uuid, int) to anon, authenticated;

-- Οι προσκλήσεις μεταφοράς του επαγγελματία: η εγγραφή του αιτήματος φτιαχνόταν
-- με θέσεις στηλών, και σπάει όταν προστίθενται στήλες στον πίνακα. Τώρα
-- αντιστοιχίζεται με ονόματα στηλών (οι σημειώσεις μένουν κρυφές μέχρι την
-- κράτηση, όπως πριν) και περιλαμβάνει τα στοιχεία σκάφους.
create or replace function list_my_delivery_pings()
returns table(
  ping delivery_role_pings,
  role_request delivery_role_requests,
  request delivery_requests
)
language sql stable security definer set search_path = public as $$
  select
    p, rr,
    jsonb_populate_record(null::delivery_requests, to_jsonb(dr) - 'notes') as request
  from delivery_role_pings p
  join delivery_role_requests rr on rr.id = p.delivery_role_request_id
  join delivery_requests dr on dr.id = rr.delivery_request_id
  join skipper_profiles sp on sp.id = p.skipper_id
  where sp.user_id = auth.uid()
  order by p.sent_at desc;
$$;
