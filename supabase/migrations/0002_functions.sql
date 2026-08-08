-- ============================================================================
-- Business-logic functions & triggers for the skipper platform.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tier recompute (skipper_profiles). Exact formula/thresholds are TBD per
-- spec §11 — this is a placeholder that satisfies the stated rules:
-- (a) brand-new skippers with no history default to 'medium' (§6)
-- (b) tier derives from rating_avg + reliability_percentage + completed count
-- ----------------------------------------------------------------------------
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
    update skipper_profiles set tier = v_tier where id = new.id;
  end if;
  return null;
end;
$$;
create trigger trg_recompute_skipper_tier
  after update of rating_avg, rating_count, completed_bookings_count, cancellation_flag_count
  on skipper_profiles
  for each row execute function recompute_skipper_tier();

-- ----------------------------------------------------------------------------
-- Reviews -> rating_avg/rating_count on the reviewee's profile
-- ----------------------------------------------------------------------------
create or replace function apply_review_rating() returns trigger
language plpgsql as $$
declare v_role user_role;
begin
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
create trigger trg_apply_review_rating
  after insert on reviews
  for each row execute function apply_review_rating();

-- ----------------------------------------------------------------------------
-- cancellation_reports -> cancellation_flag_count on the at-fault party
-- ----------------------------------------------------------------------------
create or replace function apply_cancellation_flag() returns trigger
language plpgsql as $$
declare v_booking bookings%rowtype;
begin
  select * into v_booking from bookings where id = new.booking_id;
  if new.at_fault_party = 'skipper' then
    update skipper_profiles set cancellation_flag_count = cancellation_flag_count + 1 where id = v_booking.skipper_id;
  else
    update client_profiles set cancellation_flag_count = cancellation_flag_count + 1 where user_id = v_booking.client_id;
  end if;
  return new;
end;
$$;
create trigger trg_apply_cancellation_flag
  after insert on cancellation_reports
  for each row execute function apply_cancellation_flag();

-- ----------------------------------------------------------------------------
-- bookings -> completed transition bumps completed_bookings_count both sides
-- ----------------------------------------------------------------------------
create or replace function apply_booking_completed() returns trigger
language plpgsql as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update client_profiles set completed_bookings_count = completed_bookings_count + 1 where user_id = new.client_id;
    update skipper_profiles set completed_bookings_count = completed_bookings_count + 1 where id = new.skipper_id;
  end if;
  return new;
end;
$$;
create trigger trg_apply_booking_completed
  after update of status on bookings
  for each row execute function apply_booking_completed();

-- ----------------------------------------------------------------------------
-- Cron-callable maintenance functions (invoked from app/api/platform/cron)
-- ----------------------------------------------------------------------------
create or replace function mark_bookings_completed() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  with updated as (
    update bookings set status = 'completed'
    where status = 'confirmed' and end_date < current_date
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

-- Unclaimed-request expiry: exact TTL is TBD (§11); read from
-- platform_settings.unclaimed_expiry_hours instead of hardcoding. No one is
-- at fault for an unclaimed broadcast, so the paid fee is refunded as wallet
-- credit rather than forfeited (spec leaves the exact policy TBD - §6/§7).
create or replace function expire_stale_booking_requests() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_count int := 0;
begin
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

-- ----------------------------------------------------------------------------
-- Client: create + broadcast a booking request in one paid step.
-- Fee is taken from wallet credit if available; otherwise this MVP marks it
-- paid directly (mock checkout) since no payment-gateway keys/amount are
-- configured yet (§11 — fee amount & provider both TBD). Swap the "else"
-- branch for a real charge call when a gateway is wired up.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Skipper: claim (win) a broadcast request. This is the "race" — first
-- caller to successfully commit wins. Concurrency safety:
--  1. pg_advisory_xact_lock per skipper serializes a skipper's own concurrent
--     claim attempts (so the overlap check below can't race against itself).
--  2. `select ... for update` on the request row means only one concurrent
--     claim on the SAME request proceeds past the status check.
--  3. the EXCLUDE constraint on bookings is the final, unconditional
--     guarantee against overlapping confirmed/completed bookings.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Cancel a confirmed booking. Asymmetric money rule (§7): the canceller
-- forfeits what they already paid (no refund); the other, non-cancelling
-- party keeps what THEY already paid as wallet credit. The canceller is
-- recorded as at-fault, which flags their profile via the trigger above.
-- "Cancel without valid reason" vs. a genuine dispute is TBD (§7/§11) — this
-- self-service path always treats the caller as the at-fault canceller;
-- disputed cases go through the admin override instead.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Admin actions
-- ----------------------------------------------------------------------------
create or replace function admin_credit_wallet(p_user_id uuid, p_amount numeric, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare v_role user_role;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;
  select role into v_role from users where id = p_user_id;
  if v_role = 'skipper' then
    update skipper_profiles set wallet_balance = wallet_balance + p_amount where user_id = p_user_id;
  elsif v_role = 'client' then
    update client_profiles set wallet_balance = wallet_balance + p_amount where user_id = p_user_id;
  else
    raise exception 'invalid_role';
  end if;
  insert into wallet_transactions (user_id, type, amount) values (p_user_id, 'deposit', p_amount);
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'confirm_wallet_topup', p_user_id, p_notes);
end;
$$;

create or replace function admin_reject_skipper(p_user_id uuid, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update skipper_profiles set approval_status = 'rejected' where user_id = p_user_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'reject_skipper', p_user_id, p_notes);
end;
$$;

create or replace function admin_soft_delete_skipper(p_skipper_id uuid, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update skipper_profiles set deleted_at = now() where id = p_skipper_id returning user_id into v_uid;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'ban_account', v_uid, p_notes);
end;
$$;

-- Approve a pending skipper. If a profile with the same license_number
-- already exists (soft-deleted or otherwise) under a different id, merge:
-- the returning skipper's new login is re-linked to their old, permanent
-- history/tier/flags instead of starting fresh (§3).
create or replace function admin_approve_skipper(p_user_id uuid) returns skipper_profiles
language plpgsql security definer set search_path = public as $$
declare v_new skipper_profiles%rowtype; v_existing skipper_profiles%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select * into v_new from skipper_profiles where user_id = p_user_id;
  if not found then raise exception 'profile_not_found'; end if;

  select * into v_existing from skipper_profiles
    where license_number = v_new.license_number and id <> v_new.id
    limit 1;

  if found then
    delete from skipper_languages a using skipper_languages b
      where a.skipper_id = v_new.id and b.skipper_id = v_existing.id and a.language_id = b.language_id;
    update skipper_languages set skipper_id = v_existing.id where skipper_id = v_new.id;

    delete from skipper_boat_types a using skipper_boat_types b
      where a.skipper_id = v_new.id and b.skipper_id = v_existing.id and a.boat_type_id = b.boat_type_id;
    update skipper_boat_types set skipper_id = v_existing.id where skipper_id = v_new.id;

    delete from skipper_coverage_areas a using skipper_coverage_areas b
      where a.skipper_id = v_new.id and b.skipper_id = v_existing.id and a.port_id = b.port_id;
    update skipper_coverage_areas set skipper_id = v_existing.id where skipper_id = v_new.id;

    update skipper_availability set skipper_id = v_existing.id where skipper_id = v_new.id;

    delete from skipper_profiles where id = v_new.id;

    update skipper_profiles set
      user_id = p_user_id,
      full_name = v_new.full_name,
      photo_url = coalesce(v_new.photo_url, photo_url),
      gender = coalesce(v_new.gender, gender),
      bio = case when v_new.bio = '[]'::jsonb then bio else v_new.bio end,
      years_experience = greatest(v_new.years_experience, years_experience),
      price_per_day = v_new.price_per_day,
      license_type = v_new.license_type,
      approval_status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      deleted_at = null
    where id = v_existing.id
    returning * into v_existing;

    insert into admin_actions (admin_id, action_type, target_user_id, notes)
      values (auth.uid(), 'approve_skipper', p_user_id, 'restored history from prior profile ' || v_existing.id);

    return v_existing;
  end if;

  update skipper_profiles set approval_status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = v_new.id
    returning * into v_new;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'approve_skipper', p_user_id, 'new profile');

  return v_new;
end;
$$;
