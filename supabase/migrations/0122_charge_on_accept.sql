-- ============================================================================
-- Χρέωση του πελάτη με την αποδοχή, και αιτήματα σε εξέλιξη (0122).
--
-- Απόφαση ιδιοκτήτη 13/10/2026 (docs/PENDING.md, απόφαση 1, docs/CREDITS.md):
-- - Το credit του πελάτη δεν χρεώνεται με την αποστολή. Δεσμεύεται, και
--   χρεώνεται όταν ένας επαγγελματίας αποδεχτεί (claim_booking_request).
-- - Δέσμευση = άθροισμα των τελών στα ανοιχτά αιτήματα που δεν έχουν χρεωθεί.
--   Νέο αίτημα στέλνεται μόνο αν δεσμευμένα + νέο ≤ υπόλοιπο. Δεν γράφεται
--   καμία κίνηση· αν το αίτημα λήξει ή ακυρωθεί, η δέσμευση απλώς φεύγει.
-- - Κάθε άλλη χρέωση του ίδιου ανθρώπου (μεταφορά, ανάληψη ως επαγγελματίας,
--   διόρθωση) δεν αγγίζει τα δεσμευμένα.
-- - Αιτήματα που στάλθηκαν πριν από αυτό είχαν ήδη χρεωθεί: σημειώνονται
--   (client_charged_at) και κρατούν την επιστροφή τους.
--
-- Αιτήματα σε εξέλιξη: οι επιλογές ενός αιτήματος που δεν ολοκληρώθηκε
-- (π.χ. περιμένει την πίστωση credits) μένουν στον λογαριασμό, ώστε να
-- συνεχίζεται από οποιαδήποτε συσκευή. Ένα ανά χρήστη.
-- ============================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'booking_requests'
                    and column_name = 'client_charged_at') then
    alter table booking_requests add column client_charged_at timestamptz;
    -- Ό,τι στάλθηκε μέχρι τώρα χρεώθηκε στην αποστολή.
    update booking_requests set client_charged_at = fee_paid_at where fee_paid_at is not null;
  end if;
end;
$$;

create index if not exists booking_requests_client_open
  on booking_requests (client_id) where status = 'open';

-- Πόσα credits του χρήστη είναι δεσμευμένα σε ανοιχτά αιτήματα που δεν έχουν
-- χρεωθεί. Όσα έληξαν ή αφορούν ταξίδι που ξεκίνησε δεν γίνονται πια δεκτά,
-- άρα δεν δεσμεύουν τίποτα, ακόμα κι αν δεν έχουν κλείσει ακόμα.
create or replace function user_reserved_credits(p_user_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(fee_amount), 0) from booking_requests
   where client_id = p_user_id and origin = 'client' and status = 'open'
     and fee_paid_at is not null and client_charged_at is null
     and expires_at > now() and start_date >= current_date;
$$;
revoke execute on function user_reserved_credits(uuid) from public, anon, authenticated;

create or replace function my_reserved_credits()
returns numeric language sql stable security definer set search_path = public as $$
  select user_reserved_credits(auth.uid());
$$;
revoke execute on function my_reserved_credits() from public, anon;
grant execute on function my_reserved_credits() to authenticated;

-- ---------------------------------------------------------------------------
-- Αίτημα σε εξέλιξη
-- ---------------------------------------------------------------------------
create table if not exists request_drafts (
  user_id uuid primary key references users(id) on delete cascade,
  payload jsonb not null,
  start_date date,
  updated_at timestamptz not null default now()
);
alter table request_drafts enable row level security;
revoke all on request_drafts from anon, authenticated;
grant select on request_drafts to authenticated;
drop policy if exists "request drafts own" on request_drafts;
create policy "request drafts own" on request_drafts for select using (user_id = auth.uid());

create or replace function save_request_draft(p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_start date;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid_draft'; end if;
  if pg_column_size(p_payload) > 20000 then raise exception 'invalid_draft'; end if;
  begin
    v_start := (p_payload #>> '{filters,startDate}')::date;
  exception when others then
    v_start := null;
  end;
  if v_start is not null and v_start < current_date then
    delete from request_drafts where user_id = v_uid;
    return;
  end if;
  insert into request_drafts (user_id, payload, start_date, updated_at)
    values (v_uid, p_payload, v_start, now())
  on conflict (user_id) do update
    set payload = excluded.payload, start_date = excluded.start_date, updated_at = now();
end;
$$;
revoke execute on function save_request_draft(jsonb) from public, anon;
grant execute on function save_request_draft(jsonb) to authenticated;

create or replace function clear_request_draft()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from request_drafts where user_id = auth.uid();
end;
$$;
revoke execute on function clear_request_draft() from public, anon;
grant execute on function clear_request_draft() to authenticated;

-- ---------------------------------------------------------------------------
-- Συναρτήσεις που αλλάζουν (τελευταίες εκδόσεις, με τις αλλαγές του 0122)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pay_and_broadcast(p_request_id uuid, p_skipper_ids uuid[])
 RETURNS booking_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_req booking_requests%rowtype; v_uid uuid := auth.uid(); v_wallet numeric; v_ids uuid[];
begin
  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.client_id <> v_uid then raise exception 'not_owner'; end if;
  if v_req.status <> 'open' or v_req.fee_paid_at is not null then raise exception 'already_paid_or_closed'; end if;
  if v_req.origin = 'client' and (select count(*) from booking_requests
        where client_id = v_uid and origin = 'client' and fee_paid_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_requests';
  end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_skippers_selected'; end if;
  -- Ένα τέλος αιτήματος καλύπτει έως 30 επαγγελματίες (0106).
  if (select count(distinct s) from unnest(p_skipper_ids) s) > 30 then
    raise exception 'too_many_professionals';
  end if;
  -- Όσοι έπαψαν στο μεταξύ να είναι διαθέσιμοι (το αίτημα μπορεί να περίμενε
  -- την πίστωση credits) απλώς δεν το λαμβάνουν· το αίτημα φεύγει στους
  -- υπόλοιπους (0122). Μόνο αν δεν μείνει κανείς, δεν στέλνεται.
  select coalesce(array_agg(distinct s), '{}') into v_ids
    from unnest(p_skipper_ids) s
    join skipper_profiles sp on sp.id = s and sp.deleted_at is null
    left join skipper_secondary_roles ssr
      on ssr.skipper_id = s and ssr.role = v_req.crew_role and ssr.deleted_at is null
   where ((v_req.crew_role = sp.role and sp.approval_status = 'approved')
       or (v_req.crew_role <> sp.role and ssr.approval_status = 'approved'))
     and (v_req.origin <> 'client' or (
           coalesce(net_availability(s, null, v_req.region_id, v_req.crew_role)
                    @> daterange(v_req.start_date, v_req.end_date, '[]'), false)
       and not exists (select 1 from bookings b
                        where b.skipper_id = s and b.status in ('confirmed', 'completed')
                          and daterange(b.start_date, b.end_date, '[]') && daterange(v_req.start_date, v_req.end_date, '[]'))));
  if array_length(v_ids, 1) is null then
    raise exception 'skipper_not_available';
  end if;

  -- Το credit δεν χρεώνεται εδώ: δεσμεύεται και χρεώνεται όταν κάποιος
  -- επαγγελματίας αποδεχτεί (0122). Ανοιχτά αιτήματα + αυτό ≤ υπόλοιπο.
  select wallet_balance into v_wallet from users where id = v_uid for update;
  if v_wallet - user_reserved_credits(v_uid) < v_req.fee_amount then
    raise exception 'insufficient_wallet';
  end if;

  perform set_config('platform.trusted', 'true', true);
  update booking_requests set fee_paid_at = now() where id = p_request_id returning * into v_req;
  insert into booking_request_pings (booking_request_id, skipper_id)
    select p_request_id, s from unnest(v_ids) as s
    on conflict do nothing;
  return v_req;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_booking_request(p_request_id uuid, p_skipper_id uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req booking_requests%rowtype;
  v_ping booking_request_pings%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_secondary skipper_secondary_roles%rowtype;
  v_booking bookings%rowtype;
  v_claim_fee numeric;
  v_overlap boolean;
  v_wallet numeric;
  v_client_wallet numeric;
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_skipper_id::text));

  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.origin = 'admin_replacement' then raise exception 'use_replacement_flow'; end if;
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;
  if v_req.fee_paid_at is null then raise exception 'fee_not_paid'; end if;
  if v_req.expires_at <= now() then raise exception 'request_expired'; end if;
  -- Το ταξίδι έχει ήδη ξεκινήσει: δεν δέχεται πια κανείς (0106).
  if v_req.start_date < current_date then raise exception 'request_expired'; end if;

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
  if v_claim_fee > 0 and v_wallet - user_reserved_credits(v_skipper.user_id) < v_claim_fee then
    raise exception 'insufficient_wallet';
  end if;

  -- Ο πελάτης χρεώνεται τώρα, με την αποδοχή (0122). Το credit ήταν
  -- δεσμευμένο από την αποστολή· αν δεν υπάρχει πια, το αίτημα δεν γίνεται δεκτό.
  if v_req.client_charged_at is null and v_req.fee_amount > 0 then
    select wallet_balance into v_client_wallet from users where id = v_req.client_id for update;
    if v_client_wallet < v_req.fee_amount then
      raise exception 'client_cannot_pay';
    end if;
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

  if v_req.client_charged_at is null then
    perform set_config('platform.trusted', 'true', true);
    if v_req.fee_amount > 0 then
      update users set wallet_balance = wallet_balance - v_req.fee_amount where id = v_req.client_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_request_id, related_booking_id)
        values (v_req.client_id, 'request_fee', -v_req.fee_amount, p_request_id, v_booking.id);
    end if;
    update booking_requests set client_charged_at = now() where id = p_request_id;
  end if;

  update booking_request_pings set status = 'claimed' where id = v_ping.id;
  update booking_request_pings set status = 'missed'
    where booking_request_id = p_request_id and id <> v_ping.id and status = 'pending';
  update booking_requests set status = 'matched' where id = p_request_id;

  return v_booking;
end;
$function$;

CREATE OR REPLACE FUNCTION public.expire_stale_booking_requests()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_count int := 0; v_place text;
begin
  perform set_config('platform.trusted', 'true', true);
  for r in
    select * from booking_requests
    where status = 'open' and (expires_at < now() or client_decide_by < now())
    for update
  loop
    if r.origin = 'admin_replacement' then
      if replacement_offer_lapsed(r.id) then
        perform close_replacement_offer(r.id,
          case when r.client_decide_by is not null and r.client_decide_by < now() then 'client_timeout' else 'no_response' end);
        v_count := v_count + 1;
      end if;
      continue;
    end if;

    if r.expires_at >= now() then continue; end if;

    if r.fee_paid_at is null then
      update booking_requests set status = 'cancelled' where id = r.id;
      delete from booking_request_pings where booking_request_id = r.id and status = 'pending';
      continue;
    end if;

    update booking_requests set status = 'expired_unclaimed' where id = r.id;
    -- Επιστροφή μόνο για αιτήματα που είχαν χρεωθεί στην αποστολή (πριν το
    -- 0122)· τα νεότερα δεν χρεώθηκαν ποτέ, το credit απλώς ελευθερώνεται.
    if r.fee_amount > 0 and r.client_charged_at is not null then
      update users set wallet_balance = wallet_balance + r.fee_amount where id = r.client_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
        values (r.client_id, 'refund_credit', r.fee_amount, r.id);
    end if;

    if r.origin = 'client' then
      select coalesce(nullif(btrim(r.departure_point), ''), p.name) into v_place
        from (select 1) x left join ports p on p.id = r.port_id;
      perform notify_user(
        r.client_id, 'request_expired',
        jsonb_build_object('port', v_place, 'start', r.start_date, 'end', r.end_date,
                           'role', r.crew_role,
                           'refund', case when r.client_charged_at is not null then r.fee_amount else 0 end,
                           'released', case when r.client_charged_at is null then r.fee_amount else 0 end),
        '/platform/requests'
      );
    end if;
    v_count := v_count + 1;
  end loop;

  for r in
    select b.id from bookings b
    where b.status = 'cancelled_by_skipper' and b.replacement_closed_at is null
      and b.start_date <= current_date
      and not exists (select 1 from bookings x where x.replaces_booking_id = b.id)
  loop
    perform close_replacement_case(r.id, 'Έφτασε η ημερομηνία του ταξιδιού χωρίς αντικαταστάτη', null);
    v_count := v_count + 1;
  end loop;

  -- Αιτήματα σε εξέλιξη για ταξίδια που ξεκίνησαν ήδη (0122).
  delete from request_drafts where start_date < current_date;

  v_count := v_count + expire_stale_delivery_role_requests();
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_booking_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid; v_status booking_request_status; v_fee_paid_at timestamptz; v_fee_amount numeric; v_origin text; v_charged timestamptz;
begin
  select client_id, status, fee_paid_at, fee_amount, origin, client_charged_at
    into v_client_id, v_status, v_fee_paid_at, v_fee_amount, v_origin, v_charged
    from booking_requests where id = p_request_id for update;
  if v_client_id is null then raise exception 'request_not_found'; end if;
  if v_client_id <> auth.uid() then raise exception 'not_owner'; end if;
  if v_origin <> 'client' then raise exception 'not_client_request'; end if;
  if v_status <> 'open' then raise exception 'request_not_open'; end if;
  update booking_requests set status = 'cancelled' where id = p_request_id;
  delete from booking_request_pings where booking_request_id = p_request_id and status = 'pending';
  -- Επιστροφή μόνο αν είχε χρεωθεί (αιτήματα πριν το 0122).
  if v_charged is not null and v_fee_amount > 0 then
    perform set_config('platform.trusted', 'true', true);
    update users set wallet_balance = wallet_balance + v_fee_amount where id = v_client_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
      values (v_client_id, 'refund_credit', v_fee_amount, p_request_id);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_account(p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row users%rowtype;
  v_skipper_id uuid;
  v_req record;
  v_rr record;
  v_cancelled int := 0;
  v_refunded numeric := 0;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;

  select * into v_row from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status = 'deleted' then raise exception 'already_deleted'; end if;
  if v_row.role = 'admin' then raise exception 'cannot_delete_admin'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_delete_self'; end if;
  if not can_manage_account(p_user_id) then raise exception 'cannot_edit_admin'; end if;

  perform set_config('platform.trusted', 'true', true);

  -- Ανοιχτά αιτήματα πληρώματος του χρήστη → ακύρωση + επιστροφή τέλους.
  for v_req in
    select id, fee_paid_at, fee_amount, client_charged_at from booking_requests
    where client_id = p_user_id and status = 'open' for update
  loop
    update booking_requests set status = 'cancelled' where id = v_req.id;
    delete from booking_request_pings where booking_request_id = v_req.id and status = 'pending';
    if v_req.client_charged_at is not null and v_req.fee_amount > 0 then
      update users set wallet_balance = wallet_balance + v_req.fee_amount where id = p_user_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
        values (p_user_id, 'refund_credit', v_req.fee_amount, v_req.id);
      v_refunded := v_refunded + v_req.fee_amount;
    end if;
    v_cancelled := v_cancelled + 1;
  end loop;

  -- Ανοιχτές θέσεις σε αιτήματα μεταφοράς του χρήστη → ακύρωση + επιστροφή.
  for v_rr in
    select rr.id, rr.fee_paid_at, rr.client_fee
    from delivery_role_requests rr join delivery_requests dr on dr.id = rr.delivery_request_id
    where dr.client_id = p_user_id and rr.status = 'open' for update of rr
  loop
    update delivery_role_requests set status = 'cancelled' where id = v_rr.id;
    delete from delivery_role_pings where delivery_role_request_id = v_rr.id and status = 'pending';
    if v_rr.fee_paid_at is not null and v_rr.client_fee > 0 then
      update users set wallet_balance = wallet_balance + v_rr.client_fee where id = p_user_id;
      insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id)
        values (p_user_id, 'refund_credit', v_rr.client_fee, v_rr.id);
      v_refunded := v_refunded + v_rr.client_fee;
    end if;
    v_cancelled := v_cancelled + 1;
  end loop;

  delete from request_drafts where user_id = p_user_id;

  -- Επαγγελματίας: κρύβεται από αναζητήσεις, και φεύγει από όσα αιτήματα
  -- δεν έχει απαντήσει ακόμα.
  select id into v_skipper_id from skipper_profiles where user_id = p_user_id;
  if v_skipper_id is not null then
    perform release_professional_bookings(p_user_id, 'Ο λογαριασμός του επαγγελματία διαγράφηκε');
    delete from booking_request_pings where skipper_id = v_skipper_id and status = 'pending';
    delete from delivery_role_pings where skipper_id = v_skipper_id and status = 'pending';
    update skipper_profiles set deleted_at = now() where id = v_skipper_id and deleted_at is null;
    update skipper_secondary_roles set deleted_at = now() where skipper_id = v_skipper_id and deleted_at is null;
  end if;

  -- Τα δικαιώματα διαχειριστή δεν επιστρέφουν αυτόματα με μια επαναφορά.
  update users
    set status = 'deleted',
        deletion_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        is_staff_admin = false
    where id = p_user_id;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'ban_account', p_user_id,
      'Διαγραφή από admin' || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '') || '.');

  return jsonb_build_object('cancelled_requests', v_cancelled, 'refunded', v_refunded);
end;
$function$;

CREATE OR REPLACE FUNCTION public.close_replacement_case(p_booking_id uuid, p_reason text, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_b bookings%rowtype; v_root bookings%rowtype; v_fee numeric; v_already boolean; v_req record;
begin
  select * into v_b from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_b.status <> 'cancelled_by_skipper' then raise exception 'not_awaiting_cover'; end if;
  if v_b.replacement_closed_at is not null then raise exception 'case_closed'; end if;
  if exists (select 1 from bookings r where r.replaces_booking_id = v_b.id) then raise exception 'not_latest_in_trip'; end if;

  for v_req in
    select br.id from booking_requests br join bookings x on x.id = br.replaces_booking_id
    where x.trip_root_id = v_b.trip_root_id and br.origin = 'admin_replacement' and br.status = 'open'
  loop
    perform close_replacement_offer(v_req.id, 'case_closed');
  end loop;

  perform set_config('platform.trusted', 'true', true);
  update bookings set replacement_closed_at = now(), replacement_closed_reason = nullif(btrim(coalesce(p_reason, '')), ''),
                      replacement_closed_by = p_actor
    where id = v_b.id;

  select * into v_root from bookings where id = v_b.trip_root_id;
  select fee_amount into v_fee from booking_requests
   where id = v_root.booking_request_id and origin = 'client' and client_charged_at is not null;
  select exists (
    select 1 from wallet_transactions w
    where w.user_id = v_b.client_id and w.type = 'refund_credit'
      and (w.related_booking_id in (select id from bookings where trip_root_id = v_b.trip_root_id)
           or w.related_booking_request_id = v_root.booking_request_id)
  ) into v_already;

  if coalesce(v_fee, 0) > 0 and not v_already then
    update users set wallet_balance = wallet_balance + v_fee where id = v_b.client_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_id, related_booking_request_id)
      values (v_b.client_id, 'refund_credit', v_fee, v_b.id, v_root.booking_request_id);
  else
    v_fee := 0;
  end if;

  perform notify_user(
    v_b.client_id, 'replacement_unfilled',
    jsonb_build_object('port', booking_place(v_b.departure_point, v_b.port_id, v_b.region_id),
                       'start', v_b.start_date, 'end', v_b.end_date, 'role', v_b.crew_role, 'refund', v_fee),
    '/platform/bookings?focus=' || v_b.id
  );

  if p_actor is not null then
    insert into admin_actions (admin_id, action_type, target_booking_id, notes)
    values (p_actor, 'edit_booking', v_b.id,
            'Κλείσιμο υπόθεσης αντικατάστασης χωρίς αντικαταστάτη' || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '')
            || case when v_fee > 0 then ' · επιστροφή ' || v_fee || '€ στον πελάτη' else '' end);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_delivery_role_request(p_delivery_request_id uuid, p_crew_role crew_role, p_offered_price numeric, p_skipper_ids uuid[])
 RETURNS delivery_role_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dr delivery_requests%rowtype;
  v_rate numeric;
  v_pct numeric;
  v_min_fee numeric;
  v_credit_price numeric;
  v_expiry_hours numeric;
  v_commission_base numeric;
  v_platform_commission numeric;
  v_client_fee numeric;
  v_wallet numeric;
  v_range daterange;
  v_row delivery_role_requests%rowtype;
begin
  select * into v_dr from delivery_requests where id = p_delivery_request_id;
  if not found then raise exception 'delivery_request_not_found'; end if;
  if v_dr.client_id <> auth.uid() then raise exception 'not_owner'; end if;

  if p_offered_price is null or p_offered_price < 0 then raise exception 'invalid_price'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_candidates_selected'; end if;
  if (select count(distinct s) from unnest(p_skipper_ids) s) > 30 then raise exception 'too_many_professionals'; end if;
  if (select count(*) from delivery_role_requests rr join delivery_requests d on d.id = rr.delivery_request_id
        where d.client_id = auth.uid() and rr.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_requests';
  end if;

  v_range := daterange(v_dr.departure_date - v_dr.flexible_days, v_dr.departure_date + v_dr.flexible_days, '[]');

  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_public sp on sp.id = s and sp.role = p_crew_role
    where sp.id is null or not (delivery_net_availability(s, p_crew_role) @> v_range)
  ) then
    raise exception 'invalid_candidate_selection';
  end if;

  v_rate := (select value from platform_settings where key = 'delivery_' || p_crew_role::text || '_rate_per_mile');
  -- greatest()/least() σιωπηλά αγνοούν NULL ορίσματα· χωρίς αυτόν τον έλεγχο
  -- ένα λείπον ρυθμό (typo, μη εφαρμοσμένη migration) θα γινόταν silent
  -- undercharge (client_fee = min_fee) αντί για σφάλμα.
  if v_rate is null then raise exception 'delivery_rate_not_configured'; end if;
  v_pct := (select value from platform_settings where key = 'delivery_platform_fee_pct');
  v_min_fee := (select value from platform_settings where key = 'delivery_min_fee');
  v_expiry_hours := (select value from platform_settings where key = 'delivery_expiry_hours');

  v_commission_base := v_dr.distance_miles * v_rate;
  v_platform_commission := v_commission_base * (v_pct / 100.0);
  v_client_fee := greatest(v_min_fee, v_platform_commission - v_min_fee);
  -- Σε credits (0110): το ποσό σε € διά την τιμή του credit, προς τα πάνω.
  -- Το ίδιο και για τον επαγγελματία (professional_fee = ελάχιστο τέλος).
  v_credit_price := greatest(coalesce((select value from platform_settings where key = 'credit_price_eur'), 50), 1);
  v_client_fee := ceil(v_client_fee / v_credit_price);
  v_min_fee := ceil(v_min_fee / v_credit_price);

  select wallet_balance into v_wallet from users where id = auth.uid() for update;
  if v_wallet - user_reserved_credits(auth.uid()) < v_client_fee then raise exception 'insufficient_wallet'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance - v_client_fee where id = auth.uid();

  insert into delivery_role_requests (
    delivery_request_id, crew_role, offered_price,
    commission_base, platform_commission, client_fee, professional_fee,
    fee_paid_at, expires_at
  ) values (
    p_delivery_request_id, p_crew_role, p_offered_price,
    v_commission_base, v_platform_commission, v_client_fee, v_min_fee,
    now(), now() + (v_expiry_hours || ' hours')::interval
  ) returning * into v_row;

  insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id)
    values (auth.uid(), 'request_fee', -v_client_fee, v_row.id);

  insert into delivery_role_pings (delivery_role_request_id, skipper_id)
    select v_row.id, s from unnest(p_skipper_ids) as s
    on conflict do nothing;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_delivery_role_request(p_role_request_id uuid, p_skipper_id uuid)
 RETURNS delivery_bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Η αναχώρηση (και όλο το περιθώριο ευελιξίας) έχει περάσει (0106).
  if v_dr.departure_date + v_dr.flexible_days < current_date then raise exception 'expired'; end if;

  select * into v_ping from delivery_role_pings
    where delivery_role_request_id = p_role_request_id and skipper_id = p_skipper_id for update;
  if not found then raise exception 'not_pinged'; end if;
  if v_ping.status <> 'pending' then raise exception 'already_resolved'; end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if v_skipper.deleted_at is not null then raise exception 'skipper_not_eligible'; end if;
  -- Ξανά έλεγχος έγκρισης τη στιγμή της αποδοχής, όπως στο claim_booking_request (0106).
  if v_rr.crew_role = v_skipper.role then
    if v_skipper.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  elsif not exists (
    select 1 from skipper_secondary_roles
     where skipper_id = p_skipper_id and role = v_rr.crew_role and deleted_at is null and approval_status = 'approved'
  ) then
    raise exception 'skipper_not_eligible';
  end if;

  select wallet_balance into v_wallet from users where id = v_skipper.user_id for update;
  if v_wallet - user_reserved_credits(v_skipper.user_id) < v_rr.professional_fee then raise exception 'insufficient_wallet'; end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.client_select_replacement_candidate(p_request_id uuid, p_skipper_id uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req booking_requests%rowtype;
  v_ping booking_request_pings%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_booking bookings%rowtype;
  v_claim_fee numeric;
  v_wallet numeric;
  v_overlap boolean;
  v_loser record;
  v_trip uuid;
begin
  select * into v_req from booking_requests where id = p_request_id;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.client_id <> auth.uid() then raise exception 'not_owner'; end if;
  if v_req.origin <> 'admin_replacement' then raise exception 'not_a_replacement_offer'; end if;

  select trip_root_id into v_trip from bookings where id = v_req.replaces_booking_id;
  perform pg_advisory_xact_lock(hashtext('trip:' || v_trip::text));

  select * into v_req from booking_requests where id = p_request_id for update;
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;
  if replacement_offer_lapsed(p_request_id) then raise exception 'decision_window_closed'; end if;

  if exists (select 1 from bookings r where r.trip_root_id = v_trip and r.status in ('confirmed', 'completed'))
     or exists (select 1 from bookings r where r.replaces_booking_id = v_req.replaces_booking_id) then
    raise exception 'already_covered';
  end if;
  if exists (select 1 from bookings where id = v_req.replaces_booking_id and replacement_closed_at is not null) then
    raise exception 'case_closed';
  end if;

  select * into v_ping from booking_request_pings
    where booking_request_id = p_request_id and skipper_id = p_skipper_id for update;
  if not found or v_ping.candidate_at is null or v_ping.status <> 'pending' then
    raise exception 'not_a_candidate';
  end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if v_skipper.approval_status <> 'approved' or v_skipper.deleted_at is not null then
    raise exception 'candidate_no_longer_eligible';
  end if;

  select exists (
    select 1 from bookings b
    where b.skipper_id = p_skipper_id and b.status in ('confirmed', 'completed')
      and daterange(b.start_date, b.end_date, '[]') && daterange(v_req.start_date, v_req.end_date, '[]')
  ) into v_overlap;
  if v_overlap then raise exception 'candidate_no_longer_available'; end if;

  select exists (
    select 1 from delivery_bookings
    where skipper_id = p_skipper_id and status = 'confirmed'
      and estimated_range && daterange(v_req.start_date, v_req.end_date, '[]')
  ) into v_overlap;
  if v_overlap then raise exception 'candidate_no_longer_available'; end if;

  v_claim_fee := coalesce(v_req.claim_fee_amount, (select value from platform_settings where key = 'skipper_claim_fee'));
  select wallet_balance into v_wallet from users where id = v_skipper.user_id for update;
  if v_claim_fee > 0 and v_wallet - user_reserved_credits(v_skipper.user_id) < v_claim_fee then
    raise exception 'candidate_cannot_pay';
  end if;

  perform set_config('platform.trusted', 'true', true);

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
    update users set wallet_balance = wallet_balance - v_claim_fee where id = v_skipper.user_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_request_id, related_booking_id)
      values (v_skipper.user_id, 'claim_fee', -v_claim_fee, p_request_id, v_booking.id);
  end if;

  for v_loser in
    select brp.skipper_id, sp2.user_id
    from booking_request_pings brp join skipper_profiles sp2 on sp2.id = brp.skipper_id
    where brp.booking_request_id = p_request_id and brp.id <> v_ping.id
      and brp.status = 'pending' and brp.candidate_at is not null
  loop
    perform notify_user(
      v_loser.user_id, 'replacement_not_selected',
      jsonb_build_object('port', booking_place(v_req.departure_point, v_req.port_id, v_req.region_id),
                         'start', v_req.start_date, 'end', v_req.end_date),
      '/platform/requests'
    );
  end loop;

  update booking_request_pings set status = 'claimed' where id = v_ping.id;
  update booking_request_pings set status = 'missed'
    where booking_request_id = p_request_id and id <> v_ping.id and status = 'pending';
  update booking_requests set status = 'matched', closed_reason = 'client_selected', closed_at = now()
    where id = p_request_id;

  return v_booking;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(p_user_id uuid, p_amount numeric, p_reason text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_balance numeric;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  if p_amount is null or p_amount = 0 or p_amount <> round(p_amount) then raise exception 'invalid_amount'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  select wallet_balance into v_balance from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_balance + p_amount < 0 then raise exception 'insufficient_wallet'; end if;
  -- Δεν κατεβαίνει κάτω από όσα είναι δεσμευμένα σε ανοιχτά αιτήματα (0122).
  if p_amount < 0 and v_balance + p_amount < user_reserved_credits(p_user_id) then
    raise exception 'credits_reserved';
  end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_amount where id = p_user_id
    returning wallet_balance into v_balance;
  insert into wallet_transactions (user_id, type, amount, note, created_by)
    values (p_user_id, 'adjustment', p_amount, btrim(p_reason), auth.uid());
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'adjust_wallet', p_user_id,
            btrim(p_reason) || ' (' || case when p_amount > 0 then '+' else '' end || p_amount || ' credits)');
  return v_balance;
end;
$function$;

-- Ο πελάτης δεν δηλώνει μόνος του ότι έχει χρεωθεί.
CREATE OR REPLACE FUNCTION public.guard_booking_request_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_owner_admin() or auth.uid() is null then
    return new;
  end if;
  new.client_id := auth.uid();
  new.origin := 'client';
  new.status := 'open';
  new.fee_amount := (select value from platform_settings where key = 'client_request_fee');
  new.fee_paid_at := null;
  new.client_charged_at := null;
  new.claim_fee_amount := null;
  new.created_by := null;
  new.replaces_booking_id := null;
  new.expires_at := now() + (select value from platform_settings where key = 'unclaimed_expiry_hours') * interval '1 hour';
  new.client_decide_by := null;
  new.closed_reason := null;
  new.closed_at := null;
  return new;
end;
$function$;
