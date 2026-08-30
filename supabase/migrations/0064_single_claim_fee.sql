-- ============================================================================
-- Ένα τέλος διεκδίκησης για όλους.
--
-- Μέχρι τώρα (0052) το τέλος διπλασιαζόταν πολλαπλάσια όταν ο αριθμός
-- τηλεφώνου του επαγγελματία δεν ξεκινούσε από +30. Ο σκοπός ήταν η
-- προστασία της εγχώριας αγοράς — και ακριβώς αυτός ο σκοπός είναι που το
-- ενωσιακό δίκαιο δεν δέχεται ως δικαιολόγηση διαφορετικών όρων πρόσβασης
-- (άρθρο 20 Οδηγίας 2006/123, άρθρο 56 ΣΛΕΕ, Καν. 2018/302): ένας καθαρά
-- προστατευτικός/οικονομικός σκοπός δεν συνιστά επιτακτικό λόγο δημοσίου
-- συμφέροντος. Επιπλέον ο κωδικός χώρας τηλεφώνου είναι χονδροειδές
-- κριτήριο — πιάνει και μόνιμο κάτοικο Ελλάδας που κρατάει ξένο νούμερο.
--
-- Η προστασία της αγοράς παραμένει, αλλά μέσα από το κριτήριο που ισχύει
-- ούτως ή άλλως: έγκυρη, αναγνωρισμένη άδεια για την ειδικότητα.
-- ============================================================================

delete from platform_settings where key = 'skipper_claim_fee_foreign';

-- Ίδια υπογραφή, ίδια λογική με το 0059 — αφαιρείται μόνο ο κλάδος που
-- διάλεγε τιμή με βάση τον κωδικό χώρας.
create or replace function claim_booking_request(p_request_id uuid, p_skipper_id uuid) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_req booking_requests%rowtype;
  v_ping booking_request_pings%rowtype;
  v_skipper skipper_profiles%rowtype;
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
  if v_skipper.approval_status <> 'approved' or v_skipper.deleted_at is not null then
    raise exception 'skipper_not_eligible';
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

  -- Ένα τέλος για όλους. Ένα αίτημα μπορεί ακόμη να ορίσει δικό του ποσό
  -- (π.χ. ανάθεση από τη διαχείριση χωρίς χρέωση) — αυτό δεν αφορά τη χώρα
  -- κανενός και παραμένει.
  v_claim_fee := coalesce(
    v_req.claim_fee_amount,
    (select value from platform_settings where key = 'skipper_claim_fee')
  );

  select wallet_balance into v_wallet from users where id = v_skipper.user_id for update;
  if v_claim_fee > 0 and v_wallet < v_claim_fee then
    raise exception 'insufficient_wallet';
  end if;

  insert into bookings (
    booking_request_id, client_id, skipper_id, start_date, end_date, port_id, region_id, departure_point, boat_type_id,
    party_size, private_cabin,
    skipper_claim_fee_amount, skipper_claim_paid_at, confirmed_at, status,
    replaces_booking_id, assigned_by
  ) values (
    p_request_id, v_req.client_id, p_skipper_id, v_req.start_date, v_req.end_date, v_req.port_id, v_req.region_id, v_req.departure_point, v_req.boat_type_id,
    v_req.party_size, v_req.private_cabin,
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
