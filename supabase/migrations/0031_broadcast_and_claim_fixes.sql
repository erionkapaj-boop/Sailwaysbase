-- ============================================================================
-- Δύο διορθώσεις που βρέθηκαν σε προσομοίωση πολλών λογαριασμών ταυτόχρονα:
--
-- 1) pay_and_broadcast χαρακτήριζε το αίτημα "πληρωμένο" (fee_paid_at) ΑΚΟΜΑ
--    κι όταν το υπόλοιπο του πελάτη δεν επαρκούσε για το fee — το βήμα
--    χρέωσης απλά παραλείπονταν σιωπηλά, αλλά το broadcast προχωρούσε
--    κανονικά σαν να είχε πληρωθεί.
--
-- 2) claim_booking_request, στο κλάδο "date_overlap" (ο επαγγελματίας έχει
--    ήδη επιβεβαιωμένη κράτηση σε αυτές τις ημερομηνίες), προσπαθούσε να
--    σημαδέψει το ping του ως 'missed' πριν σηκώσει την εξαίρεση — αλλά όταν
--    μια συνάρτηση σηκώνει εξαίρεση, η Postgres αναιρεί ΟΛΕΣ τις αλλαγές που
--    έγιναν μέσα σε αυτήν την κλήση, άρα το UPDATE ποτέ δεν επιβιώνει. Το
--    ping έμενε 'pending' για πάντα σε αυτό το αίτημα.
-- ============================================================================

create or replace function pay_and_broadcast(p_request_id uuid, p_skipper_ids uuid[]) returns booking_requests
language plpgsql security definer set search_path = public as $$
declare v_req booking_requests%rowtype; v_uid uuid := auth.uid(); v_wallet numeric;
begin
  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.client_id <> v_uid then raise exception 'not_owner'; end if;
  if v_req.status <> 'open' or v_req.fee_paid_at is not null then raise exception 'already_paid_or_closed'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_skippers_selected'; end if;
  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_profiles sp on sp.id = s
    where sp.id is null or sp.approval_status <> 'approved' or sp.deleted_at is not null
  ) then
    raise exception 'invalid_skipper_selection';
  end if;

  select wallet_balance into v_wallet from client_profiles where user_id = v_uid for update;
  -- ΔΙΟΡΘΩΣΗ 1: πριν, όταν το υπόλοιπο δεν έφτανε, η χρέωση απλά
  -- παραλείπονταν και το αίτημα σημαδεύονταν "πληρωμένο" ούτως ή άλλως.
  if v_wallet < v_req.fee_amount then
    raise exception 'insufficient_wallet';
  end if;

  perform set_config('platform.trusted', 'true', true);
  update client_profiles set wallet_balance = wallet_balance - v_req.fee_amount where user_id = v_uid;
  insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
    values (v_uid, 'request_fee', -v_req.fee_amount, p_request_id);

  update booking_requests set fee_paid_at = now() where id = p_request_id returning * into v_req;
  insert into booking_request_pings (booking_request_id, skipper_id)
    select p_request_id, s from unnest(p_skipper_ids) as s
    on conflict do nothing;
  return v_req;
end;
$$;

create or replace function claim_booking_request(p_request_id uuid, p_skipper_id uuid) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_req booking_requests%rowtype;
  v_ping booking_request_pings%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_booking bookings%rowtype;
  v_claim_fee numeric;
  v_overlap boolean;
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
    -- ΔΙΟΡΘΩΣΗ 2: δεν προσπαθούμε πια να σημαδέψουμε το ping εδώ μέσα — μια
    -- raise exception αναιρεί κάθε αλλαγή αυτής της κλήσης, οπότε ποτέ δεν
    -- θα επιβίωνε. Το ping μένει 'pending'· ο client (lib/platform/db.js)
    -- πιάνει το 'date_overlap' και καλεί ξεχωριστά decline_booking_request,
    -- που τρέχει σε δικιά του, ανεξάρτητη συναλλαγή και όντως κάνει commit.
    raise exception 'date_overlap';
  end if;

  v_claim_fee := coalesce(
    v_req.claim_fee_amount,
    (select value from platform_settings where key = 'skipper_claim_fee')
  );
  if v_claim_fee > 0 and v_skipper.wallet_balance < v_claim_fee then
    raise exception 'insufficient_wallet';
  end if;

  insert into bookings (
    booking_request_id, client_id, skipper_id, start_date, end_date, port_id, boat_type_id,
    skipper_claim_fee_amount, skipper_claim_paid_at, confirmed_at, status,
    replaces_booking_id, assigned_by
  ) values (
    p_request_id, v_req.client_id, p_skipper_id, v_req.start_date, v_req.end_date, v_req.port_id, v_req.boat_type_id,
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
