-- ============================================================================
-- Lock down privileged columns that the plain "owner can update own profile"
-- RLS policies would otherwise let a user set directly (approval_status,
-- wallet_balance, tier, rating/flag counters...). RLS's USING/WITH CHECK
-- can't cleanly express "this column must not change", so it's enforced
-- with a BEFORE UPDATE trigger instead. Legitimate system writes (from the
-- RPCs/triggers below) mark the transaction trusted first.
-- ============================================================================

create or replace function guard_skipper_profile_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() then
    return new;
  end if;
  new.approval_status := old.approval_status;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.wallet_balance := old.wallet_balance;
  new.tier := old.tier;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  new.user_id := old.user_id;
  new.deleted_at := old.deleted_at;
  return new;
end;
$$;
create trigger trg_guard_skipper_profile
  before update on skipper_profiles
  for each row execute function guard_skipper_profile_privileged_columns();

create or replace function guard_client_profile_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() then
    return new;
  end if;
  new.wallet_balance := old.wallet_balance;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  return new;
end;
$$;
create trigger trg_guard_client_profile
  before update on client_profiles
  for each row execute function guard_client_profile_privileged_columns();

-- ---- system-computed triggers now mark the transaction trusted first ----

create or replace function recompute_skipper_tier() returns trigger
language plpgsql as $$
declare v_tier skipper_tier;
begin
  if new.completed_bookings_count = 0 and new.rating_count = 0 then
    v_tier := 'medium';
  elsif coalesce(new.reliability_percentage, 100) < 70 or coalesce(new.rating_avg, 5) < 3 then
    v_tier := 'low';
  elsif new.completed_bookings_count >= 10
        and coalesce(new.rating_avg, 0) >= 4.5
        and coalesce(new.reliability_percentage, 0) >= 90 then
    v_tier := 'high';
  else
    v_tier := 'medium';
  end if;

  if v_tier is distinct from new.tier then
    perform set_config('platform.trusted', 'true', true);
    update skipper_profiles set tier = v_tier where id = new.id;
  end if;
  return null;
end;
$$;

create or replace function apply_review_rating() returns trigger
language plpgsql as $$
declare v_role user_role;
begin
  perform set_config('platform.trusted', 'true', true);
  select role into v_role from users where id = new.reviewee_id;
  if v_role = 'skipper' then
    update skipper_profiles
      set rating_avg = round((coalesce(rating_avg, 0) * rating_count + new.rating)::numeric / (rating_count + 1), 2),
          rating_count = rating_count + 1
      where user_id = new.reviewee_id;
  elsif v_role = 'client' then
    update client_profiles
      set rating_avg = round((coalesce(rating_avg, 0) * rating_count + new.rating)::numeric / (rating_count + 1), 2),
          rating_count = rating_count + 1
      where user_id = new.reviewee_id;
  end if;
  return new;
end;
$$;

create or replace function apply_cancellation_flag() returns trigger
language plpgsql as $$
declare v_booking bookings%rowtype;
begin
  perform set_config('platform.trusted', 'true', true);
  select * into v_booking from bookings where id = new.booking_id;
  if new.at_fault_party = 'skipper' then
    update skipper_profiles set cancellation_flag_count = cancellation_flag_count + 1 where id = v_booking.skipper_id;
  else
    update client_profiles set cancellation_flag_count = cancellation_flag_count + 1 where user_id = v_booking.client_id;
  end if;
  return new;
end;
$$;

create or replace function apply_booking_completed() returns trigger
language plpgsql as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform set_config('platform.trusted', 'true', true);
    update client_profiles set completed_bookings_count = completed_bookings_count + 1 where user_id = new.client_id;
    update skipper_profiles set completed_bookings_count = completed_bookings_count + 1 where id = new.skipper_id;
  end if;
  return new;
end;
$$;

-- ---- RPCs that legitimately touch wallet_balance mark the tx trusted too ----

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
  if v_wallet >= v_req.fee_amount then
    perform set_config('platform.trusted', 'true', true);
    update client_profiles set wallet_balance = wallet_balance - v_req.fee_amount where user_id = v_uid;
    insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
      values (v_uid, 'request_fee', -v_req.fee_amount, p_request_id);
  end if;

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

  select * into v_ping from booking_request_pings
    where booking_request_id = p_request_id and skipper_id = p_skipper_id for update;
  if not found then raise exception 'not_pinged'; end if;
  if v_ping.status <> 'pending' then raise exception 'already_resolved'; end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if v_skipper.approval_status <> 'approved' or v_skipper.deleted_at is not null then
    raise exception 'skipper_not_eligible';
  end if;

  select exists (
    select 1 from bookings
    where skipper_id = p_skipper_id
      and status in ('confirmed', 'completed')
      and daterange(start_date, end_date, '[]') && daterange(v_req.start_date, v_req.end_date, '[]')
  ) into v_overlap;
  if v_overlap then
    update booking_request_pings set status = 'missed' where id = v_ping.id;
    raise exception 'date_overlap';
  end if;

  select value into v_claim_fee from platform_settings where key = 'skipper_claim_fee';
  if v_skipper.wallet_balance < v_claim_fee then
    raise exception 'insufficient_wallet';
  end if;

  insert into bookings (
    booking_request_id, client_id, skipper_id, start_date, end_date, port_id, boat_type_id,
    skipper_claim_fee_amount, skipper_claim_paid_at, confirmed_at, status
  ) values (
    p_request_id, v_req.client_id, p_skipper_id, v_req.start_date, v_req.end_date, v_req.port_id, v_req.boat_type_id,
    v_claim_fee, now(), now(), 'confirmed'
  ) returning * into v_booking;

  perform set_config('platform.trusted', 'true', true);
  update skipper_profiles set wallet_balance = wallet_balance - v_claim_fee where id = p_skipper_id;
  insert into wallet_transactions (user_id, type, amount, related_booking_request_id, related_booking_id)
    values (v_skipper.user_id, 'claim_fee', -v_claim_fee, p_request_id, v_booking.id);

  update booking_request_pings set status = 'claimed' where id = v_ping.id;
  update booking_request_pings set status = 'missed'
    where booking_request_id = p_request_id and id <> v_ping.id and status = 'pending';
  update booking_requests set status = 'matched' where id = p_request_id;

  return v_booking;
end;
$$;

create or replace function cancel_booking(p_booking_id uuid, p_reason text) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_uid uuid := auth.uid();
  v_is_client boolean;
  v_fee_amount numeric;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_booking.status <> 'confirmed' then raise exception 'not_cancellable'; end if;

  if v_uid = v_booking.client_id then
    v_is_client := true;
  elsif exists (select 1 from skipper_profiles where id = v_booking.skipper_id and user_id = v_uid) then
    v_is_client := false;
  else
    raise exception 'not_participant';
  end if;

  select fee_amount into v_fee_amount from booking_requests where id = v_booking.booking_request_id;
  perform set_config('platform.trusted', 'true', true);

  if v_is_client then
    update bookings set status = 'cancelled_by_client', cancelled_at = now(), cancellation_reason = p_reason
      where id = p_booking_id;
    update skipper_profiles set wallet_balance = wallet_balance + v_booking.skipper_claim_fee_amount
      where id = v_booking.skipper_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_id)
      select user_id, 'refund_credit', v_booking.skipper_claim_fee_amount, p_booking_id
      from skipper_profiles where id = v_booking.skipper_id;
    insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
      values (p_booking_id, v_uid, 'client', p_reason);
  else
    update bookings set status = 'cancelled_by_skipper', cancelled_at = now(), cancellation_reason = p_reason
      where id = p_booking_id;
    update client_profiles set wallet_balance = wallet_balance + v_fee_amount where user_id = v_booking.client_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_id)
      values (v_booking.client_id, 'refund_credit', v_fee_amount, p_booking_id);
    insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
      values (p_booking_id, v_uid, 'skipper', p_reason);
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  return v_booking;
end;
$$;

-- expire_stale_booking_requests also credits client_profiles.wallet_balance
create or replace function expire_stale_booking_requests() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_count int := 0;
begin
  perform set_config('platform.trusted', 'true', true);
  for r in
    select * from booking_requests where status = 'open' and expires_at < now() for update
  loop
    update booking_requests set status = 'expired_unclaimed' where id = r.id;
    if r.fee_paid_at is not null then
      update client_profiles set wallet_balance = wallet_balance + r.fee_amount where user_id = r.client_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
        values (r.client_id, 'refund_credit', r.fee_amount, r.id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
