-- ============================================================================
-- Πραγματική διαδικασία αντικατάστασης σκίπερ: πολλοί υποψήφιοι, επιλέγει ο
-- πελάτης — όχι πια «όποιος προλάβει πρώτος».
--
-- Πριν (0024/0026): μια πρόταση αντικατάστασης δούλευε με τον ΙΔΙΟ μηχανισμό
-- με κάθε άλλη πρόταση εργασίας — όποιος επαγγελματίας αποδεχόταν πρώτος
-- έπαιρνε αμέσως την κράτηση και χρεωνόταν αμέσως (claim_booking_request).
-- Ρητή, τεκμηριωμένη απόφαση τότε (0024): «ο πελάτης δεν βλέπει λίστα».
-- Αυτό αλλάζει τώρα, ΜΟΝΟ για αυτή την περίπτωση: πολλοί επαγγελματίες
-- μπορούν να δηλώσουν ενδιαφέρον χωρίς να «κλειδώνουν» τίποτα, ο πελάτης
-- τους βλέπει ανώνυμα (ίδια στοιχεία με το skipper_public της αναζήτησης)
-- και διαλέγει ο ίδιος. Η χρέωση γίνεται τη στιγμή που διαλέγει ο πελάτης,
-- όχι τη στιγμή που αποδέχεται ο επαγγελματίας.
--
-- Η «Δικό σου ναύλο» πρόταση (origin='admin_direct') ΔΕΝ αλλάζει καθόλου:
-- παραμένει πρώτος-φτάνει-πρώτος-παίρνει — είναι δουλειά του admin για τον
-- εαυτό του, όχι κράτηση πελάτη, και δεν υπάρχει «πελάτης» να διαλέξει.
--
-- Πώς αποφεύγονται διπλές χρεώσεις/αναθέσεις (§6 του αιτήματος):
--   * booking_requests: το 'open' -> 'matched' γίνεται μέσα σε SELECT ... FOR
--     UPDATE πάνω στην ίδια γραμμή· μια δεύτερη ταυτόχρονη επιλογή του ίδιου
--     πελάτη βρίσκει 'matched' και σταματά πριν αγγίξει πορτοφόλι ή bookings.
--   * pg_advisory_xact_lock πάνω στο request id — ίδιο μοτίβο ασφαλείας με
--     το ήδη υπάρχον claim_booking_request (εκεί κλειδώνει ανά skipper).
--   * exclude constraint (0001) στο bookings εμποδίζει επικαλυπτόμενη
--     κράτηση για τον ίδιο επαγγελματία ούτως ή άλλως.
--   * κάθε υποψήφιος ξανα-ελέγχεται (έγκριση, επικάλυψη, υπόλοιπο) τη
--     στιγμή της επιλογής, όχι μόνο τη στιγμή που δήλωσε ενδιαφέρον — μπορεί
--     να έχει περάσει καιρός ανάμεσα.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ο υποψήφιος δεν «κλειδώνει» τίποτα αποδεχόμενος, μόνο δηλώνει
--    ενδιαφέρον. Ξεχωριστή στήλη από το status: το status μένει 'pending'
--    μέχρι να αποφασίσει ο πελάτης· το candidate_at λέει ποιοι έχουν ήδη πει
--    «μέσα». (Ίδιο μοτίβο με το ήδη υπάρχον declined_at δίπλα στο status.)
-- ----------------------------------------------------------------------------
alter table booking_request_pings add column if not exists candidate_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2. Απάντηση επαγγελματία σε πρόταση αντικατάστασης — αντικαθιστά το
--    claim_booking_request/decline_booking_request ΜΟΝΟ για origin =
--    'admin_replacement'. Οι δύο άλλες προελεύσεις (client, admin_direct)
--    συνεχίζουν να περνούν από τα ήδη υπάρχοντα, αμετάβλητα.
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
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;

  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.origin <> 'admin_replacement' then raise exception 'not_a_replacement_offer'; end if;
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;
  if v_req.expires_at <= now() then raise exception 'request_expired'; end if;

  select * into v_ping from booking_request_pings
    where booking_request_id = p_request_id and skipper_id = p_skipper_id for update;
  if not found then raise exception 'not_pinged'; end if;
  if v_ping.status <> 'pending' then raise exception 'already_resolved'; end if;

  if not p_accept then
    update booking_request_pings set status = 'missed', declined_at = now() where id = v_ping.id;
    return;
  end if;

  -- Μπορεί να έχει καλυφθεί ήδη (π.χ. δεύτερη πρόταση όσο αυτή ήταν στον
  -- αέρα) — ίδιος έλεγχος με το claim_booking_request.
  if v_req.replaces_booking_id is not null and exists (
    select 1 from bookings r
    where r.replaces_booking_id = v_req.replaces_booking_id and r.status in ('confirmed', 'completed')
  ) then
    update booking_requests set status = 'cancelled' where id = p_request_id;
    raise exception 'already_covered';
  end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if v_skipper.deleted_at is not null then raise exception 'skipper_not_eligible'; end if;
  if v_req.crew_role = v_skipper.role then
    if v_skipper.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  else
    select * into v_secondary from skipper_secondary_roles
      where skipper_id = p_skipper_id and role = v_req.crew_role and deleted_at is null;
    if not found or v_secondary.approval_status <> 'approved' then raise exception 'skipper_not_eligible'; end if;
  end if;

  -- Ενημερωτικός έλεγχος τώρα, ώστε ο πελάτης να μη δει καν υποψήφιο που
  -- τελικά δεν μπορεί — ξανα-ελέγχεται στο client_select_replacement_
  -- candidate γιατί μπορεί να περάσει καιρός ως την επιλογή.
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

  update booking_request_pings set candidate_at = now() where id = v_ping.id;

  -- Ο πελάτης μαθαίνει ότι υπάρχει (τουλάχιστον) ένας υποψήφιος — μία
  -- ειδοποίηση ανά αποδοχή, ίδιο ελαφρύ μοτίβο με κάθε request_received.
  perform notify_user(
    v_req.client_id, 'replacement_candidate_available',
    jsonb_build_object('port', booking_place(v_req.departure_point, v_req.port_id, v_req.region_id)),
    '/platform/bookings?focus=' || v_req.replaces_booking_id
  );
end;
$$;
grant execute on function respond_to_replacement_offer(uuid, uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Το παλιό μονοπάτι κλείνει για προτάσεις αντικατάστασης — δύο μηχανισμοί
--    πάνω στο ίδιο ping θα σήμαιναν δύο πιθανούς νικητές για μία θέση.
--    (Ίδιο σώμα με το τωρινό claim_booking_request, μόνο ο έλεγχος origin
--    προστίθεται, αμέσως μετά το FOR UPDATE.)
-- ----------------------------------------------------------------------------
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
  if v_req.origin = 'admin_replacement' then raise exception 'use_replacement_flow'; end if;
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

-- decline_booking_request: ίδιος έλεγχος προέλευσης, στο ίδιο σημείο.
create or replace function decline_booking_request(p_request_id uuid, p_skipper_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_origin text;
begin
  if not exists (
    select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()
  ) then
    raise exception 'not_owner';
  end if;

  select origin into v_origin from booking_requests where id = p_request_id;
  if v_origin = 'admin_replacement' then raise exception 'use_replacement_flow'; end if;

  update booking_request_pings
    set status = 'missed', declined_at = now()
  where booking_request_id = p_request_id
    and skipper_id = p_skipper_id
    and status = 'pending';

  if not found then raise exception 'ping_not_open'; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Τι βλέπει ο πελάτης: οι τωρινοί υποψήφιοι, με τα ίδια ανώνυμα στοιχεία
--    που δείχνει η αναζήτηση πριν την αποκάλυψη (skipper_public) — ΚΑΝΕΝΑ
--    όνομα ή τηλέφωνο.
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
    and br.client_id = auth.uid()
  order by brp.candidate_at;
$$;
grant execute on function client_list_replacement_candidates(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Η επιλογή του πελάτη: κλειδώνει την ανάθεση, χρεώνει τον επιλεγμένο
--    επαγγελματία ΤΩΡΑ (όχι όταν είχε δηλώσει ενδιαφέρον), γράφει την
--    κράτηση, και ενημερώνει όσους δεν επιλέχθηκαν.
-- ----------------------------------------------------------------------------
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
begin
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));

  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.client_id <> auth.uid() then raise exception 'not_owner'; end if;
  if v_req.origin <> 'admin_replacement' then raise exception 'not_a_replacement_offer'; end if;
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;

  if v_req.replaces_booking_id is not null and exists (
    select 1 from bookings r
    where r.replaces_booking_id = v_req.replaces_booking_id and r.status in ('confirmed', 'completed')
  ) then
    update booking_requests set status = 'cancelled' where id = p_request_id;
    raise exception 'already_covered';
  end if;

  select * into v_ping from booking_request_pings
    where booking_request_id = p_request_id and skipper_id = p_skipper_id for update;
  if not found or v_ping.candidate_at is null or v_ping.status <> 'pending' then
    raise exception 'not_a_candidate';
  end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if v_skipper.approval_status <> 'approved' or v_skipper.deleted_at is not null then
    update booking_request_pings set status = 'missed' where id = v_ping.id;
    raise exception 'candidate_no_longer_eligible';
  end if;

  -- Ξανά, όχι μόνο στο accept: μπορεί να πέρασε καιρός ανάμεσα.
  select exists (
    select 1 from bookings b
    where b.skipper_id = p_skipper_id and b.status in ('confirmed', 'completed')
      and daterange(b.start_date, b.end_date, '[]') && daterange(v_req.start_date, v_req.end_date, '[]')
  ) into v_overlap;
  if v_overlap then
    update booking_request_pings set status = 'missed' where id = v_ping.id;
    raise exception 'candidate_no_longer_available';
  end if;

  select exists (
    select 1 from delivery_bookings
    where skipper_id = p_skipper_id and status = 'confirmed'
      and estimated_range && daterange(v_req.start_date, v_req.end_date, '[]')
  ) into v_overlap;
  if v_overlap then
    update booking_request_pings set status = 'missed' where id = v_ping.id;
    raise exception 'candidate_no_longer_available';
  end if;

  v_claim_fee := coalesce(v_req.claim_fee_amount, (select value from platform_settings where key = 'skipper_claim_fee'));
  select wallet_balance into v_wallet from users where id = v_skipper.user_id for update;
  if v_claim_fee > 0 and v_wallet < v_claim_fee then
    update booking_request_pings set status = 'missed' where id = v_ping.id;
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

  -- Ειδοποίηση σε όσους υποψηφίους ΔΕΝ επιλέχθηκαν, πριν κλείσουν οριστικά —
  -- μετά το bulk update παρακάτω δεν θα ξεχώριζαν πια από όσους ποτέ δεν
  -- απάντησαν.
  for v_loser in
    select brp.skipper_id, sp2.user_id
    from booking_request_pings brp join skipper_profiles sp2 on sp2.id = brp.skipper_id
    where brp.booking_request_id = p_request_id and brp.id <> v_ping.id
      and brp.status = 'pending' and brp.candidate_at is not null
  loop
    perform notify_user(
      v_loser.user_id, 'replacement_not_selected',
      jsonb_build_object('port', booking_place(v_req.departure_point, v_req.port_id, v_req.region_id)),
      '/platform/requests'
    );
  end loop;

  update booking_request_pings set status = 'claimed' where id = v_ping.id;
  update booking_request_pings set status = 'missed'
    where booking_request_id = p_request_id and id <> v_ping.id and status = 'pending';
  update booking_requests set status = 'matched' where id = p_request_id;

  return v_booking;
end;
$$;
grant execute on function client_select_replacement_candidate(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Η σελίδα «Κενά από ακυρώσεις» μετακόμισε στο «Αντικαταστάσεις» — ίδιος
--    σύνδεσμος να δείχνει στη νέα διεύθυνση (μόνο αυτό αλλάζει εδώ).
-- ----------------------------------------------------------------------------
create or replace function notify_booking_cancelled() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_payload jsonb; v_refund numeric;
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
    select case when new.replaces_booking_id is null then coalesce(fee_amount, 0) else 0 end
      into v_refund from booking_requests where id = new.booking_request_id;
    perform notify_user(
      new.client_id, 'booking_cancelled',
      v_payload || jsonb_build_object('by', 'professional', 'refund', coalesce(v_refund, 0)),
      '/platform/bookings?focus=' || new.id
    );
    perform notify_admins('coverage_needed', v_payload, '/platform/admin/replacements');
  end if;
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. admin_coverage_needed: + πόσοι έχουν ήδη δηλώσει υποψηφιότητα, για να
--    ξεχωρίζει «περιμένει απαντήσεις» από «έτοιμο για τον πελάτη» χωρίς
--    δεύτερη κλήση.
-- ----------------------------------------------------------------------------
drop function if exists admin_coverage_needed();
create function admin_coverage_needed()
returns table(
  booking_id uuid, client_id uuid, client_name text, client_phone text,
  port_id uuid, port_name text, start_date date, end_date date, crew_role crew_role,
  cancelled_at timestamptz, cancellation_reason text,
  offer_request_id uuid, offer_pending int, offer_candidates int
)
language sql stable security definer set search_path = public as $$
  select
    b.id, b.client_id, u.full_name, u.phone_number,
    b.port_id, booking_place(b.departure_point, b.port_id, b.region_id), b.start_date, b.end_date,
    coalesce(b.crew_role, sp.role, 'skipper'::crew_role),
    b.cancelled_at, b.cancellation_reason,
    o.id,
    coalesce((select count(*)::int from booking_request_pings x
              where x.booking_request_id = o.id and x.status = 'pending'), 0),
    coalesce((select count(*)::int from booking_request_pings x
              where x.booking_request_id = o.id and x.candidate_at is not null and x.status = 'pending'), 0)
  from bookings b
  join users u on u.id = b.client_id
  left join skipper_profiles sp on sp.id = b.skipper_id
  left join lateral (
    select br.id from booking_requests br
    where br.replaces_booking_id = b.id and br.status = 'open'
    limit 1
  ) o on true
  where is_admin()
    and b.status = 'cancelled_by_skipper'
    and b.end_date >= current_date
    and not exists (
      select 1 from bookings r
      where r.replaces_booking_id = b.id
        and r.status in ('confirmed', 'completed')
    )
  order by b.start_date;
$$;
grant execute on function admin_coverage_needed() to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Όλες οι υποθέσεις αντικατάστασης — ενεργές ΚΑΙ ολοκληρωμένες — με ένα
--    καθαρό, παράγωγο «στάδιο» ώστε ο admin να καταλαβαίνει με μια ματιά τι
--    συμβαίνει (§8 του αιτήματος). Καμία ξεχωριστή στήλη κατάστασης να
--    συντηρείται χειροκίνητα: το στάδιο υπολογίζεται κάθε φορά από τα ίδια
--    τα δεδομένα, όπως ήδη κάνει το admin_coverage_needed.
-- ----------------------------------------------------------------------------
drop function if exists admin_replacement_cases(boolean);
create function admin_replacement_cases(p_include_completed boolean default false)
returns table(
  booking_id uuid, client_id uuid, client_name text,
  port_id uuid, port_name text, start_date date, end_date date, crew_role crew_role,
  cancelled_at timestamptz, cancellation_reason text,
  offer_request_id uuid, offer_created_at timestamptz, offer_expires_at timestamptz,
  offer_recipients int, offer_pending int, offer_declined int, offer_candidates int,
  new_booking_id uuid, new_skipper_name text, confirmed_at timestamptz, charged numeric,
  stage text
)
language sql stable security definer set search_path = public as $$
  select
    b.id, b.client_id, u.full_name,
    b.port_id, booking_place(b.departure_point, b.port_id, b.region_id), b.start_date, b.end_date,
    coalesce(b.crew_role, sp.role, 'skipper'::crew_role),
    b.cancelled_at, b.cancellation_reason,
    o.id, o.created_at, o.expires_at,
    (select count(*)::int from booking_request_pings x where x.booking_request_id = o.id),
    (select count(*)::int from booking_request_pings x where x.booking_request_id = o.id and x.status = 'pending'),
    (select count(*)::int from booking_request_pings x where x.booking_request_id = o.id and x.declined_at is not null),
    (select count(*)::int from booking_request_pings x where x.booking_request_id = o.id and x.candidate_at is not null and x.status = 'pending'),
    r.id, coalesce(nullif(btrim(rsp.full_name), ''), ru.full_name), r.confirmed_at, r.skipper_claim_fee_amount,
    case
      when r.id is not null then 'completed'
      when o.id is null then 'needs_action'
      when (select count(*) from booking_request_pings x where x.booking_request_id = o.id and x.candidate_at is not null and x.status = 'pending') > 0 then 'awaiting_client'
      else 'awaiting_skippers'
    end
  from bookings b
  join users u on u.id = b.client_id
  left join skipper_profiles sp on sp.id = b.skipper_id
  left join lateral (
    select br.id, br.created_at, br.expires_at from booking_requests br
    where br.replaces_booking_id = b.id and br.origin = 'admin_replacement'
    order by br.created_at desc limit 1
  ) o on true
  left join bookings r on r.replaces_booking_id = b.id and r.status in ('confirmed', 'completed')
  left join skipper_profiles rsp on rsp.id = r.skipper_id
  left join users ru on ru.id = rsp.user_id
  where is_admin()
    and b.status = 'cancelled_by_skipper'
    and (p_include_completed or r.id is null)
  order by (r.id is null) desc, b.cancelled_at desc;
$$;
grant execute on function admin_replacement_cases(boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. Μία υπόθεση, όλη η ιστορία της — κάθε πρόταση που στάλθηκε γι' αυτήν
--    (όχι μόνο η τωρινή ανοιχτή), και για κάθε μία ποιος απάντησε τι.
-- ----------------------------------------------------------------------------
create or replace function admin_replacement_case_detail(p_booking_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select * from bookings where id = p_booking_id),
  offers as (
    select jsonb_agg(jsonb_build_object(
      'id', br.id, 'status', br.status, 'created_at', br.created_at, 'expires_at', br.expires_at,
      'claim_fee_amount', br.claim_fee_amount, 'note', br.note,
      'recipients', (
        select jsonb_agg(jsonb_build_object(
          'skipper_id', brp.skipper_id,
          'name', coalesce(nullif(btrim(sp.full_name), ''), su.full_name),
          'sent_at', brp.sent_at,
          'candidate_at', brp.candidate_at,
          'declined_at', brp.declined_at,
          'status', brp.status
        ) order by brp.sent_at)
        from booking_request_pings brp
        join skipper_profiles sp on sp.id = brp.skipper_id
        join users su on su.id = sp.user_id
        where brp.booking_request_id = br.id
      )
    ) order by br.created_at desc) as v
    from booking_requests br
    where br.replaces_booking_id = p_booking_id and br.origin = 'admin_replacement'
  ),
  new_booking as (
    select jsonb_build_object(
      'id', r.id, 'skipper_id', r.skipper_id,
      'skipper_name', coalesce(nullif(btrim(rsp.full_name), ''), ru.full_name),
      'confirmed_at', r.confirmed_at, 'charged', r.skipper_claim_fee_amount, 'status', r.status,
      'cancelled_at', r.cancelled_at, 'cancellation_reason', r.cancellation_reason
    ) as v
    from bookings r
    left join skipper_profiles rsp on rsp.id = r.skipper_id
    left join users ru on ru.id = rsp.user_id
    where r.replaces_booking_id = p_booking_id
    order by r.created_at desc limit 1
  )
  select jsonb_build_object(
    'booking', (select to_jsonb(b) || jsonb_build_object('place', booking_place(b.departure_point, b.port_id, b.region_id)) from b),
    'client_name', (select full_name from users where id = (select client_id from b)),
    'offers', coalesce((select v from offers), '[]'::jsonb),
    'new_booking', (select v from new_booking)
  )
  where (select is_admin());
$$;
grant execute on function admin_replacement_case_detail(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Νέος μετρητής dashboard: υποθέσεις όπου υπάρχουν υποψήφιοι και περιμένουν
--    τον πελάτη, όχι τον admin — ξεχωριστό από «χρειάζονται ενέργεια».
-- ----------------------------------------------------------------------------
create or replace function admin_overview()
returns jsonb
language sql stable security definer set search_path = public as $$
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
    'coverage_needed',    (select count(*) from admin_coverage_needed() where offer_request_id is null),
    'coverage_offered',   (select count(*) from admin_coverage_needed() where offer_request_id is not null),
    'replacement_awaiting_client', (select count(*) from admin_coverage_needed() where offer_candidates > 0),
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
                             and not skipper_is_search_visible(sp.id)),
    'pending_verification', (select count(*) from users
                             where phone_verified_at is null and status <> 'deleted' and role <> 'admin'),
    'pending_photos',   (select count(*) from users
                         where photo_url is not null and photo_reviewed_at is null and status <> 'deleted'),
    'suspended_count', (select count(*) from users where status = 'suspended')
  ) end;
$$;
grant execute on function admin_overview() to authenticated;
