-- ============================================================================
-- Ζητήθηκε: κάθε ναύλο (booking request) να έχει υποχρεωτικά ΚΑΙ αφετηρία ΚΑΙ
-- τερματισμό. Τα περισσότερα ναύλα ξεκινούν και τελειώνουν στο ίδιο σημείο,
-- αλλά αρκετά όχι — μέχρι τώρα υπήρχε μόνο το departure_point. Νέα στήλη
-- arrival_point, ίδιου τύπου και ίδιας λογικής με το departure_point (βλ.
-- 0049) — ελεύθερο κείμενο, μόνο στο μονοπάτι του πελάτη. Το μονοπάτι του
-- admin (port_id, OfferComposer) ΔΕΝ αλλάζει — δεν έχει έννοια τερματισμού,
-- είναι δικές του χειροκίνητες αναθέσεις σε συγκεκριμένο λιμάνι.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

-- ---- 1. Νέα στήλη σε booking_requests/bookings. ----
alter table booking_requests add column if not exists arrival_point text;
alter table bookings add column if not exists arrival_point text;

-- ---- 2. Backfill: κάθε υπάρχον ναύλο με δηλωμένη αφετηρία θεωρείται ότι
-- τελειώνει στο ίδιο σημείο εφόσον δεν ξέρουμε αλλιώς — αυτός είναι όντως ο
-- συνηθέστερος τύπος ναύλου, ασφαλέστερο από το να μείνει null σε πεδίο που
-- γίνεται υποχρεωτικό στο βήμα 3. ----
update booking_requests set arrival_point = departure_point
where departure_point is not null and arrival_point is null;

update bookings set arrival_point = departure_point
where departure_point is not null and arrival_point is null;

-- ---- 3. Ίδιο constraint με το 0049, τώρα απαιτεί και τα δύο σημεία στο
-- ελεύθερο-κείμενο μονοπάτι του πελάτη. ----
alter table booking_requests drop constraint if exists booking_requests_departure_check;
alter table booking_requests add constraint booking_requests_departure_check
  check (port_id is not null or (region_id is not null and departure_point is not null and arrival_point is not null));

alter table bookings drop constraint if exists bookings_departure_check;
alter table bookings add constraint bookings_departure_check
  check (port_id is not null or (region_id is not null and departure_point is not null and arrival_point is not null));

-- ---- 4. claim_booking_request: αντιγράφει τώρα και arrival_point στην
-- κράτηση — ίδια λογική με departure_point. Ίδια υπογραφή με την τελευταία
-- redefinition (0067) — σώμα verbatim εκτός από τις δύο προσθήκες του
-- arrival_point στη λίστα στηλών/τιμών του insert. ----
create or replace function claim_booking_request(p_request_id uuid, p_skipper_id uuid) returns bookings
language plpgsql security definer set search_path = public as $$
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
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;
  if v_req.fee_paid_at is null then raise exception 'fee_not_paid'; end if;
  if v_req.expires_at <= now() then raise exception 'request_expired'; end if;

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
$$;
