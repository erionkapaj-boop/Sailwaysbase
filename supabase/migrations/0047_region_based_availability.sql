-- ============================================================================
-- Ζητήθηκε: η διαθεσιμότητα του επαγγελματία να δηλώνεται ανά ΠΕΡΙΟΧΗ
-- (Αττική, Κυκλάδες, Ιόνιο...), όχι ανά συγκεκριμένο λιμάνι — ο πελάτης
-- συνεχίζει να διαλέγει συγκεκριμένο λιμάνι αναχώρησης, και το matching
-- ελέγχει αν η περιοχή ΕΚΕΙΝΟΥ του λιμανιού περιλαμβάνεται στις περιοχές που
-- έχει δηλώσει ο επαγγελματίας — χωρίς ο επαγγελματίας να έχει δηλώσει ποτέ
-- το συγκεκριμένο λιμάνι. Ισχύει για όλες τις ιδιότητες πληρώματος.
--
-- Επιβεβαιώθηκε ρητά: αυτό αλλάζει ΜΟΝΟ ποιοι θεωρούνται "διαθέσιμοι" — ο
-- πελάτης συνεχίζει να βλέπει λίστα με συγκεκριμένους υποψήφιους (φωτογραφία,
-- αξιολόγηση, τιμή), διαλέγει ο ίδιος 1+ από αυτούς, και πληρώνει το fee για
-- να σταλεί το καμπανάκι μόνο σε αυτούς — καμία αλλαγή εκεί.
--
-- Επίσης προστίθενται δύο νέα πεδία στο αίτημα πελάτη (όλες οι ιδιότητες):
-- αριθμός ατόμων, και αν υπάρχει ιδιωτική καμπίνα για τον επαγγελματίο.
--
-- Idempotent σε όλο το script — ασφαλές να τρέξει ξανά αν κάτι σκάσει στη
-- μέση.
-- ============================================================================

-- ---- 1. regions: ίδιο μοτίβο με ports/boat_types/languages/nationalities.
-- Σπαρμένο από τις περιοχές που ΗΔΗ υπάρχουν σήμερα στη στήλη ports.region —
-- το πραγματικό, ζωντανό σύνολο, όχι μαντεμένη λίστα. ----
create table if not exists regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table regions enable row level security;

drop policy if exists "lookups readable by everyone" on regions;
create policy "lookups readable by everyone" on regions for select using (true);

drop policy if exists "lookups admin write" on regions;
create policy "lookups admin write" on regions for all using (is_admin()) with check (is_admin());

insert into regions (name)
select distinct region from ports where region is not null
on conflict (name) do nothing;

-- ---- 2. ports.region_id αντικαθιστά το ports.region (free text) ----
alter table ports add column if not exists region_id uuid references regions(id);

update ports set region_id = r.id
from regions r
where r.name = ports.region and ports.region_id is null;

alter table ports alter column region_id set not null;
alter table ports drop column if exists region;

-- ---- 3. availability_window_regions αντικαθιστά το availability_window_ports
-- — ο επαγγελματίας δηλώνει πλέον περιοχές, όχι λιμάνια, ανά διάστημα. ----
create table if not exists availability_window_regions (
  window_id uuid not null references availability_windows(id) on delete cascade,
  region_id uuid not null references regions(id) on delete cascade,
  primary key (window_id, region_id)
);

alter table availability_window_regions enable row level security;

drop policy if exists "window regions public read" on availability_window_regions;
create policy "window regions public read" on availability_window_regions for select using (true);

drop policy if exists "window regions owner write" on availability_window_regions;
create policy "window regions owner write" on availability_window_regions for all
  using (
    exists (select 1 from availability_windows w where w.id = window_id and w.skipper_id = my_skipper_profile_id())
  )
  with check (
    exists (select 1 from availability_windows w where w.id = window_id and w.skipper_id = my_skipper_profile_id())
  );

-- Backfill χωρίς απώλεια: μια ήδη δηλωμένη κάλυψη σε συγκεκριμένα λιμάνια
-- μετατρέπεται στην περιοχή τους (π.χ. "Αλιμος, Λαύριο" → "Αττική") — κανένας
-- επαγγελματίας δεν χρειάζεται να ξαναδηλώσει τίποτα χειροκίνητα.
insert into availability_window_regions (window_id, region_id)
select distinct wp.window_id, p.region_id
from availability_window_ports wp
join ports p on p.id = wp.port_id
on conflict do nothing;

-- Ένα παλιό "all_ports" παράθυρο καλύπτει, εξ ορισμού, κάθε περιοχή.
insert into availability_window_regions (window_id, region_id)
select w.id, r.id
from availability_windows w cross join regions r
where w.all_ports
on conflict do nothing;

drop table if exists availability_window_ports;
alter table availability_windows drop column if exists all_ports;

-- ---- 4. net_availability: ίδια υπογραφή (καμία αλλαγή στους καλούντες —
-- search_available_skippers, admin_search_availability,
-- has_future_availability — μένουν όλες όπως είναι), αλλάζει μόνο πώς
-- υπολογίζεται εσωτερικά η κάλυψη ενός λιμανιού: μέσω της περιοχής του. ----
create or replace function net_availability(p_skipper_id uuid, p_port_id uuid default null)
returns datemultirange
language sql stable as $$
  select
    coalesce((
      select range_agg(daterange(w.start_date, w.end_date, '[]'))
      from availability_windows w
      where w.skipper_id = p_skipper_id
        and (
          p_port_id is null
          or exists (
            select 1
            from availability_window_regions wr
            join ports p on p.region_id = wr.region_id
            where wr.window_id = w.id and p.id = p_port_id
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

-- ---- 5. Δύο νέα πεδία στο αίτημα πελάτη, για όλες τις ιδιότητες. ----
alter table booking_requests add column if not exists party_size int check (party_size is null or party_size > 0);
alter table booking_requests add column if not exists private_cabin boolean;

-- Αντιγράφονται στην κράτηση μόλις γίνει αποδοχή — ίδιο μοτίβο με το
-- port_id/boat_type_id, που ήδη αντιγράφονται από το αίτημα στην κράτηση σε
-- αυτό το σημείο, ώστε οι όροι της κράτησης να μένουν σταθεροί ό,τι κι αν
-- αλλάξει αργότερα στο αίτημα.
alter table bookings add column if not exists party_size int;
alter table bookings add column if not exists private_cabin boolean;

-- ---- 6. claim_booking_request: ίδια υπογραφή, το insert τώρα αντιγράφει και
-- τα δύο νέα πεδία. ----
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
    booking_request_id, client_id, skipper_id, start_date, end_date, port_id, boat_type_id,
    party_size, private_cabin,
    skipper_claim_fee_amount, skipper_claim_paid_at, confirmed_at, status,
    replaces_booking_id, assigned_by
  ) values (
    p_request_id, v_req.client_id, p_skipper_id, v_req.start_date, v_req.end_date, v_req.port_id, v_req.boat_type_id,
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
