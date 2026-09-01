-- ============================================================================
-- Το "Τι καλύπτεται" ήταν τρία γενικά κουτάκια (μεταφορικά/καύσιμα/φαγητό) —
-- ζητήθηκε ρητά αναλυτική λίστα, ώστε πελάτης και επαγγελματίας να ξέρουν
-- ακριβώς τι συμφωνείται πριν κάνουν τη δική τους συμφωνία εκτός πλατφόρμας:
--
--   1. Εισιτήρια μέχρι την αφετηρία        (νέο: covers_tickets)
--   2. Έξοδα ταξιδιού μέχρι την αφετηρία   (ήδη υπήρχε ως covers_travel)
--   3. Έξοδα διατροφής κατά το ταξίδι      (ήδη covers_food, + ποσό: βλ. #2)
--   4. Καύσιμα                             (ήδη υπήρχε ως covers_fuel)
--   5. Λοιπά έξοδα μεταφοράς — λιμάνια,
--      ανεφοδιασμός, νερό κλπ              (νέο: covers_port_expenses)
--
-- Το φαγητό ζητήθηκε ρητά με δίπλα κουτάκι ποσού που συμπληρώνει ο πελάτης
-- (π.χ. "30€/μέρα") — δεν είναι πια απλό ναι/όχι.
--
-- Ίδια στήλες προστίθενται και στο delivery_bookings, που αντιγράφει
-- στιγμιότυπο του delivery_requests τη στιγμή της ανάληψης (0067) — αλλιώς
-- η κράτηση θα έδειχνε λιγότερα από όσα συμφωνήθηκαν στο αίτημα.
--
-- create_delivery_request αλλάζει αριθμό παραμέτρων — DROP πρώτα, όχι μόνο
-- CREATE OR REPLACE, αλλιώς μένει και η παλιά υπερφόρτωση και ξαναχτυπάει
-- το ίδιο "function is not unique" πρόβλημα που διορθώθηκε στο 0069.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

alter table delivery_requests add column if not exists covers_tickets boolean not null default false;
alter table delivery_requests add column if not exists covers_port_expenses boolean not null default false;
alter table delivery_requests add column if not exists food_allowance_amount numeric check (food_allowance_amount is null or food_allowance_amount >= 0);

alter table delivery_bookings add column if not exists covers_tickets boolean not null default false;
alter table delivery_bookings add column if not exists covers_port_expenses boolean not null default false;
alter table delivery_bookings add column if not exists food_allowance_amount numeric check (food_allowance_amount is null or food_allowance_amount >= 0);

drop function if exists create_delivery_request(text, text, numeric, text, date, int, boolean, boolean, boolean, text);

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
  p_notes text default null
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

  insert into delivery_requests (
    client_id, origin_point, destination_point, distance_miles,
    date_mode, departure_date, flexible_days,
    covers_tickets, covers_travel, covers_food, food_allowance_amount, covers_fuel, covers_port_expenses,
    notes
  ) values (
    auth.uid(), btrim(p_origin), btrim(p_destination), p_distance_miles,
    p_date_mode, p_departure_date, case when p_date_mode = 'flexible' then coalesce(p_flexible_days, 0) else 0 end,
    coalesce(p_covers_tickets, false), coalesce(p_covers_travel, false),
    coalesce(p_covers_food, false), case when coalesce(p_covers_food, false) then p_food_allowance_amount else null end,
    coalesce(p_covers_fuel, false), coalesce(p_covers_port_expenses, false),
    p_notes
  ) returning * into v_row;

  return v_row;
end;
$$;
grant execute on function create_delivery_request(text, text, numeric, text, date, int, boolean, boolean, boolean, numeric, boolean, boolean, text) to authenticated;

create or replace function accept_delivery_role_request(p_role_request_id uuid, p_skipper_id uuid)
returns delivery_bookings
language plpgsql security definer set search_path = public as $$
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

  select * into v_ping from delivery_role_pings
    where delivery_role_request_id = p_role_request_id and skipper_id = p_skipper_id for update;
  if not found then raise exception 'not_pinged'; end if;
  if v_ping.status <> 'pending' then raise exception 'already_resolved'; end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if v_skipper.deleted_at is not null then raise exception 'skipper_not_eligible'; end if;

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
$$;

-- ----------------------------------------------------------------------------
-- list_my_delivery_pings (0071) builds its "request" column with an explicit,
-- POSITIONAL row constructor cast to delivery_requests — new columns append
-- at the end of the table's column order, so the 3 added above silently
-- break that cast ("Input has too few columns") the moment anyone calls it.
-- Confirmed locally. Redefined here with the 3 new columns appended in the
-- same position; notes stays null (0071 — never shown pre-acceptance).
-- ----------------------------------------------------------------------------
create or replace function list_my_delivery_pings()
returns table(
  ping delivery_role_pings,
  role_request delivery_role_requests,
  request delivery_requests
)
language sql stable security definer set search_path = public as $$
  select
    p, rr,
    (dr.id, dr.client_id, dr.origin_point, dr.destination_point, dr.distance_miles,
     dr.date_mode, dr.departure_date, dr.flexible_days,
     dr.covers_travel, dr.covers_fuel, dr.covers_food,
     null, dr.created_at,
     dr.covers_tickets, dr.covers_port_expenses, dr.food_allowance_amount)::delivery_requests as request
  from delivery_role_pings p
  join delivery_role_requests rr on rr.id = p.delivery_role_request_id
  join delivery_requests dr on dr.id = rr.delivery_request_id
  join skipper_profiles sp on sp.id = p.skipper_id
  where sp.user_id = auth.uid()
  order by p.sent_at desc;
$$;
