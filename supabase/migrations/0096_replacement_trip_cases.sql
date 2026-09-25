-- ============================================================================
-- Αντικατάσταση σκίπερ, δεύτερος γύρος — διορθώσεις μετά από πλήρη δοκιμή
-- όλης της διαδικασίας με όλους τους ρόλους.
--
-- Νέοι κανόνες (απόφαση ιδιοκτήτη):
--   * Όταν ακυρώνει ο επαγγελματίας, το τέλος του πελάτη ΔΕΝ επιστρέφεται:
--     η πλατφόρμα του βρίσκει άλλον, και χρεώνεται μόνο ο νέος επαγγελματίας
--     που θα επιλεγεί. Επιστρέφεται μόνο αν η υπόθεση κλείσει οριστικά χωρίς
--     αντικαταστάτη (από τον admin ή επειδή έφτασε η μέρα του ταξιδιού).
--   * Μόλις δηλώσει ενδιαφέρον ο πρώτος υποψήφιος, ο πελάτης έχει 24 ώρες να
--     διαλέξει. Μετά η πρόταση κλείνει και ο admin ξεκινά ξανά.
--   * Ο υποψήφιος δεν δεσμεύεται πριν τον επιλέξει ο πελάτης (δεν έχει
--     χρεωθεί): μπορεί να ανακαλέσει, και μπορεί να αναλάβει άλλη δουλειά
--     ελεύθερα — αν κλειστεί αλλού τις ίδιες μέρες, η υποψηφιότητά του
--     αποσύρεται αυτόματα.
--
-- Διορθώσεις:
--   * Μία υπόθεση ανά ΤΑΞΙΔΙ (trip_root_id), όχι ανά ακυρωμένη κράτηση: αν
--     ακυρώσει και ο αντικαταστάτης, δεν ξανανοίγει η αρχική υπόθεση δίπλα
--     στη νέα — και η βάση αρνείται δεύτερο επιβεβαιωμένο επαγγελματία για
--     το ίδιο ταξίδι (κλείδωμα ανά ταξίδι, όχι ανά πρόταση).
--   * Το στάδιο βγαίνει από την ΑΝΟΙΧΤΗ πρόταση· μια πρόταση που έληξε, που
--     αποσύρθηκε ή που ο πελάτης άφησε να περάσει ξαναγυρίζει την υπόθεση σε
--     «Χρειάζεται ενέργεια» — ποτέ «κολλημένη».
--   * Κάθε κλείσιμο πρότασης ενημερώνει υποψηφίους, πελάτη, admin.
--   * Ο πελάτης δεν μπορεί να ακυρώσει/πειράξει πρόταση του admin.
--   * Η αναζήτηση υποψηφίων φιλτράρει περιοχή και εξαιρεί όσους ακύρωσαν.
--   * Ο επαγγελματίας δίνει υποχρεωτικά λόγο όταν ακυρώνει.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Στήλες
-- ----------------------------------------------------------------------------
alter table booking_request_pings add column if not exists withdrawn_at timestamptz;

alter table booking_requests add column if not exists client_decide_by timestamptz;
alter table booking_requests add column if not exists closed_reason text;
alter table booking_requests add column if not exists closed_at timestamptz;

alter table bookings add column if not exists trip_root_id uuid;
alter table bookings add column if not exists replacement_closed_at timestamptz;
alter table bookings add column if not exists replacement_closed_reason text;
alter table bookings add column if not exists replacement_closed_by uuid references users(id);

-- Ποιο ταξίδι: η αρχική κράτηση της αλυσίδας αντικαταστάσεων.
with recursive chain as (
  select id, id as root from bookings where replaces_booking_id is null
  union all
  select b.id, c.root from bookings b join chain c on b.replaces_booking_id = c.id
)
update bookings b set trip_root_id = c.root
from chain c
where c.id = b.id and b.trip_root_id is distinct from c.root;

create index if not exists bookings_trip_root_idx on bookings(trip_root_id);

create or replace function set_booking_trip_root() returns trigger
language plpgsql as $$
begin
  if new.replaces_booking_id is not null then
    select coalesce(trip_root_id, id) into new.trip_root_id from bookings where id = new.replaces_booking_id;
  end if;
  new.trip_root_id := coalesce(new.trip_root_id, new.id);
  return new;
end;
$$;
drop trigger if exists trg_set_booking_trip_root on bookings;
create trigger trg_set_booking_trip_root before insert on bookings
  for each row execute function set_booking_trip_root();

-- Παλιές υποθέσεις που το ταξίδι τους έχει ήδη περάσει: κλείνουν σιωπηλά
-- (χωρίς ειδοποίηση/επιστροφή — με τον παλιό κανόνα ο πελάτης είχε ήδη πάρει
-- πίσω το τέλος του τη στιγμή της ακύρωσης).
update bookings b set
  replacement_closed_at = coalesce(b.cancelled_at, now()),
  replacement_closed_reason = 'Ιστορική υπόθεση (πριν τη νέα διαδικασία)'
where b.status = 'cancelled_by_skipper'
  and b.replacement_closed_at is null
  and b.start_date <= current_date
  and not exists (select 1 from bookings r where r.replaces_booking_id = b.id);

-- ----------------------------------------------------------------------------
-- 2. Βοηθητικές
-- ----------------------------------------------------------------------------
-- Μια ανοιχτή πρόταση που στην πράξη έχει λήξει: πέρασε η προθεσμία του
-- πελάτη, ή πέρασε η προθεσμία απάντησης χωρίς κανέναν ενεργό υποψήφιο. Η
-- νυχτερινή εργασία την κλείνει· μέχρι τότε όλα τη βλέπουν ήδη ως κλειστή.
create or replace function replacement_offer_lapsed(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select br.status = 'open' and br.origin = 'admin_replacement' and (
      (br.client_decide_by is not null and br.client_decide_by < now())
      or (br.expires_at < now() and not exists (
        select 1 from booking_request_pings x
        where x.booking_request_id = br.id and x.status = 'pending' and x.candidate_at is not null
      ))
    )
    from booking_requests br where br.id = p_request_id
  ), false);
$$;

-- Κλείνει μια πρόταση αντικατάστασης και ενημερώνει όποιον επηρεάζεται.
-- Εσωτερική: καλείται μόνο από άλλες συναρτήσεις της βάσης.
--   reason: no_response | client_timeout | withdrawn | covered | case_closed
create or replace function close_replacement_offer(p_request_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_req booking_requests%rowtype; v_c record; v_had_candidates boolean := false; v_payload jsonb;
begin
  select * into v_req from booking_requests where id = p_request_id for update;
  if not found or v_req.status <> 'open' or v_req.origin <> 'admin_replacement' then return; end if;

  v_payload := jsonb_build_object(
    'port', booking_place(v_req.departure_point, v_req.port_id, v_req.region_id),
    'start', v_req.start_date, 'end', v_req.end_date, 'role', v_req.crew_role, 'reason', p_reason
  );

  for v_c in
    select sp.user_id from booking_request_pings brp join skipper_profiles sp on sp.id = brp.skipper_id
    where brp.booking_request_id = p_request_id and brp.status = 'pending' and brp.candidate_at is not null
  loop
    v_had_candidates := true;
    perform notify_user(v_c.user_id, 'replacement_offer_closed', v_payload, '/platform/requests');
  end loop;

  update booking_request_pings set status = 'missed'
    where booking_request_id = p_request_id and status = 'pending';
  update booking_requests set
    status = case when p_reason in ('no_response', 'client_timeout') then 'expired_unclaimed'::booking_request_status
                  else 'cancelled'::booking_request_status end,
    closed_reason = p_reason, closed_at = now()
  where id = p_request_id;

  if v_had_candidates and p_reason in ('client_timeout', 'withdrawn') then
    perform notify_user(v_req.client_id, 'replacement_choice_expired', v_payload,
                        '/platform/bookings?focus=' || v_req.replaces_booking_id);
  end if;
  if p_reason in ('no_response', 'client_timeout') then
    perform notify_admins('coverage_needed', v_payload, '/platform/admin/replacements');
  end if;
end;
$$;
revoke execute on function close_replacement_offer(uuid, text) from public, anon, authenticated;

-- Κλείνει οριστικά μια υπόθεση χωρίς αντικαταστάτη και επιστρέφει στον
-- πελάτη το αρχικό τέλος (αν δεν έχει ήδη επιστραφεί). Εσωτερική.
create or replace function close_replacement_case(p_booking_id uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
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
  select fee_amount into v_fee from booking_requests where id = v_root.booking_request_id and origin = 'client';
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
$$;
revoke execute on function close_replacement_case(uuid, text, uuid) from public, anon, authenticated;

create or replace function admin_close_replacement_case(p_booking_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform close_replacement_case(p_booking_id, p_reason, auth.uid());
end;
$$;
grant execute on function admin_close_replacement_case(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Ακύρωση από επαγγελματία: υποχρεωτικός λόγος, ΚΑΜΙΑ επιστροφή στον
--    πελάτη (βλ. κανόνα στην κορυφή). Η πλευρά του πελάτη δεν αλλάζει.
-- ----------------------------------------------------------------------------
create or replace function cancel_booking(p_booking_id uuid, p_reason text)
returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_uid uuid := auth.uid();
  v_is_client boolean;
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

  if not v_is_client and btrim(coalesce(p_reason, '')) = '' then
    raise exception 'reason_required';
  end if;

  v_lead := cancellation_lead_days_for(now(), v_booking.start_date);
  v_weight := cancellation_weight_for(now(), v_booking.start_date);

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
    insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
      values (p_booking_id, v_uid, 'skipper', p_reason);
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  return v_booking;
end;
$$;

create or replace function notify_booking_cancelled() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_payload jsonb;
begin
  if new.status not in ('cancelled_by_client', 'cancelled_by_skipper')
     or old.status = new.status then
    return null;
  end if;

  select user_id into v_skipper_uid from skipper_profiles where id = new.skipper_id;
  v_payload := jsonb_build_object(
    'port', booking_place(new.departure_point, new.port_id, new.region_id),
    'start', new.start_date, 'end', new.end_date, 'role', new.crew_role
  );

  if new.status = 'cancelled_by_client' then
    perform notify_user(
      v_skipper_uid, 'booking_cancelled',
      v_payload || jsonb_build_object('by', 'client', 'refund', coalesce(new.skipper_claim_fee_amount, 0)),
      '/platform/bookings'
    );
  else
    perform notify_user(
      new.client_id, 'booking_cancelled',
      v_payload || jsonb_build_object('by', 'professional', 'refund', 0, 'searching', true),
      '/platform/bookings?focus=' || new.id
    );
    perform notify_admins('coverage_needed', v_payload || jsonb_build_object('reason', 'skipper_cancelled'),
                          '/platform/admin/replacements');
  end if;
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Ο πελάτης δεν πειράζει προτάσεις του admin (ακύρωση/απόσυρση ατόμου).
-- ----------------------------------------------------------------------------
create or replace function cancel_booking_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid; v_status booking_request_status; v_fee_paid_at timestamptz; v_fee_amount numeric; v_origin text;
begin
  select client_id, status, fee_paid_at, fee_amount, origin into v_client_id, v_status, v_fee_paid_at, v_fee_amount, v_origin
    from booking_requests where id = p_request_id for update;
  if v_client_id is null then raise exception 'request_not_found'; end if;
  if v_client_id <> auth.uid() then raise exception 'not_owner'; end if;
  if v_origin <> 'client' then raise exception 'not_client_request'; end if;
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

create or replace function client_withdraw_ping(p_request_id uuid, p_ping_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid;
  v_status booking_request_status;
  v_origin text;
  v_ping_status ping_status;
begin
  select client_id, status, origin into v_client_id, v_status, v_origin
    from booking_requests where id = p_request_id for update;
  if v_client_id is null then raise exception 'request_not_found'; end if;
  if v_client_id <> auth.uid() then raise exception 'not_owner'; end if;
  if v_origin <> 'client' then raise exception 'not_client_request'; end if;
  if v_status <> 'open' then raise exception 'request_not_open'; end if;

  select status into v_ping_status
    from booking_request_pings
    where id = p_ping_id and booking_request_id = p_request_id
    for update;
  if v_ping_status is null then raise exception 'ping_not_found'; end if;
  if v_ping_status <> 'pending' then raise exception 'already_resolved'; end if;

  delete from booking_request_pings where id = p_ping_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Αναζήτηση υποψηφίων για τον admin: περιοχή, επιπλέον ιδιότητες,
--    μεταφορές σκάφους, και εξαίρεση όσων ακύρωσαν ήδη αυτό το ταξίδι.
-- ----------------------------------------------------------------------------
drop function if exists admin_search_availability(crew_role, date, date, uuid);
drop function if exists admin_search_availability(crew_role, date, date, uuid, uuid, uuid);
create function admin_search_availability(
  p_role crew_role default 'skipper',
  p_start date default current_date,
  p_end date default current_date,
  p_port_id uuid default null,
  p_region_id uuid default null,
  p_exclude_trip_of uuid default null
)
returns table(skipper_id uuid, user_id uuid, full_name text, phone_number text, crew_role crew_role,
              price_per_day numeric, rating_avg numeric, rating_count integer, reliability_percentage numeric,
              tier skipper_tier, photo_url text)
language sql stable security definer set search_path = public as $$
  select
    sp.id, sp.user_id, sp.full_name, u.phone_number, p_role,
    case when sp.role = p_role then sp.price_per_day else coalesce(ssr.price_per_day, sp.price_per_day) end,
    sp.rating_avg, sp.rating_count,
    sp.reliability_percentage, sp.tier, u.photo_url
  from skipper_profiles sp
  join users u on u.id = sp.user_id
  left join skipper_secondary_roles ssr
    on ssr.skipper_id = sp.id and ssr.role = p_role and ssr.deleted_at is null and ssr.approval_status = 'approved'
  where is_admin()
    and sp.approval_status = 'approved'
    and sp.deleted_at is null
    and u.status = 'active'
    and (sp.role = p_role or ssr.id is not null)
    and net_availability(sp.id, p_port_id, p_region_id, p_role) @> daterange(p_start, p_end, '[]')
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
    and not exists (
      select 1 from delivery_bookings d
      where d.skipper_id = sp.id and d.status = 'confirmed'
        and d.estimated_range && daterange(p_start, p_end, '[]')
    )
    and (p_exclude_trip_of is null or not exists (
      select 1 from bookings x
      where x.trip_root_id = (select trip_root_id from bookings where id = p_exclude_trip_of)
        and x.skipper_id = sp.id and x.status = 'cancelled_by_skipper'
    ))
  order by
    case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
    skipper_rank_score(sp.rating_avg, sp.rating_count, cancellation_standing(sp.id),
                       skipper_response_rate(sp.id)) desc;
$$;
grant execute on function admin_search_availability(crew_role, date, date, uuid, uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Δημιουργία πρότασης: μία ανοιχτή ανά ταξίδι, μόνο για την τελευταία
--    ακυρωμένη κράτηση της αλυσίδας, ποτέ σε όποιον ακύρωσε το ίδιο ταξίδι.
-- ----------------------------------------------------------------------------
create or replace function admin_create_offer(p_skipper_ids uuid[], p_role crew_role DEFAULT 'skipper'::crew_role, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_port_id uuid DEFAULT NULL::uuid, p_boat_type_id uuid DEFAULT NULL::uuid, p_replaces_booking_id uuid DEFAULT NULL::uuid, p_claim_fee numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text, p_expires_hours integer DEFAULT 24)
 RETURNS booking_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_open record;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then
    raise exception 'no_skippers_selected';
  end if;

  if p_replaces_booking_id is not null then
    select * into v_old from bookings where id = p_replaces_booking_id for update;
    if not found then raise exception 'booking_not_found'; end if;
    perform pg_advisory_xact_lock(hashtext('trip:' || v_old.trip_root_id::text));
    if v_old.status <> 'cancelled_by_skipper' then raise exception 'not_awaiting_cover'; end if;
    if v_old.replacement_closed_at is not null then raise exception 'case_closed'; end if;
    if exists (
      select 1 from bookings r
      where r.trip_root_id = v_old.trip_root_id and r.status in ('confirmed', 'completed')
    ) then
      raise exception 'already_covered';
    end if;
    if exists (select 1 from bookings r where r.replaces_booking_id = p_replaces_booking_id) then
      raise exception 'not_latest_in_trip';
    end if;
    -- Μία ανοιχτή πρόταση ανά ταξίδι. Όποια έχει λήξει στην πράξη κλείνει
    -- εδώ (με ενημέρωση), αντί να περιμένει τη νυχτερινή εργασία.
    for v_open in
      select br.id from booking_requests br join bookings x on x.id = br.replaces_booking_id
      where x.trip_root_id = v_old.trip_root_id and br.origin = 'admin_replacement' and br.status = 'open'
    loop
      if replacement_offer_lapsed(v_open.id) then
        perform close_replacement_offer(v_open.id,
          case when (select client_decide_by from booking_requests where id = v_open.id) < now()
               then 'client_timeout' else 'no_response' end);
      else
        raise exception 'offer_already_open';
      end if;
    end loop;
    if exists (
      select 1 from bookings x
      where x.trip_root_id = v_old.trip_root_id and x.status = 'cancelled_by_skipper'
        and x.skipper_id = any(p_skipper_ids)
    ) then
      raise exception 'skipper_cancelled_this_trip';
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
$function$;

-- Απόσυρση από τον admin: για αντικατάσταση, με ενημέρωση υποψηφίων/πελάτη.
create or replace function admin_cancel_offer(p_request_id uuid)
returns booking_requests
language plpgsql security definer set search_path = public as $$
declare v_req booking_requests%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.origin = 'client' then raise exception 'not_an_offer'; end if;
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;

  if v_req.origin = 'admin_replacement' then
    perform close_replacement_offer(p_request_id, 'withdrawn');
    insert into admin_actions (admin_id, action_type, target_booking_id, notes)
      values (auth.uid(), 'edit_booking', v_req.replaces_booking_id, 'Απόσυρση πρότασης αντικατάστασης');
  else
    update booking_requests set status = 'cancelled', closed_reason = 'withdrawn', closed_at = now()
      where id = p_request_id;
  end if;
  select * into v_req from booking_requests where id = p_request_id;
  return v_req;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Απάντηση υποψηφίου. Ο πρώτος ενεργός υποψήφιος ξεκινά τις 24 ώρες του
--    πελάτη (και μόνο τότε ειδοποιείται ο πελάτης — μία φορά, όχι ανά άτομο).
-- ----------------------------------------------------------------------------
create or replace function respond_to_replacement_offer(p_request_id uuid, p_skipper_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req booking_requests%rowtype;
  v_ping booking_request_pings%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_secondary skipper_secondary_roles%rowtype;
  v_overlap boolean;
  v_trip uuid;
  v_first boolean;
  v_decide_by timestamptz;
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;

  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.origin <> 'admin_replacement' then raise exception 'not_a_replacement_offer'; end if;
  if v_req.status <> 'open' or replacement_offer_lapsed(p_request_id) then raise exception 'request_not_open'; end if;

  select * into v_ping from booking_request_pings
    where booking_request_id = p_request_id and skipper_id = p_skipper_id for update;
  if not found then raise exception 'not_pinged'; end if;
  if v_ping.status <> 'pending' or v_ping.candidate_at is not null then raise exception 'already_resolved'; end if;

  if not p_accept then
    update booking_request_pings set status = 'missed', declined_at = now() where id = v_ping.id;
    return;
  end if;

  if v_req.expires_at <= now() then raise exception 'request_expired'; end if;

  select trip_root_id into v_trip from bookings where id = v_req.replaces_booking_id;
  if exists (select 1 from bookings r where r.trip_root_id = v_trip and r.status in ('confirmed', 'completed')) then
    raise exception 'already_covered';
  end if;
  if exists (select 1 from bookings r where r.trip_root_id = v_trip and r.skipper_id = p_skipper_id
             and r.status = 'cancelled_by_skipper') then
    raise exception 'skipper_not_eligible';
  end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id;
  if v_skipper.deleted_at is not null then raise exception 'skipper_not_eligible'; end if;
  if v_req.crew_role = v_skipper.role then
    if v_skipper.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  else
    select * into v_secondary from skipper_secondary_roles
      where skipper_id = p_skipper_id and role = v_req.crew_role and deleted_at is null;
    if not found or v_secondary.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  end if;

  select exists (
    select 1 from bookings b
    where b.skipper_id = p_skipper_id and b.status in ('confirmed', 'completed')
      and daterange(b.start_date, b.end_date, '[]') && daterange(v_req.start_date, v_req.end_date, '[]')
  ) into v_overlap;
  if v_overlap then raise exception 'date_overlap'; end if;

  select exists (
    select 1 from delivery_bookings
    where skipper_id = p_skipper_id and status = 'confirmed'
      and estimated_range && daterange(v_req.start_date, v_req.end_date, '[]')
  ) into v_overlap;
  if v_overlap then raise exception 'date_overlap'; end if;

  select not exists (
    select 1 from booking_request_pings x
    where x.booking_request_id = p_request_id and x.status = 'pending' and x.candidate_at is not null
  ) into v_first;

  update booking_request_pings set candidate_at = now() where id = v_ping.id;

  if v_first then
    v_decide_by := greatest(least(now() + interval '24 hours', v_req.start_date::timestamptz), now() + interval '2 hours');
    update booking_requests set client_decide_by = v_decide_by where id = p_request_id;
    perform notify_user(
      v_req.client_id, 'replacement_candidate_available',
      jsonb_build_object('port', booking_place(v_req.departure_point, v_req.port_id, v_req.region_id),
                         'start', v_req.start_date, 'end', v_req.end_date, 'decide_by', v_decide_by),
      '/platform/bookings?focus=' || v_req.replaces_booking_id
    );
  end if;
end;
$$;
grant execute on function respond_to_replacement_offer(uuid, uuid, boolean) to authenticated;

-- Ανάκληση υποψηφιότητας πριν αποφασίσει ο πελάτης — ο υποψήφιος δεν έχει
-- χρεωθεί και δεν δεσμεύεται.
create or replace function withdraw_replacement_candidacy(p_request_id uuid, p_skipper_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_req booking_requests%rowtype; v_ping booking_request_pings%rowtype;
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;
  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.origin <> 'admin_replacement' then raise exception 'not_a_replacement_offer'; end if;
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;

  select * into v_ping from booking_request_pings
    where booking_request_id = p_request_id and skipper_id = p_skipper_id for update;
  if not found or v_ping.status <> 'pending' or v_ping.candidate_at is null then
    raise exception 'not_a_candidate';
  end if;

  update booking_request_pings set status = 'missed', withdrawn_at = now() where id = v_ping.id;
end;
$$;
grant execute on function withdraw_replacement_candidacy(uuid, uuid) to authenticated;

-- Όποιος επιβεβαιώνεται αλλού για επικαλυπτόμενες μέρες παύει αυτόματα να
-- είναι υποψήφιος — ο πελάτης δεν βλέπει ποτέ επιλογή που δεν ισχύει πια.
create or replace function drop_stale_candidacies() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_range daterange;
begin
  if new.status <> 'confirmed' then return null; end if;
  if tg_table_name = 'bookings' then
    v_range := daterange(new.start_date, new.end_date, '[]');
  else
    v_range := new.estimated_range;
  end if;

  update booking_request_pings p set status = 'missed', withdrawn_at = now()
  from booking_requests br
  where br.id = p.booking_request_id
    and br.origin = 'admin_replacement' and br.status = 'open'
    and p.skipper_id = new.skipper_id and p.status = 'pending' and p.candidate_at is not null
    and daterange(br.start_date, br.end_date, '[]') && v_range
    and (tg_table_name <> 'bookings' or br.id is distinct from new.booking_request_id);
  return null;
end;
$$;
drop trigger if exists trg_drop_stale_candidacies on bookings;
create trigger trg_drop_stale_candidacies after insert or update of status on bookings
  for each row execute function drop_stale_candidacies();
drop trigger if exists trg_drop_stale_candidacies on delivery_bookings;
create trigger trg_drop_stale_candidacies after insert or update of status on delivery_bookings
  for each row execute function drop_stale_candidacies();

-- ----------------------------------------------------------------------------
-- 8. Πελάτης: υποψήφιοι μόνο όσο ισχύει η προθεσμία, και επιλογή με
--    κλείδωμα ΑΝΑ ΤΑΞΙΔΙ — ένας μόνο επιβεβαιωμένος επαγγελματίας, πάντα.
-- ----------------------------------------------------------------------------
create or replace function client_list_replacement_candidates(p_request_id uuid)
returns setof skipper_public
language sql stable security definer set search_path = public as $$
  select sppub.*
  from booking_request_pings brp
  join booking_requests br on br.id = brp.booking_request_id
  join skipper_public sppub on sppub.id = brp.skipper_id
  where brp.booking_request_id = p_request_id
    and brp.candidate_at is not null
    and brp.status = 'pending'
    and br.origin = 'admin_replacement'
    and br.status = 'open'
    and not replacement_offer_lapsed(br.id)
    and br.client_id = auth.uid()
    and not exists (
      select 1 from bookings b
      where b.skipper_id = brp.skipper_id and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(br.start_date, br.end_date, '[]')
    )
  order by brp.candidate_at;
$$;
grant execute on function client_list_replacement_candidates(uuid) to authenticated;

create or replace function client_select_replacement_candidate(p_request_id uuid, p_skipper_id uuid)
returns bookings
language plpgsql security definer set search_path = public as $$
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
  if v_claim_fee > 0 and v_wallet < v_claim_fee then
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
$$;
grant execute on function client_select_replacement_candidate(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. Νυχτερινή εργασία: κλείνει προτάσεις που έληξαν (με ενημέρωση) και
--    υποθέσεις που έφτασε η μέρα του ταξιδιού χωρίς αντικαταστάτη.
-- ----------------------------------------------------------------------------
create or replace function expire_stale_booking_requests()
returns integer
language plpgsql security definer set search_path = public as $$
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
    if r.fee_amount > 0 then
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
                           'role', r.crew_role, 'refund', r.fee_amount),
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

  v_count := v_count + expire_stale_delivery_role_requests();
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. Υποθέσεις για τον admin — μία ανά ταξίδι.
-- ----------------------------------------------------------------------------
drop function if exists admin_replacement_cases(boolean);
create function admin_replacement_cases(p_include_completed boolean default false)
returns table(
  booking_id uuid, trip_root_id uuid, client_id uuid, client_name text,
  port_id uuid, region_id uuid, port_name text, start_date date, end_date date, crew_role crew_role,
  cancelled_at timestamptz, cancellation_reason text, cancelled_skipper_name text, skipper_cancellations int,
  offer_request_id uuid, offer_status text, offer_closed_reason text,
  offer_created_at timestamptz, offer_expires_at timestamptz, offer_client_decide_by timestamptz,
  offer_recipients int, offer_pending int, offer_declined int, offer_candidates int,
  new_booking_id uuid, new_skipper_name text, confirmed_at timestamptz, charged numeric,
  replacement_closed_at timestamptz, replacement_closed_reason text,
  stage text
)
language sql stable security definer set search_path = public as $$
  with cases as (
    select b.*,
      (select s.id from bookings s where s.replaces_booking_id = b.id
         and s.status in ('confirmed', 'completed', 'cancelled_by_client') order by s.created_at desc limit 1) as succ_id
    from bookings b
    where b.status = 'cancelled_by_skipper'
      and not exists (select 1 from bookings s where s.replaces_booking_id = b.id and s.status = 'cancelled_by_skipper')
  )
  select
    c.id, c.trip_root_id, c.client_id, u.full_name,
    c.port_id, c.region_id, booking_place(c.departure_point, c.port_id, c.region_id), c.start_date, c.end_date,
    coalesce(c.crew_role, sp.role, 'skipper'::crew_role),
    c.cancelled_at, c.cancellation_reason,
    coalesce(nullif(btrim(sp.full_name), ''), spu.full_name),
    (select count(*)::int from bookings t where t.trip_root_id = c.trip_root_id and t.status = 'cancelled_by_skipper'),
    o.id, o.status::text, o.closed_reason, o.created_at, o.expires_at, o.client_decide_by,
    (select count(*)::int from booking_request_pings x where x.booking_request_id = o.id),
    (select count(*)::int from booking_request_pings x where x.booking_request_id = o.id and x.status = 'pending' and x.candidate_at is null),
    (select count(*)::int from booking_request_pings x where x.booking_request_id = o.id and x.declined_at is not null),
    (select count(*)::int from booking_request_pings x where x.booking_request_id = o.id and x.candidate_at is not null and x.status = 'pending'),
    r.id, coalesce(nullif(btrim(rsp.full_name), ''), ru.full_name), r.confirmed_at, r.skipper_claim_fee_amount,
    c.replacement_closed_at, c.replacement_closed_reason,
    case
      when r.id is not null then 'completed'
      when c.replacement_closed_at is not null then 'closed_unfilled'
      when o.id is null or o.status <> 'open' or replacement_offer_lapsed(o.id) then 'needs_action'
      when exists (select 1 from booking_request_pings x where x.booking_request_id = o.id and x.candidate_at is not null and x.status = 'pending') then 'awaiting_client'
      else 'awaiting_skippers'
    end
  from cases c
  join users u on u.id = c.client_id
  left join skipper_profiles sp on sp.id = c.skipper_id
  left join users spu on spu.id = sp.user_id
  left join lateral (
    select br.* from booking_requests br
    where br.replaces_booking_id = c.id and br.origin = 'admin_replacement'
    order by br.created_at desc limit 1
  ) o on true
  left join bookings r on r.id = c.succ_id
  left join skipper_profiles rsp on rsp.id = r.skipper_id
  left join users ru on ru.id = rsp.user_id
  where is_admin()
    and (p_include_completed or (r.id is null and c.replacement_closed_at is null))
  order by (r.id is null and c.replacement_closed_at is null) desc, c.cancelled_at desc;
$$;
grant execute on function admin_replacement_cases(boolean) to authenticated;

-- Όλη η ιστορία του ταξιδιού: κάθε κράτηση της αλυσίδας (ποιος, πότε,
-- γιατί ακύρωσε), κάθε πρόταση, κάθε απάντηση με ώρα.
drop function if exists admin_replacement_case_detail(uuid);
create function admin_replacement_case_detail(p_booking_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with root as (select trip_root_id as id from bookings where id = p_booking_id),
  trip as (
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'status', b.status, 'skipper_name', coalesce(nullif(btrim(sp.full_name), ''), su.full_name),
      'created_at', b.created_at, 'confirmed_at', b.confirmed_at,
      'cancelled_at', b.cancelled_at, 'cancellation_reason', b.cancellation_reason,
      'charged', b.skipper_claim_fee_amount, 'is_replacement', b.replaces_booking_id is not null,
      'replacement_closed_at', b.replacement_closed_at, 'replacement_closed_reason', b.replacement_closed_reason
    ) order by b.created_at) as v
    from bookings b
    left join skipper_profiles sp on sp.id = b.skipper_id
    left join users su on su.id = sp.user_id
    where b.trip_root_id = (select id from root)
  ),
  offers as (
    select jsonb_agg(jsonb_build_object(
      'id', br.id, 'status', br.status, 'created_at', br.created_at, 'expires_at', br.expires_at,
      'client_decide_by', br.client_decide_by, 'closed_reason', br.closed_reason, 'closed_at', br.closed_at,
      'claim_fee_amount', coalesce(br.claim_fee_amount, (select value from platform_settings where key = 'skipper_claim_fee')),
      'note', br.note,
      'created_by_name', (select full_name from users where id = br.created_by),
      'recipients', (
        select jsonb_agg(jsonb_build_object(
          'skipper_id', brp.skipper_id,
          'name', coalesce(nullif(btrim(sp.full_name), ''), su.full_name),
          'sent_at', brp.sent_at,
          'candidate_at', brp.candidate_at,
          'declined_at', brp.declined_at,
          'withdrawn_at', brp.withdrawn_at,
          'status', brp.status
        ) order by brp.sent_at)
        from booking_request_pings brp
        join skipper_profiles sp on sp.id = brp.skipper_id
        join users su on su.id = sp.user_id
        where brp.booking_request_id = br.id
      )
    ) order by br.created_at desc) as v
    from booking_requests br
    join bookings x on x.id = br.replaces_booking_id
    where x.trip_root_id = (select id from root) and br.origin = 'admin_replacement'
  ),
  refund as (
    select coalesce(sum(w.amount), 0) as v from wallet_transactions w
    join bookings rb on rb.id = (select id from root)
    where w.user_id = rb.client_id and w.type = 'refund_credit'
      and (w.related_booking_id in (select id from bookings where trip_root_id = (select id from root))
           or w.related_booking_request_id = rb.booking_request_id)
  )
  select jsonb_build_object(
    'booking', (select to_jsonb(b) || jsonb_build_object('place', booking_place(b.departure_point, b.port_id, b.region_id))
                from bookings b where b.id = p_booking_id),
    'client_name', (select u.full_name from users u join bookings b on b.client_id = u.id where b.id = p_booking_id),
    'client_fee', (select br.fee_amount from bookings b join booking_requests br on br.id = b.booking_request_id
                   where b.id = (select id from root) and br.origin = 'client'),
    'client_refunded', (select v from refund),
    'trip', coalesce((select v from trip), '[]'::jsonb),
    'offers', coalesce((select v from offers), '[]'::jsonb),
    'new_booking', (
      select jsonb_build_object('id', r.id, 'skipper_name', coalesce(nullif(btrim(rsp.full_name), ''), ru.full_name),
                                'confirmed_at', r.confirmed_at, 'charged', r.skipper_claim_fee_amount, 'status', r.status)
      from bookings r
      left join skipper_profiles rsp on rsp.id = r.skipper_id
      left join users ru on ru.id = rsp.user_id
      where r.replaces_booking_id = p_booking_id
      order by r.created_at desc limit 1
    )
  )
  where (select is_admin());
$$;
grant execute on function admin_replacement_case_detail(uuid) to authenticated;

-- Συμβατότητα: ίδιες στήλες με πριν, πάνω στη νέα λογική υποθέσεων.
drop function if exists admin_coverage_needed();
create function admin_coverage_needed()
returns table(
  booking_id uuid, client_id uuid, client_name text, client_phone text,
  port_id uuid, port_name text, start_date date, end_date date, crew_role crew_role,
  cancelled_at timestamptz, cancellation_reason text,
  offer_request_id uuid, offer_pending int, offer_candidates int
)
language sql stable security definer set search_path = public as $$
  select c.booking_id, c.client_id, c.client_name, u.phone_number,
         c.port_id, c.port_name, c.start_date, c.end_date, c.crew_role,
         c.cancelled_at, c.cancellation_reason,
         case when c.stage in ('awaiting_skippers', 'awaiting_client') then c.offer_request_id end,
         case when c.stage in ('awaiting_skippers', 'awaiting_client') then c.offer_pending else 0 end,
         case when c.stage = 'awaiting_client' then c.offer_candidates else 0 end
  from admin_replacement_cases(false) c
  join users u on u.id = c.client_id
  order by c.start_date;
$$;
grant execute on function admin_coverage_needed() to authenticated;

-- Η οθόνη «Αναθέσεις δουλειάς» είναι για απευθείας προτάσεις του admin· οι
-- αντικαταστάσεις έχουν δική τους οθόνη (με άλλους κανόνες).
create or replace function admin_list_offers(p_include_closed boolean DEFAULT false)
 RETURNS TABLE(request_id uuid, origin text, status booking_request_status, crew_role crew_role, start_date date, end_date date, port_name text, boat_type_name text, note text, claim_fee_amount numeric, expires_at timestamp with time zone, created_at timestamp with time zone, client_name text, replaces_booking_id uuid, recipients integer, pending integer, declined integer, claimed_by text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    br.id, br.origin, br.status, br.crew_role,
    br.start_date, br.end_date, p.name, bt.name,
    br.note,
    coalesce(br.claim_fee_amount, (select value from platform_settings where key = 'skipper_claim_fee')),
    br.expires_at, br.created_at,
    u.full_name, br.replaces_booking_id,
    (select count(*)::int from booking_request_pings x where x.booking_request_id = br.id),
    (select count(*)::int from booking_request_pings x where x.booking_request_id = br.id and x.status = 'pending'),
    (select count(*)::int from booking_request_pings x where x.booking_request_id = br.id and x.declined_at is not null),
    (select sp.full_name from bookings b
       join skipper_profiles sp on sp.id = b.skipper_id
      where b.booking_request_id = br.id and b.status in ('confirmed', 'completed')
      limit 1)
  from booking_requests br
  left join ports p on p.id = br.port_id
  left join boat_types bt on bt.id = br.boat_type_id
  left join users u on u.id = br.client_id
  where is_admin()
    and br.origin = 'admin_direct'
    and (p_include_closed or br.status = 'open')
  order by br.status = 'open' desc, br.start_date;
$function$;

create or replace function admin_overview()
returns jsonb
language sql stable security definer set search_path = public as $$
  with rc as (select stage from admin_replacement_cases(false))
  select case when not is_admin() then null else jsonb_build_object(
    'users_total',        (select count(*) from users where role <> 'admin'),
    'users_new_7d',       (select count(*) from users where role <> 'admin' and created_at > now() - interval '7 days'),
    'clients_total',      (select count(*) from users where role = 'client'),
    'pros_total',         (select count(*) from users where role = 'skipper'),
    'pending_approvals',  (select count(*) from skipper_profiles where approval_status = 'pending' and deleted_at is null),
    'pending_secondary_roles', (select count(*) from skipper_secondary_roles
                                where approval_status = 'pending' and deleted_at is null),
    'open_disputes',      (select count(*) from cancellation_reports where resolved_at is null),
    'contact_new',        (select count(*) from contact_messages where status = 'new'),
    'coverage_needed',    (select count(*) from rc where stage = 'needs_action'),
    'coverage_offered',   (select count(*) from rc where stage in ('awaiting_skippers', 'awaiting_client')),
    'replacement_awaiting_client', (select count(*) from rc where stage = 'awaiting_client'),
    'offers_open',        (select count(*) from booking_requests where origin = 'admin_direct' and status = 'open'),
    'requests_open',      (select count(*) from booking_requests where status = 'open' and origin = 'client'),
    'requests_unclaimed_7d', (select count(*) from booking_requests
                              where status = 'expired_unclaimed' and origin = 'client' and created_at > now() - interval '7 days'),
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
                             and not skipper_is_search_visible(sp.id)),
    'pending_verification', (select count(*) from users
                             where phone_verified_at is null and status <> 'deleted' and role <> 'admin'),
    'pending_photos',   (select count(*) from users
                         where photo_url is not null and photo_reviewed_at is null and status <> 'deleted'),
    'suspended_count', (select count(*) from users where status = 'suspended')
  ) end;
$$;
grant execute on function admin_overview() to authenticated;
