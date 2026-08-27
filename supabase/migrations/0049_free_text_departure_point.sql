-- ============================================================================
-- Ζητήθηκε: το συγκεκριμένο λιμάνι αναχώρησης να γίνεται ελεύθερο κείμενο
-- (π.χ. "Άλιμος", "Αίγινα") αντί για επιλογή από τη λίστα λιμανιών — μικρά ή
-- μη καταλογογραφημένα σημεία δεν πρέπει να αποκλείονται. Η ΠΕΡΙΟΧΗ
-- (Σαρωνικός, Κυκλάδες...) παραμένει δομημένη επιλογή, αφού είναι αυτή που
-- πραγματικά καθορίζει ποιοι επαγγελματίες ταιριάζουν.
--
-- Ο κατάλογος λιμανιών (ports) ΔΕΝ καταργείται — τον χρησιμοποιεί ακόμα το
-- admin console (OfferComposer, admin_search_availability κ.λπ.) για δικές
-- του, χειροκίνητες αναθέσεις, όπου έχει νόημα το ακριβές λιμάνι.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

-- ---- 1. Νέες στήλες: region_id (η περιοχή, δομημένη) + departure_point
-- (ελεύθερο κείμενο). port_id γίνεται προαιρετικό — μένει υποχρεωτικό μόνο
-- λογικά, όχι στη βάση, για τις παλιές/admin εγγραφές. ----
alter table booking_requests add column if not exists region_id uuid references regions(id);
alter table booking_requests add column if not exists departure_point text;
alter table booking_requests alter column port_id drop not null;

alter table bookings add column if not exists region_id uuid references regions(id);
alter table bookings add column if not exists departure_point text;
alter table bookings alter column port_id drop not null;

-- Backfill: κάθε ήδη υπάρχουσα εγγραφή έχει port_id, άρα παίρνει την περιοχή
-- εκείνου του λιμανιού.
update booking_requests set region_id = p.region_id
from ports p
where p.id = booking_requests.port_id and booking_requests.region_id is null;

update bookings set region_id = p.region_id
from ports p
where p.id = bookings.port_id and bookings.region_id is null;

-- ---- 2. Trigger: όταν δίνεται port_id (admin ροές) χωρίς ρητή region_id,
-- συμπληρώνεται μόνη της από το λιμάνι — το admin console δεν χρειάζεται να
-- μάθει τίποτα για regions. ----
create or replace function trg_fill_region_from_port() returns trigger
language plpgsql as $$
begin
  if new.region_id is null and new.port_id is not null then
    select region_id into new.region_id from ports where id = new.port_id;
  end if;
  return new;
end;
$$;

drop trigger if exists fill_region_booking_requests on booking_requests;
create trigger fill_region_booking_requests
  before insert or update of port_id, region_id on booking_requests
  for each row execute function trg_fill_region_from_port();

drop trigger if exists fill_region_bookings on bookings;
create trigger fill_region_bookings
  before insert or update of port_id, region_id on bookings
  for each row execute function trg_fill_region_from_port();

-- ---- 3. Κάθε αίτημα/κράτηση πρέπει να έχει πραγματικό σημείο αναχώρησης:
-- είτε καταλογογραφημένο λιμάνι (admin), είτε περιοχή + ελεύθερο κείμενο
-- (πελάτης). ----
alter table booking_requests drop constraint if exists booking_requests_departure_check;
alter table booking_requests add constraint booking_requests_departure_check
  check (port_id is not null or (region_id is not null and departure_point is not null));

alter table bookings drop constraint if exists bookings_departure_check;
alter table bookings add constraint bookings_departure_check
  check (port_id is not null or (region_id is not null and departure_point is not null));

-- ---- 4. net_availability: προστίθεται p_region_id (προαιρετικό, additive) —
-- το ίδιο μάθημα με το 0044/0045/0046: μια αλλαγή υπογραφής χρειάζεται drop
-- πρώτα, αλλιώς η Postgres φτιάχνει δεύτερη, overloaded συνάρτηση. Το drop
-- εδώ είναι ασφαλές: μετά το create, οι υπάρχουσες κλήσεις με 2 ορίσματα
-- συνεχίζουν να δουλεύουν κανονικά (το 3ο παίρνει το default). ----
drop function if exists net_availability(uuid, uuid);

create or replace function net_availability(
  p_skipper_id uuid,
  p_port_id uuid default null,
  p_region_id uuid default null
)
returns datemultirange
language sql stable as $$
  select
    coalesce((
      select range_agg(daterange(w.start_date, w.end_date, '[]'))
      from availability_windows w
      where w.skipper_id = p_skipper_id
        and (
          (p_port_id is null and p_region_id is null)
          or exists (
            select 1
            from availability_window_regions wr
            where wr.window_id = w.id
              and (
                (p_region_id is not null and wr.region_id = p_region_id)
                or (
                  p_region_id is null and p_port_id is not null and exists (
                    select 1 from ports p where p.id = p_port_id and p.region_id = wr.region_id
                  )
                )
              )
          )
        )
    ), '{}'::datemultirange)
    -
    coalesce((
      select range_agg(daterange(b.start_date, b.end_date, '[]'))
      from availability_blocks b
      where b.skipper_id = p_skipper_id
    ), '{}'::datemultirange);
$$;

-- ---- 5. search_available_skippers: p_port_id -> p_region_id. Ο τύπος
-- (uuid) και η θέση μένουν ίδιοι, αλλά η Postgres αρνείται να αλλάξει το
-- ΟΝΟΜΑ μιας παραμέτρου με create or replace — χρειάζεται drop πρώτα, ίδιο
-- μάθημα με τα προηγούμενα. ----
drop function if exists search_available_skippers(date, date, uuid, uuid, numeric, text, crew_role, uuid);

create or replace function search_available_skippers(
  p_start date,
  p_end date,
  p_region_id uuid,
  p_boat_type_id uuid,
  p_max_price numeric default null,
  p_gender text default null,
  p_crew_role crew_role default 'skipper',
  p_language_id uuid default null
) returns setof skipper_public
language sql stable security definer set search_path = public as $$
  select sp.* from skipper_public sp
  where sp.role = p_crew_role
    and (
      p_crew_role <> 'skipper' or exists (
        select 1 from skipper_boat_types bt where bt.skipper_id = sp.id and bt.boat_type_id = p_boat_type_id
      )
    )
    and not exists (
      select 1 from skipper_profiles own where own.id = sp.id and own.user_id = auth.uid()
    )
    and net_availability(sp.id, null, p_region_id) @> daterange(p_start, p_end, '[]')
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
    and (p_max_price is null or sp.price_per_day <= p_max_price)
    and (p_gender is null or sp.gender = p_gender)
    and (
      p_language_id is null or exists (
        select 1 from skipper_languages sl where sl.skipper_id = sp.id and sl.language_id = p_language_id
      )
    )
  order by case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
           skipper_rank_score(
             sp.rating_avg,
             sp.rating_count,
             cancellation_standing(sp.id),
             skipper_response_rate(sp.id)
           ) desc;
$$;

-- ---- 6. claim_booking_request: αντιγράφει τώρα και region_id/departure_point
-- στην κράτηση, ίδια λογική με port_id/boat_type_id. Ίδια υπογραφή — απλό
-- create or replace. ----
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
