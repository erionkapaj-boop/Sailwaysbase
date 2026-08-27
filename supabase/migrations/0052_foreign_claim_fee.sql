-- ============================================================================
-- Ζητήθηκε: προστασία της εγχώριας αγοράς στο τέλος διεκδίκησης — ένας
-- επαγγελματίας με ΕΛΛΗΝΙΚΟ αριθμό τηλεφώνου (+30) που διεκδικεί μια δουλειά
-- πληρώνει το κανονικό (χαμηλό) τέλος· κάποιος με αριθμό ΑΛΛΗΣ χώρας πληρώνει
-- ένα πολύ υψηλότερο τέλος. Η χώρα προέλευσης επαληθεύεται από τον ίδιο τον
-- αριθμό τηλεφώνου (κωδικός χώρας), όχι από κάποιο ξεχωριστό πεδίο — γι' αυτό
-- ζητήθηκε και η δυνατότητα επιλογής κωδικού χώρας στην εγγραφή, ώστε κάποιος
-- με πραγματικά ξένο νούμερο να μην αναγκάζεται σε ελληνικό (+30) απλώς επειδή
-- δεν υπήρχε άλλη επιλογή στη φόρμα.
--
-- Ρητή προτεραιότητα, ίδια λογική με πριν: αν το αίτημα έχει δικό του
-- claim_fee_amount (π.χ. admin offer με συγκεκριμένη τιμή), αυτό κερδίζει
-- πάντα — ο διαχωρισμός εγχώριου/ξένου ισχύει μόνο όταν πέφτει στην
-- προεπιλογή της πλατφόρμας.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

insert into platform_settings (key, value)
values ('skipper_claim_fee_foreign', 200)
on conflict (key) do nothing;

-- Ίδια υπογραφή με πριν — απλό create or replace, χωρίς drop.
create or replace function claim_booking_request(p_request_id uuid, p_skipper_id uuid) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_req booking_requests%rowtype;
  v_ping booking_request_pings%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_booking bookings%rowtype;
  v_claim_fee numeric;
  v_overlap boolean;
  v_is_domestic boolean;
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

  select (u.phone_number like '+30%') into v_is_domestic
    from users u where u.id = v_skipper.user_id;

  v_claim_fee := coalesce(
    v_req.claim_fee_amount,
    case
      when coalesce(v_is_domestic, true) then (select value from platform_settings where key = 'skipper_claim_fee')
      else (select value from platform_settings where key = 'skipper_claim_fee_foreign')
    end
  );
  if v_claim_fee > 0 and v_skipper.wallet_balance < v_claim_fee then
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
    update skipper_profiles set wallet_balance = wallet_balance - v_claim_fee where id = p_skipper_id;
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
