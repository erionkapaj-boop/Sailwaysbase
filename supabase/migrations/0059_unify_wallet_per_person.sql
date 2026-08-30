-- ============================================================================
-- Μέχρι τώρα κάθε λογαριασμός με δύο «καπέλα» (πελάτης + επαγγελματίας, π.χ.
-- ο admin) είχε ΔΥΟ ξεχωριστά υπόλοιπα — client_profiles.wallet_balance και
-- skipper_profiles.wallet_balance — αόρατα το ένα στο άλλο. Ζητήθηκε ένα
-- ενιαίο πορτοφόλι ανά άνθρωπο, όχι ανά ρόλο.
--
-- Το υπόλοιπο μετακομίζει στο users (μία γραμμή ανά πρόσωπο, όχι ανά ρόλο).
-- Το wallet_transactions ήταν ήδη ενιαίο ledger (keyed by user_id, ποτέ by
-- profile id) — καμία αλλαγή εκεί, μόνο το «τρέχον υπόλοιπο» ενοποιείται.
--
-- Backfill: το νέο υπόλοιπο κάθε προσώπου = άθροισμα ό,τι είχε στα δύο παλιά
-- υπόλοιπα (συνήθως μόνο το ένα είναι μη μηδενικό, αφού μέχρι τώρα ένας
-- λογαριασμός με ένα μόνο "ενεργό" καπέλο δεν είχε καν χρησιμοποιήσει ποτέ το
-- άλλο του υπόλοιπο).
-- ============================================================================

alter table users add column if not exists wallet_balance numeric not null default 0;

update users u set wallet_balance =
  coalesce((select wallet_balance from client_profiles where user_id = u.id), 0) +
  coalesce((select wallet_balance from skipper_profiles where user_id = u.id), 0)
where exists (select 1 from client_profiles where user_id = u.id)
   or exists (select 1 from skipper_profiles where user_id = u.id);

-- Το wallet_balance προστίθεται στα ήδη προστατευμένα πεδία του users: καμία
-- αλλαγή δεν περνάει χωρίς platform.trusted/is_admin, ίδιο μοτίβο με
-- role/status/is_staff_admin.
create or replace function guard_users_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.role := old.role;
  new.status := old.status;
  new.is_test_account := old.is_test_account;
  new.is_staff_admin := old.is_staff_admin;
  new.wallet_balance := old.wallet_balance;
  return new;
end;
$$;

-- Οι δύο παλιοί φύλακες σταματούν να αναφέρονται σε μία στήλη που καταργείται
-- παρακάτω — όλα τα υπόλοιπα προστατευόμενα πεδία τους μένουν ακριβώς ίδια.
create or replace function guard_client_profile_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.rating_avg_boat_respect := old.rating_avg_boat_respect;
  new.rating_avg_responsibility := old.rating_avg_responsibility;
  new.rating_avg_cooperation := old.rating_avg_cooperation;
  new.rating_avg_consistency := old.rating_avg_consistency;
  new.rating_avg_conduct := old.rating_avg_conduct;
  new.rating_avg_tidiness := old.rating_avg_tidiness;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  return new;
end;
$$;

create or replace function guard_skipper_profile_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.role := old.role;
  new.approval_status := old.approval_status;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.tier := old.tier;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.rating_avg_safety := old.rating_avg_safety;
  new.rating_avg_seamanship := old.rating_avg_seamanship;
  new.rating_avg_professionalism := old.rating_avg_professionalism;
  new.rating_avg_cleanliness := old.rating_avg_cleanliness;
  new.rating_avg_communication := old.rating_avg_communication;
  new.rating_avg_hospitality := old.rating_avg_hospitality;
  new.rating_avg_cooking := old.rating_avg_cooking;
  new.rating_avg_service := old.rating_avg_service;
  new.rating_avg_taste := old.rating_avg_taste;
  new.rating_avg_variety := old.rating_avg_variety;
  new.rating_avg_presentation := old.rating_avg_presentation;
  new.rating_avg_adaptability := old.rating_avg_adaptability;
  new.rating_avg_organization := old.rating_avg_organization;
  new.rating_avg_maintenance := old.rating_avg_maintenance;
  new.rating_avg_teamwork := old.rating_avg_teamwork;
  new.rating_avg_diligence := old.rating_avg_diligence;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  new.user_id := old.user_id;
  new.deleted_at := old.deleted_at;
  return new;
end;
$$;

alter table client_profiles drop column if exists wallet_balance;
alter table skipper_profiles drop column if exists wallet_balance;

-- ----------------------------------------------------------------------------
-- Κάθε συνάρτηση που χρέωνε/πίστωνε ένα από τα δύο παλιά υπόλοιπα δείχνει
-- τώρα στο users.wallet_balance. Καμία άλλη λογική τους δεν αλλάζει.
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

  select wallet_balance into v_wallet from users where id = v_uid for update;
  if v_wallet < v_req.fee_amount then
    raise exception 'insufficient_wallet';
  end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance - v_req.fee_amount where id = v_uid;
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
  v_is_domestic boolean;
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

  select (u.phone_number like '+30%') into v_is_domestic
    from users u where u.id = v_skipper.user_id;

  v_claim_fee := coalesce(
    v_req.claim_fee_amount,
    case
      when coalesce(v_is_domestic, true) then (select value from platform_settings where key = 'skipper_claim_fee')
      else (select value from platform_settings where key = 'skipper_claim_fee_foreign')
    end
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

create or replace function expire_stale_booking_requests() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_count int := 0;
begin
  perform set_config('platform.trusted', 'true', true);
  for r in
    select * from booking_requests where status = 'open' and expires_at < now() for update
  loop
    update booking_requests set status = 'expired_unclaimed' where id = r.id;
    if r.fee_paid_at is not null and r.fee_amount > 0 then
      update users set wallet_balance = wallet_balance + r.fee_amount where id = r.client_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
        values (r.client_id, 'refund_credit', r.fee_amount, r.id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function cancel_booking(p_booking_id uuid, p_reason text) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_uid uuid := auth.uid();
  v_is_client boolean;
  v_fee_amount numeric;
  v_lead int;
  v_weight numeric;
  v_skipper_user_id uuid;
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

  v_lead := cancellation_lead_days_for(now(), v_booking.start_date);
  v_weight := cancellation_weight_for(now(), v_booking.start_date);

  select fee_amount into v_fee_amount from booking_requests where id = v_booking.booking_request_id;
  select user_id into v_skipper_user_id from skipper_profiles where id = v_booking.skipper_id;
  perform set_config('platform.trusted', 'true', true);

  if v_is_client then
    update bookings set status = 'cancelled_by_client', cancelled_at = now(), cancellation_reason = p_reason,
                        cancellation_lead_days = v_lead, cancellation_weight = v_weight
      where id = p_booking_id;
    update users set wallet_balance = wallet_balance + v_booking.skipper_claim_fee_amount
      where id = v_skipper_user_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_id)
      values (v_skipper_user_id, 'refund_credit', v_booking.skipper_claim_fee_amount, p_booking_id);
    insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
      values (p_booking_id, v_uid, 'client', p_reason);
  else
    update bookings set status = 'cancelled_by_skipper', cancelled_at = now(), cancellation_reason = p_reason,
                        cancellation_lead_days = v_lead, cancellation_weight = v_weight
      where id = p_booking_id;
    update users set wallet_balance = wallet_balance + v_fee_amount where id = v_booking.client_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_id)
      values (v_booking.client_id, 'refund_credit', v_fee_amount, p_booking_id);
    insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
      values (p_booking_id, v_uid, 'skipper', p_reason);
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  return v_booking;
end;
$$;

create or replace function cancel_booking_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid; v_status booking_request_status; v_fee_paid_at timestamptz; v_fee_amount numeric;
begin
  select client_id, status, fee_paid_at, fee_amount into v_client_id, v_status, v_fee_paid_at, v_fee_amount
    from booking_requests where id = p_request_id for update;
  if v_client_id is null then raise exception 'request_not_found'; end if;
  if v_client_id <> auth.uid() then raise exception 'not_owner'; end if;
  if v_status <> 'open' then raise exception 'request_not_open'; end if;
  update booking_requests set status = 'cancelled' where id = p_request_id;
  delete from booking_request_pings where booking_request_id = p_request_id and status = 'pending';
  if v_fee_paid_at is not null and v_fee_amount > 0 then
    perform set_config('platform.trusted', 'true', true);
    update users set wallet_balance = wallet_balance + v_fee_amount where id = v_client_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
      values (v_client_id, 'refund_credit', v_fee_amount, p_request_id);
  end if;
end;
$$;

create or replace function admin_credit_wallet(p_user_id uuid, p_amount numeric, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from users where id = p_user_id) then raise exception 'invalid_role'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_amount where id = p_user_id;
  insert into wallet_transactions (user_id, type, amount) values (p_user_id, 'deposit', p_amount);
end;
$$;

-- Ένα ενιαίο υπόλοιπο ανά πρόσωπο δεν έχει πια νόημα να σπάει σε
-- "wallet_clients"/"wallet_pros" — ένα σύνολο, exactly ίδιο ποσό με πριν
-- (το άθροισμα των δύο παλιών ποσών παραμένει το ίδιο συνολικό χρήμα τρίτων).
create or replace function admin_overview()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_admin() then null else jsonb_build_object(
    'users_total',        (select count(*) from users where role <> 'admin'),
    'users_new_7d',       (select count(*) from users where role <> 'admin' and created_at > now() - interval '7 days'),
    'clients_total',      (select count(*) from users where role = 'client'),
    'pros_total',         (select count(*) from users where role = 'skipper'),
    'pending_approvals',  (select count(*) from skipper_profiles where approval_status = 'pending' and deleted_at is null),
    'open_disputes',      (select count(*) from cancellation_reports where resolved_at is null),
    'coverage_needed',    (select count(*) from admin_coverage_needed() where offer_request_id is null),
    'coverage_offered',   (select count(*) from admin_coverage_needed() where offer_request_id is not null),
    'offers_open',        (select count(*) from booking_requests where origin <> 'client' and status = 'open'),
    'requests_open',      (select count(*) from booking_requests where status = 'open' and origin = 'client'),
    'requests_unclaimed_7d', (select count(*) from booking_requests
                              where status = 'expired_unclaimed' and created_at > now() - interval '7 days'),
    'bookings_confirmed', (select count(*) from bookings where status = 'confirmed'),
    'bookings_upcoming',  (select count(*) from bookings where status = 'confirmed' and start_date >= current_date),
    'bookings_completed', (select count(*) from bookings where status = 'completed'),
    'bookings_cancelled_30d', (select count(*) from bookings
                               where status in ('cancelled_by_client','cancelled_by_skipper')
                                 and created_at > now() - interval '30 days'),
    'wallet_total',       (select coalesce(sum(wallet_balance), 0) from users),
    'fees_30d',           (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee') and created_at > now() - interval '30 days'),
    'fees_all_time',      (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee')),
    'refunds_30d',        (select coalesce(sum(amount), 0) from wallet_transactions
                           where type = 'refund_credit' and created_at > now() - interval '30 days'),
    'profiles_invisible', (select count(*) from skipper_profiles sp
                           where sp.approval_status = 'approved' and sp.deleted_at is null
                             and not skipper_is_search_visible(sp.id))
  ) end;
$$;
