-- ============================================================================
-- Διορθώσεις στις ροές κρατήσεων/χρημάτων, από πλήρη προσομοίωση όλων των
-- migrations σε τοπική βάση με ψεύτικους λογαριασμούς (πελάτες, skipper,
-- hostess, cook, ναύτης, admin).
--
--   1. Κάλυψη ακύρωσης (πρόταση ή απευθείας ανάθεση) αποτύγχανε ΠΑΝΤΑ για
--      κρατήσεις που έγιναν με περιοχή + σημείο αναχώρησης/άφιξης (όλες μετά
--      το 0049/0079): αντιγραφόταν μόνο το port_id, που εκεί είναι null, και
--      το check constraint απέρριπτε τη νέα γραμμή. Τώρα αντιγράφονται
--      περιοχή, σημεία, άτομα, καμπίνα — και η ιδιότητα της κράτησης, όχι η
--      κύρια ιδιότητα του επαγγελματία που ακύρωσε.
--   2. Ανάθεση από τον admin σε επαγγελματία με εγκεκριμένη ΕΠΙΠΛΕΟΝ ιδιότητα
--      (π.χ. skipper που είναι και cook) απορριπτόταν με role_mismatch.
--   3. Αίτημα που έληξε χωρίς αποδοχή: ο πελάτης έπαιρνε πίσω το τέλος αλλά
--      καμία ειδοποίηση για το τι έγινε. Τώρα ειδοποιείται (request_expired).
--      Αίτημα που δεν πληρώθηκε ποτέ (π.χ. ανεπαρκές υπόλοιπο στην αποστολή)
--      κλείνει ως 'cancelled', όχι ως «χάθηκε», για να μη μετράει στα
--      στατιστικά σαν αίτημα που δεν βρήκε επαγγελματία.
--   4. Μηδενικές κινήσεις (επιστροφή 0€ σε αναθέσεις admin χωρίς τέλος)
--      δεν γράφονται πια στο πορτοφόλι ούτε βγάζουν ειδοποίηση «+0€».
--   5. Μεταφορές σκάφους — έλειπαν εντελώς οι επιστροφές:
--      α. θέση που έληξε χωρίς αποδοχή → 'expired' + επιστροφή τέλους στον
--         πελάτη + ειδοποίηση (τρέχει μαζί με τα αιτήματα πληρώματος, από το
--         ίδιο νυχτερινό cron),
--      β. ο πελάτης μπορεί να αποσύρει ανοιχτή θέση και παίρνει πίσω το τέλος,
--      γ. ακύρωση επιβεβαιωμένης μεταφοράς από οποιαδήποτε πλευρά, με τον
--         ίδιο κανόνα με τις κρατήσεις πληρώματος: ακυρώνει ο πελάτης →
--         επιστρέφεται το τέλος του επαγγελματία· ακυρώνει ο επαγγελματίας →
--         επιστρέφεται το τέλος του πελάτη,
--      δ. οι μεταφορές που πέρασαν σημειώνονται 'completed'.
--   6. Στη λίστα συνομιλιών το σημείο αναχώρησης (όχι μόνο λιμάνι), ώστε οι
--      νέες κρατήσεις να μη φαίνονται χωρίς τόπο.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 + 2. admin_create_offer
-- ----------------------------------------------------------------------------
create or replace function admin_create_offer(
  p_skipper_ids uuid[],
  p_role crew_role default 'skipper',
  p_start date default null,
  p_end date default null,
  p_port_id uuid default null,
  p_boat_type_id uuid default null,
  p_replaces_booking_id uuid default null,
  p_claim_fee numeric default null,
  p_note text default null,
  p_expires_hours int default 24
)
returns booking_requests
language plpgsql security definer set search_path = public as $$
declare
  v_old bookings%rowtype;
  v_req booking_requests%rowtype;
  v_client uuid;
  v_origin text;
  v_start date := p_start;
  v_end date := p_end;
  v_port uuid := p_port_id;
  v_boat uuid := p_boat_type_id;
  v_role crew_role := p_role;
  v_region uuid;
  v_departure text;
  v_arrival text;
  v_party int;
  v_cabin boolean;
  v_expires timestamptz;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then
    raise exception 'no_skippers_selected';
  end if;

  if p_replaces_booking_id is not null then
    select * into v_old from bookings where id = p_replaces_booking_id for update;
    if not found then raise exception 'booking_not_found'; end if;
    if v_old.status <> 'cancelled_by_skipper' then raise exception 'not_awaiting_cover'; end if;
    if exists (
      select 1 from bookings r
      where r.replaces_booking_id = p_replaces_booking_id and r.status in ('confirmed', 'completed')
    ) then
      raise exception 'already_covered';
    end if;
    if exists (
      select 1 from booking_requests br
      where br.replaces_booking_id = p_replaces_booking_id and br.status = 'open'
    ) then
      raise exception 'offer_already_open';
    end if;

    v_client := v_old.client_id;
    v_origin := 'admin_replacement';
    v_start := v_old.start_date;
    v_end := v_old.end_date;
    v_port := v_old.port_id;
    v_boat := v_old.boat_type_id;
    v_region := v_old.region_id;
    v_departure := v_old.departure_point;
    v_arrival := v_old.arrival_point;
    v_party := v_old.party_size;
    v_cabin := v_old.private_cabin;
    -- Η ιδιότητα της κράτησης· η κύρια ιδιότητα του επαγγελματία μόνο για
    -- πολύ παλιές κρατήσεις χωρίς crew_role.
    v_role := coalesce(
      v_old.crew_role,
      (select sp.role from skipper_profiles sp where sp.id = v_old.skipper_id),
      'skipper'::crew_role
    );
  else
    v_client := auth.uid();
    v_origin := 'admin_direct';
    if v_start is null or v_end is null or v_port is null or (v_boat is null and v_role = 'skipper') then
      raise exception 'missing_job_details';
    end if;
    if v_end < v_start then raise exception 'invalid_date_range'; end if;
    insert into client_profiles (user_id) values (v_client) on conflict do nothing;
  end if;

  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_profiles sp on sp.id = s
    where sp.id is null or sp.approval_status <> 'approved' or sp.deleted_at is not null
  ) then
    raise exception 'invalid_skipper_selection';
  end if;

  -- Κύρια ιδιότητα ή εγκεκριμένη επιπλέον ιδιότητα — ίδιος κανόνας με το
  -- claim_booking_request, που είναι και αυτό που θα κρίνει την αποδοχή.
  if exists (
    select 1 from skipper_profiles sp
    where sp.id = any(p_skipper_ids) and sp.role <> v_role
      and not exists (
        select 1 from skipper_secondary_roles ssr
        where ssr.skipper_id = sp.id and ssr.role = v_role
          and ssr.approval_status = 'approved' and ssr.deleted_at is null
      )
  ) then
    raise exception 'role_mismatch';
  end if;

  v_expires := now() + make_interval(hours => greatest(coalesce(p_expires_hours, 24), 1));
  if v_expires > v_start::timestamptz then
    v_expires := greatest(now() + interval '30 minutes', v_start::timestamptz);
  end if;

  insert into booking_requests (
    client_id, start_date, end_date, port_id, boat_type_id,
    region_id, departure_point, arrival_point, party_size, private_cabin,
    fee_amount, fee_paid_at, status, expires_at,
    origin, created_by, replaces_booking_id, claim_fee_amount, note, crew_role
  ) values (
    v_client, v_start, v_end, v_port, v_boat,
    v_region, v_departure, v_arrival, v_party, v_cabin,
    0, now(), 'open', v_expires,
    v_origin, auth.uid(), p_replaces_booking_id, p_claim_fee, nullif(btrim(coalesce(p_note, '')), ''), v_role
  ) returning * into v_req;

  insert into booking_request_pings (booking_request_id, skipper_id)
    select v_req.id, s from unnest(p_skipper_ids) as s
    on conflict do nothing;

  insert into admin_actions (admin_id, action_type, target_booking_id, notes)
  values (
    auth.uid(), 'edit_booking', p_replaces_booking_id,
    case when v_origin = 'admin_replacement' then 'Πρόταση αντικατάστασης' else 'Απευθείας πρόταση εργασίας' end
    || ' σε ' || array_length(p_skipper_ids, 1) || ' άτομα'
  );

  return v_req;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. admin_assign_replacement: ίδια αντιγραφή πεδίων + έλεγχος επικάλυψης
--    και με μεταφορές σκάφους (όπως στο claim).
-- ----------------------------------------------------------------------------
create or replace function admin_assign_replacement(p_booking_id uuid, p_skipper_id uuid)
returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_old bookings%rowtype;
  v_new bookings%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_secondary skipper_secondary_roles%rowtype;
  v_role crew_role;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select * into v_old from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_old.status <> 'cancelled_by_skipper' then raise exception 'not_awaiting_cover'; end if;

  if exists (
    select 1 from bookings r
    where r.replaces_booking_id = p_booking_id and r.status in ('confirmed', 'completed')
  ) then
    raise exception 'already_covered';
  end if;

  v_role := coalesce(
    v_old.crew_role,
    (select sp.role from skipper_profiles sp where sp.id = v_old.skipper_id),
    'skipper'::crew_role
  );

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if not found or v_skipper.deleted_at is not null then
    raise exception 'skipper_not_eligible';
  end if;
  if v_role = v_skipper.role then
    if v_skipper.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  else
    select * into v_secondary from skipper_secondary_roles
      where skipper_id = p_skipper_id and role = v_role and deleted_at is null for update;
    if not found or v_secondary.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  end if;
  if v_skipper.user_id = v_old.client_id then raise exception 'cannot_hire_self'; end if;

  if exists (
    select 1 from bookings b
    where b.skipper_id = p_skipper_id
      and b.status in ('confirmed', 'completed')
      and daterange(b.start_date, b.end_date, '[]') && daterange(v_old.start_date, v_old.end_date, '[]')
  ) or exists (
    select 1 from delivery_bookings d
    where d.skipper_id = p_skipper_id
      and d.status = 'confirmed'
      and d.estimated_range && daterange(v_old.start_date, v_old.end_date, '[]')
  ) then
    raise exception 'skipper_already_booked';
  end if;

  insert into bookings (
    booking_request_id, client_id, skipper_id, start_date, end_date,
    port_id, region_id, departure_point, arrival_point, boat_type_id,
    party_size, private_cabin,
    skipper_claim_fee_amount, confirmed_at,
    status, replaces_booking_id, assigned_by, crew_role
  ) values (
    v_old.booking_request_id, v_old.client_id, p_skipper_id, v_old.start_date, v_old.end_date,
    v_old.port_id, v_old.region_id, v_old.departure_point, v_old.arrival_point, v_old.boat_type_id,
    v_old.party_size, v_old.private_cabin,
    0, now(),
    'confirmed', p_booking_id, auth.uid(), v_role
  ) returning * into v_new;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
  values (auth.uid(), 'edit_booking', v_skipper.user_id, 'Ανάθεση αντικατάστασης');

  return v_new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3 + 4 + 5α. Νυχτερινή λήξη: αιτήματα πληρώματος και θέσεις μεταφοράς.
-- ----------------------------------------------------------------------------
alter table delivery_role_requests drop constraint if exists delivery_role_requests_status_check;
alter table delivery_role_requests add constraint delivery_role_requests_status_check
  check (status in ('open', 'filled', 'cancelled', 'expired'));

create or replace function expire_stale_delivery_role_requests() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_count int := 0;
begin
  perform set_config('platform.trusted', 'true', true);
  for r in
    select rr.*, dr.client_id, dr.origin_point, dr.destination_point
    from delivery_role_requests rr
    join delivery_requests dr on dr.id = rr.delivery_request_id
    where rr.status = 'open' and rr.expires_at < now()
    for update of rr
  loop
    update delivery_role_requests set status = 'expired' where id = r.id;
    delete from delivery_role_pings where delivery_role_request_id = r.id and status = 'pending';
    if r.fee_paid_at is not null and r.client_fee > 0 then
      update users set wallet_balance = wallet_balance + r.client_fee where id = r.client_id;
      insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id)
        values (r.client_id, 'refund_credit', r.client_fee, r.id);
    end if;
    perform notify_user(
      r.client_id, 'delivery_expired',
      jsonb_build_object('origin', r.origin_point, 'destination', r.destination_point,
                         'role', r.crew_role, 'refund', case when r.fee_paid_at is not null then r.client_fee else 0 end),
      '/platform/delivery/requests'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function expire_stale_booking_requests() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_count int := 0; v_place text;
begin
  perform set_config('platform.trusted', 'true', true);
  for r in
    select * from booking_requests where status = 'open' and expires_at < now() for update
  loop
    -- Δεν πληρώθηκε ποτέ (η αποστολή απέτυχε) → δεν ήταν ποτέ ενεργό αίτημα.
    if r.fee_paid_at is null then
      update booking_requests set status = 'cancelled' where id = r.id;
      delete from booking_request_pings where booking_request_id = r.id and status = 'pending';
      continue;
    end if;

    update booking_requests set status = 'expired_unclaimed' where id = r.id;
    if r.fee_amount > 0 then
      update users set wallet_balance = wallet_balance + r.fee_amount where id = r.client_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
        values (r.client_id, 'refund_credit', r.fee_amount, r.id);
    end if;

    -- Μόνο για αιτήματα πελατών· οι προτάσεις του admin φαίνονται στη δική
    -- του οθόνη «Αναθέσεις δουλειάς».
    if r.origin = 'client' then
      select coalesce(nullif(btrim(r.departure_point), ''), p.name) into v_place
        from (select 1) x left join ports p on p.id = r.port_id;
      perform notify_user(
        r.client_id, 'request_expired',
        jsonb_build_object('port', v_place, 'start', r.start_date, 'end', r.end_date,
                           'role', r.crew_role, 'refund', r.fee_amount),
        '/platform/requests'
      );
    end if;
    v_count := v_count + 1;
  end loop;

  -- Οι θέσεις μεταφοράς λήγουν στο ίδιο πέρασμα — το cron καλεί μόνο αυτή.
  v_count := v_count + expire_stale_delivery_role_requests();
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. cancel_booking: ίδια λογική, χωρίς κινήσεις 0€.
-- ----------------------------------------------------------------------------
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
    if coalesce(v_booking.skipper_claim_fee_amount, 0) > 0 then
      update users set wallet_balance = wallet_balance + v_booking.skipper_claim_fee_amount
        where id = v_skipper_user_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_id)
        values (v_skipper_user_id, 'refund_credit', v_booking.skipper_claim_fee_amount, p_booking_id);
    end if;
    insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
      values (p_booking_id, v_uid, 'client', p_reason);
  else
    update bookings set status = 'cancelled_by_skipper', cancelled_at = now(), cancellation_reason = p_reason,
                        cancellation_lead_days = v_lead, cancellation_weight = v_weight
      where id = p_booking_id;
    -- Μια κράτηση-αντικατάσταση κρατά το booking_request_id της αρχικής:
    -- το τέλος του πελάτη έχει ήδη επιστραφεί όταν ακύρωσε ο πρώτος, δεν
    -- επιστρέφεται δεύτερη φορά.
    if coalesce(v_fee_amount, 0) > 0 and v_booking.replaces_booking_id is null then
      update users set wallet_balance = wallet_balance + v_fee_amount where id = v_booking.client_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_id)
        values (v_booking.client_id, 'refund_credit', v_fee_amount, p_booking_id);
    end if;
    insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
      values (p_booking_id, v_uid, 'skipper', p_reason);
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  return v_booking;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5β. Ο πελάτης αποσύρει ανοιχτή θέση μεταφοράς.
-- ----------------------------------------------------------------------------
create or replace function cancel_delivery_role_request(p_role_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_rr delivery_role_requests%rowtype; v_client uuid;
begin
  select * into v_rr from delivery_role_requests where id = p_role_request_id for update;
  if not found then raise exception 'role_request_not_found'; end if;
  select client_id into v_client from delivery_requests where id = v_rr.delivery_request_id;
  if v_client <> auth.uid() then raise exception 'not_owner'; end if;
  if v_rr.status <> 'open' then raise exception 'not_open'; end if;

  update delivery_role_requests set status = 'cancelled' where id = p_role_request_id;
  delete from delivery_role_pings where delivery_role_request_id = p_role_request_id and status = 'pending';

  if v_rr.fee_paid_at is not null and v_rr.client_fee > 0 then
    perform set_config('platform.trusted', 'true', true);
    update users set wallet_balance = wallet_balance + v_rr.client_fee where id = v_client;
    insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id)
      values (v_client, 'refund_credit', v_rr.client_fee, p_role_request_id);
  end if;
end;
$$;
grant execute on function cancel_delivery_role_request(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5γ. Ακύρωση επιβεβαιωμένης μεταφοράς.
-- ----------------------------------------------------------------------------
alter table delivery_bookings add column if not exists cancelled_by text
  check (cancelled_by is null or cancelled_by in ('client', 'professional'));
alter table delivery_bookings add column if not exists cancellation_reason text;

create or replace function cancel_delivery_booking(p_delivery_booking_id uuid, p_reason text) returns delivery_bookings
language plpgsql security definer set search_path = public as $$
declare
  v_b delivery_bookings%rowtype;
  v_uid uuid := auth.uid();
  v_is_client boolean;
  v_pro_user uuid;
  v_client_fee numeric;
begin
  select * into v_b from delivery_bookings where id = p_delivery_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_b.status <> 'confirmed' then raise exception 'not_cancellable'; end if;

  select user_id into v_pro_user from skipper_profiles where id = v_b.skipper_id;
  if v_uid = v_b.client_id then
    v_is_client := true;
  elsif v_uid = v_pro_user then
    v_is_client := false;
  else
    raise exception 'not_participant';
  end if;

  perform set_config('platform.trusted', 'true', true);
  update delivery_bookings
    set status = 'cancelled', cancelled_at = now(),
        cancelled_by = case when v_is_client then 'client' else 'professional' end,
        cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = p_delivery_booking_id;

  if v_is_client then
    if v_b.professional_fee_amount > 0 then
      update users set wallet_balance = wallet_balance + v_b.professional_fee_amount where id = v_pro_user;
      insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id, related_delivery_booking_id)
        values (v_pro_user, 'refund_credit', v_b.professional_fee_amount, v_b.delivery_role_request_id, v_b.id);
    end if;
    perform notify_user(
      v_pro_user, 'delivery_cancelled',
      jsonb_build_object('origin', v_b.origin_point, 'destination', v_b.destination_point,
                         'role', v_b.crew_role, 'by', 'client', 'refund', v_b.professional_fee_amount),
      '/platform/bookings'
    );
  else
    select client_fee into v_client_fee from delivery_role_requests where id = v_b.delivery_role_request_id;
    if coalesce(v_client_fee, 0) > 0 then
      update users set wallet_balance = wallet_balance + v_client_fee where id = v_b.client_id;
      insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id, related_delivery_booking_id)
        values (v_b.client_id, 'refund_credit', v_client_fee, v_b.delivery_role_request_id, v_b.id);
    end if;
    perform notify_user(
      v_b.client_id, 'delivery_cancelled',
      jsonb_build_object('origin', v_b.origin_point, 'destination', v_b.destination_point,
                         'role', v_b.crew_role, 'by', 'professional', 'refund', coalesce(v_client_fee, 0)),
      '/platform/delivery/requests'
    );
    perform notify_admins(
      'admin_delivery_cancelled',
      jsonb_build_object('origin', v_b.origin_point, 'destination', v_b.destination_point, 'role', v_b.crew_role),
      '/platform/admin/deliveries'
    );
  end if;

  select * into v_b from delivery_bookings where id = p_delivery_booking_id;
  return v_b;
end;
$$;
grant execute on function cancel_delivery_booking(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5δ. Ολοκλήρωση: και οι μεταφορές που πέρασαν.
-- ----------------------------------------------------------------------------
create or replace function mark_bookings_completed() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int; v_delivery int;
begin
  with updated as (
    update bookings set status = 'completed'
    where status = 'confirmed' and end_date < current_date
    returning 1
  )
  select count(*) into v_count from updated;

  with updated as (
    update delivery_bookings set status = 'completed'
    where status = 'confirmed' and departure_date + flexible_days < current_date
    returning 1
  )
  select count(*) into v_delivery from updated;

  return v_count + v_delivery;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. my_conversations: τόπος και για κρατήσεις χωρίς λιμάνι.
-- ----------------------------------------------------------------------------
create or replace function my_conversations(p_user_id uuid default null)
returns table(
  booking_id uuid,
  port_name text,
  start_date date,
  end_date date,
  last_message text,
  last_at timestamptz,
  unread int,
  as_client boolean
)
language sql stable security definer set search_path = public as $$
  with me as (
    select acting_user(p_user_id) as uid,
           skipper_profile_id_of(acting_user(p_user_id)) as sid
  ),
  mine as (
    select b.*, (b.client_id = (select uid from me)) as as_client
    from bookings b
    where b.client_id = (select uid from me)
       or (select sid from me) is not null and b.skipper_id = (select sid from me)
  ),
  agg as (
    select
      m.booking_id,
      max(m.sent_at) as last_at,
      count(*) filter (
        where m.read_at is null and m.sender_id <> (select uid from me)
      )::int as unread
    from messages m
    where m.booking_id in (select id from mine)
    group by m.booking_id
  )
  select
    b.id,
    coalesce(nullif(btrim(b.departure_point), ''), p.name, r.name),
    b.start_date,
    b.end_date,
    (select m2.content from messages m2
      where m2.booking_id = b.id order by m2.sent_at desc limit 1),
    a.last_at,
    a.unread,
    b.as_client
  from mine b
  join agg a on a.booking_id = b.id
  left join ports p on p.id = b.port_id
  left join regions r on r.id = b.region_id
  order by a.last_at desc
  limit 30;
$$;
grant execute on function my_conversations(uuid) to authenticated;
