-- ============================================================================
-- Ανοιχτά αιτήματα (0124, docs/BACKLOG.md).
--
-- Ο πελάτης αφήνει αίτημα χωρίς να διαλέξει επαγγελματίες. Το αίτημα φαίνεται
-- σε δημόσιο πίνακα (ανώνυμα, και χωρίς λογαριασμό) και οι επαγγελματίες το
-- διεκδικούν. Ο πελάτης διαλέγει ανάμεσα στους ανώνυμους διεκδικητές και τότε
-- πληρώνουν και οι δύο 1 credit, όπως σε κάθε άλλη αποδοχή.
--
-- Credits (το κρίσιμο σημείο):
-- - Αίτημα πίνακα = booking_requests με board_open = true. Το credit του πελάτη
--   δεσμεύεται με την ανάρτηση (0122: fee_paid_at χωρίς client_charged_at) και
--   χρεώνεται μόνο όταν διαλέξει.
-- - Η διεκδίκηση δεν δεσμεύει και δεν χρεώνει τίποτα. Ένα credit επαγγελματία
--   μπορεί να στηρίζει πολλές διεκδικήσεις: χρεώνεται μία φορά, όταν διαλεχτεί.
--   Οι υπόλοιπες διεκδικήσεις του ίδιου ανθρώπου μένουν «ενεργές» αλλά δεν
--   μπορούν να διαλεχτούν όσο το υπόλοιπο δεν φτάνει (υπολογίζεται τη στιγμή
--   της επιλογής και της λίστας, όχι αποθηκευμένο) και ξαναζωντανεύουν με
--   αγορά credits, χωρίς κώδικα αναβίωσης.
-- - Εξωτερικός υποψήφιος (τον προσθέτει ο διαχειριστής, χωρίς λογαριασμό):
--   αν διαλεχτεί, χρεώνεται μόνο ο πελάτης. Το τέλος που δεν εισπράχθηκε
--   γράφεται στη διεκδίκηση (uncollected_fee) για να φαίνεται χωριστά.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ρυθμίσεις
-- ---------------------------------------------------------------------------
insert into platform_settings (key, value) values
  ('board_max_days', 10),
  ('board_after_start_days', 1),
  ('board_max_claims', 10)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Στήλες αιτήματος
-- ---------------------------------------------------------------------------
alter table booking_requests add column if not exists board_open boolean not null default false;
alter table booking_requests add column if not exists board_posted_at timestamptz;

create index if not exists booking_requests_board
  on booking_requests (start_date, id) where board_open and status = 'open';

-- Ο πελάτης δεν μπορεί να στήσει αίτημα πίνακα με απευθείας εισαγωγή.
create or replace function guard_booking_request_insert() returns trigger
language plpgsql security definer set search_path = public as $$
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
  new.board_open := false;
  new.board_posted_at := null;
  return new;
end;
$$;

-- Η δέσμευση ισχύει για αίτημα πίνακα έως τη λήξη του (expires_at), ακόμα κι
-- αν το ταξίδι ξεκίνησε: η διεκδίκηση επιτρέπεται και την επόμενη μέρα.
create or replace function user_reserved_credits(p_user_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(fee_amount), 0) from booking_requests
   where client_id = p_user_id and origin = 'client' and status = 'open'
     and fee_paid_at is not null and client_charged_at is null
     and expires_at > now() and (start_date >= current_date or board_open);
$$;
revoke execute on function user_reserved_credits(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Διεκδικήσεις
-- ---------------------------------------------------------------------------
create table if not exists open_request_claims (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references booking_requests(id) on delete cascade,
  skipper_id uuid references skipper_profiles(id),
  external_name text check (external_name is null or char_length(external_name) between 1 and 120),
  external_phone text check (external_phone is null or char_length(external_phone) between 1 and 40),
  external_note text check (external_note is null or char_length(external_note) <= 1000),
  added_by uuid references users(id),
  status text not null default 'active' check (status in ('active', 'withdrawn', 'closed', 'chosen')),
  uncollected_fee numeric check (uncollected_fee is null or uncollected_fee >= 0),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((skipper_id is not null) <> (external_name is not null)),
  unique (request_id, skipper_id)
);
create unique index if not exists open_request_claims_one_chosen
  on open_request_claims (request_id) where status = 'chosen';
create index if not exists open_request_claims_skipper on open_request_claims (skipper_id, status);
create index if not exists open_request_claims_request on open_request_claims (request_id, status);

alter table open_request_claims enable row level security;
revoke all on open_request_claims from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Βοηθητικά
-- ---------------------------------------------------------------------------
create or replace function board_place(p_req booking_requests) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(p_req.departure_point), ''), (select name from regions where id = p_req.region_id));
$$;
revoke execute on function board_place(booking_requests) from public, anon, authenticated;

create or replace function board_claim_fee(p_req booking_requests) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(p_req.claim_fee_amount, (select value from platform_settings where key = 'skipper_claim_fee'));
$$;
revoke execute on function board_claim_fee(booking_requests) from public, anon, authenticated;

-- Κωδικός σφάλματος αν ο επαγγελματίας δεν μπορεί να αναλάβει το αίτημα τώρα,
-- αλλιώς null. Το ίδιο κριτήριο για διεκδίκηση, λίστα πελάτη και επιλογή.
create or replace function board_skipper_problem(p_req booking_requests, p_skipper_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_skipper skipper_profiles%rowtype;
  v_secondary skipper_secondary_roles%rowtype;
  v_fee numeric := board_claim_fee(p_req);
  v_wallet numeric;
begin
  select * into v_skipper from skipper_profiles where id = p_skipper_id;
  if not found or v_skipper.deleted_at is not null then return 'skipper_not_eligible'; end if;
  if p_req.crew_role = v_skipper.role then
    if v_skipper.approval_status <> 'approved' then return 'skipper_not_eligible'; end if;
  else
    select * into v_secondary from skipper_secondary_roles
      where skipper_id = p_skipper_id and role = p_req.crew_role and deleted_at is null;
    if not found or v_secondary.approval_status <> 'approved' then return 'skipper_not_eligible'; end if;
  end if;
  if v_skipper.user_id = p_req.client_id then return 'own_request'; end if;
  if exists (
    select 1 from bookings
     where skipper_id = p_skipper_id and status in ('confirmed', 'completed')
       and daterange(start_date, end_date, '[]') && daterange(p_req.start_date, p_req.end_date, '[]')
  ) or exists (
    select 1 from delivery_bookings
     where skipper_id = p_skipper_id and status = 'confirmed'
       and estimated_range && daterange(p_req.start_date, p_req.end_date, '[]')
  ) then return 'date_overlap'; end if;
  if v_fee > 0 then
    select wallet_balance into v_wallet from users where id = v_skipper.user_id;
    if v_wallet - user_reserved_credits(v_skipper.user_id) < v_fee then return 'insufficient_wallet'; end if;
  end if;
  return null;
end;
$$;
revoke execute on function board_skipper_problem(booking_requests, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Ο πελάτης αφήνει αίτημα
-- ---------------------------------------------------------------------------
create or replace function post_open_request(
  p_start date, p_end date, p_region_id uuid, p_departure_point text, p_arrival_point text,
  p_boat_type_id uuid, p_crew_role crew_role, p_party_size int default null,
  p_private_cabin boolean default null, p_note text default null)
returns booking_requests language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_fee numeric;
  v_wallet numeric;
  v_expires timestamptz;
  v_req booking_requests%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from client_profiles where user_id = v_uid) then raise exception 'not_a_client'; end if;
  if exists (select 1 from users where id = v_uid and phone_verified_at is null and role <> 'admin' and not is_staff_admin) then
    raise exception 'account_not_verified';
  end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'invalid_dates'; end if;
  if p_start < current_date then raise exception 'start_in_past'; end if;
  if p_end - p_start > 60 then raise exception 'trip_too_long'; end if;
  if p_party_size is not null and (p_party_size < 1 or p_party_size > 50) then raise exception 'party_too_large'; end if;
  if p_region_id is null or p_boat_type_id is null or p_crew_role is null then raise exception 'invalid_request'; end if;
  if nullif(btrim(p_departure_point), '') is null or nullif(btrim(p_arrival_point), '') is null then raise exception 'invalid_request'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'note_too_long'; end if;

  perform pg_advisory_xact_lock(hashtext('wallet:' || v_uid::text));
  if (select count(*) from booking_requests
       where client_id = v_uid and origin = 'client' and fee_paid_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_requests';
  end if;

  v_fee := (select value from platform_settings where key = 'client_request_fee');
  select wallet_balance into v_wallet from users where id = v_uid for update;
  if v_wallet - user_reserved_credits(v_uid) < v_fee then raise exception 'insufficient_wallet'; end if;

  v_expires := least(
    now() + (select value from platform_settings where key = 'board_max_days') * interval '1 day',
    (p_start + ((select value from platform_settings where key = 'board_after_start_days')::int + 1))::timestamptz);

  perform set_config('platform.trusted', 'true', true);
  insert into booking_requests (
    client_id, origin, start_date, end_date, region_id, departure_point, arrival_point, boat_type_id,
    crew_role, party_size, private_cabin, note, fee_amount, fee_paid_at, expires_at,
    board_open, board_posted_at)
  values (
    v_uid, 'client', p_start, p_end, p_region_id, nullif(btrim(p_departure_point), ''), nullif(btrim(p_arrival_point), ''),
    p_boat_type_id, p_crew_role, p_party_size, p_private_cabin, nullif(btrim(p_note), ''),
    v_fee, now(), v_expires, true, now())
  returning * into v_req;
  return v_req;
end;
$$;
revoke execute on function post_open_request(date, date, uuid, text, text, uuid, crew_role, int, boolean, text) from public, anon;
grant execute on function post_open_request(date, date, uuid, text, text, uuid, crew_role, int, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Δημόσιος πίνακας (ανώνυμα, χωρίς λογαριασμό). Κοντινότερη ημερομηνία
--    πρώτα· σελιδοποίηση με δείκτη (start_date, id).
-- ---------------------------------------------------------------------------
create or replace function board_requests(
  p_role crew_role default null, p_after_start date default null, p_after_id uuid default null, p_limit int default 20)
returns table (
  id uuid, start_date date, end_date date, region_id uuid, departure_point text, arrival_point text,
  boat_type_id uuid, crew_role crew_role, party_size int, private_cabin boolean, note text,
  claims_count int, claimed_by_me boolean, closes_at timestamptz)
language sql stable security definer set search_path = public as $$
  select br.id, br.start_date, br.end_date, br.region_id, br.departure_point, br.arrival_point,
         br.boat_type_id, br.crew_role, br.party_size, br.private_cabin, br.note,
         (select count(*)::int from open_request_claims c where c.request_id = br.id and c.status = 'active'),
         coalesce(exists (select 1 from open_request_claims c join skipper_profiles sp on sp.id = c.skipper_id
                           where c.request_id = br.id and c.status = 'active' and sp.user_id = auth.uid()), false),
         br.expires_at
    from booking_requests br
   where br.board_open and br.status = 'open' and br.expires_at > now()
     and (p_role is null or br.crew_role = p_role)
     and (p_after_start is null or (br.start_date, br.id) > (p_after_start, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000')))
   order by br.start_date, br.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function board_requests(crew_role, date, uuid, int) from public;
grant execute on function board_requests(crew_role, date, uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Διεκδίκηση από επαγγελματία (χωρίς δέσμευση, χωρίς χρέωση)
-- ---------------------------------------------------------------------------
create or replace function claim_board_request(p_request_id uuid, p_skipper_id uuid)
returns open_request_claims language plpgsql security definer set search_path = public as $$
declare
  v_req booking_requests%rowtype;
  v_problem text;
  v_claim open_request_claims%rowtype;
  v_had boolean;
  v_max int := (select value from platform_settings where key = 'board_max_claims')::int;
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;

  select * into v_req from booking_requests where id = p_request_id for update;
  if not found or not v_req.board_open then raise exception 'request_not_found'; end if;
  if v_req.status <> 'open' or v_req.expires_at <= now() then raise exception 'request_not_open'; end if;

  v_problem := board_skipper_problem(v_req, p_skipper_id);
  if v_problem is not null then raise exception '%', v_problem; end if;

  select * into v_claim from open_request_claims where request_id = p_request_id and skipper_id = p_skipper_id for update;
  v_had := found;
  if v_had and v_claim.status = 'active' then return v_claim; end if;
  if v_had and v_claim.status in ('chosen', 'closed') then raise exception 'already_resolved'; end if;

  if (select count(*) from open_request_claims where request_id = p_request_id and status = 'active') >= v_max then
    raise exception 'too_many_claims';
  end if;

  perform set_config('platform.trusted', 'true', true);
  if v_had then
    update open_request_claims set status = 'active', resolved_at = null, created_at = now()
     where id = v_claim.id returning * into v_claim;
  else
    insert into open_request_claims (request_id, skipper_id) values (p_request_id, p_skipper_id)
      returning * into v_claim;
  end if;

  perform notify_user(v_req.client_id, 'board_claim_received',
    jsonb_build_object('request_id', v_req.id, 'place', board_place(v_req), 'start', v_req.start_date,
                       'end', v_req.end_date, 'role', v_req.crew_role),
    '/platform/requests');
  return v_claim;
end;
$$;
revoke execute on function claim_board_request(uuid, uuid) from public, anon;
grant execute on function claim_board_request(uuid, uuid) to authenticated;

create or replace function withdraw_board_claim(p_request_id uuid, p_skipper_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;
  perform set_config('platform.trusted', 'true', true);
  update open_request_claims set status = 'withdrawn', resolved_at = now()
   where request_id = p_request_id and skipper_id = p_skipper_id and status = 'active';
end;
$$;
revoke execute on function withdraw_board_claim(uuid, uuid) from public, anon;
grant execute on function withdraw_board_claim(uuid, uuid) to authenticated;

-- Οι διεκδικήσεις του επαγγελματία, με την κατάστασή τους.
create or replace function my_board_claims()
returns table (
  claim_id uuid, request_id uuid, skipper_id uuid, state text, start_date date, end_date date,
  region_id uuid, departure_point text, arrival_point text, boat_type_id uuid, crew_role crew_role,
  claimed_at timestamptz, closes_at timestamptz, needs_credit boolean)
language sql stable security definer set search_path = public as $$
  select c.id, br.id, c.skipper_id,
         case when c.status = 'active' and (br.status <> 'open' or br.expires_at <= now()) then 'closed' else c.status end,
         br.start_date, br.end_date, br.region_id, br.departure_point, br.arrival_point, br.boat_type_id, br.crew_role,
         c.created_at, br.expires_at,
         (c.status = 'active' and br.status = 'open' and br.expires_at > now()
            and board_skipper_problem(br, c.skipper_id) = 'insufficient_wallet')
    from open_request_claims c
    join skipper_profiles sp on sp.id = c.skipper_id and sp.user_id = auth.uid()
    join booking_requests br on br.id = c.request_id
   order by br.start_date, c.created_at;
$$;
revoke execute on function my_board_claims() from public, anon;
grant execute on function my_board_claims() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Ο πελάτης βλέπει τους ανώνυμους διεκδικητές και διαλέγει
-- ---------------------------------------------------------------------------
create or replace function client_list_board_claims(p_request_id uuid)
returns table (claim_id uuid, skipper_id uuid, is_external boolean, external_note text, claimed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.skipper_id, c.skipper_id is null, c.external_note, c.created_at
    from open_request_claims c
    join booking_requests br on br.id = c.request_id
   where c.request_id = p_request_id and br.client_id = auth.uid() and br.board_open
     and br.status = 'open' and br.expires_at > now() and c.status = 'active'
     and (c.skipper_id is null or board_skipper_problem(br, c.skipper_id) is null)
   order by c.created_at;
$$;
revoke execute on function client_list_board_claims(uuid) from public, anon;
grant execute on function client_list_board_claims(uuid) to authenticated;

create or replace function client_choose_board_claim(p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_claim open_request_claims%rowtype;
  v_req booking_requests%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_booking bookings%rowtype;
  v_fee numeric;
  v_problem text;
  v_client_wallet numeric;
begin
  select * into v_claim from open_request_claims where id = p_claim_id;
  if not found then raise exception 'claim_not_found'; end if;

  select * into v_req from booking_requests where id = v_claim.request_id for update;
  if v_req.client_id <> auth.uid() then raise exception 'not_owner'; end if;
  if not v_req.board_open then raise exception 'claim_not_found'; end if;
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;
  if v_req.expires_at <= now() then raise exception 'request_expired'; end if;

  select * into v_claim from open_request_claims where id = p_claim_id for update;
  if v_claim.status <> 'active' then raise exception 'claim_not_active'; end if;

  if v_req.client_charged_at is not null then raise exception 'already_paid_or_closed'; end if;
  if v_req.fee_amount > 0 then
    select wallet_balance into v_client_wallet from users where id = v_req.client_id for update;
    if v_client_wallet < v_req.fee_amount then raise exception 'client_cannot_pay'; end if;
  end if;

  perform set_config('platform.trusted', 'true', true);

  if v_claim.skipper_id is not null then
    perform pg_advisory_xact_lock(hashtext(v_claim.skipper_id::text));
    select * into v_skipper from skipper_profiles where id = v_claim.skipper_id for update;
    perform 1 from users where id = v_skipper.user_id for update;
    v_problem := board_skipper_problem(v_req, v_claim.skipper_id);
    if v_problem is not null then raise exception '%', case when v_problem = 'insufficient_wallet' then 'claimant_cannot_pay' else v_problem end; end if;
    v_fee := board_claim_fee(v_req);

    insert into bookings (
      booking_request_id, client_id, skipper_id, start_date, end_date, port_id, region_id, departure_point, arrival_point, boat_type_id,
      party_size, private_cabin, crew_role,
      skipper_claim_fee_amount, skipper_claim_paid_at, confirmed_at, status, assigned_by
    ) values (
      v_req.id, v_req.client_id, v_claim.skipper_id, v_req.start_date, v_req.end_date, v_req.port_id, v_req.region_id,
      v_req.departure_point, v_req.arrival_point, v_req.boat_type_id,
      v_req.party_size, v_req.private_cabin, v_req.crew_role,
      v_fee, now(), now(), 'confirmed', v_req.created_by
    ) returning * into v_booking;

    if v_fee > 0 then
      update users set wallet_balance = wallet_balance - v_fee where id = v_skipper.user_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_request_id, related_booking_id)
        values (v_skipper.user_id, 'claim_fee', -v_fee, v_req.id, v_booking.id);
    end if;
  end if;

  if v_req.fee_amount > 0 then
    update users set wallet_balance = wallet_balance - v_req.fee_amount where id = v_req.client_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_request_id, related_booking_id)
      values (v_req.client_id, 'request_fee', -v_req.fee_amount, v_req.id, v_booking.id);
  end if;
  update booking_requests set client_charged_at = now() where id = v_req.id;

  -- Πρώτα η επιλεγμένη, ώστε ο φρουρός κλεισίματος να κλείσει μόνο τις υπόλοιπες.
  update open_request_claims set status = 'chosen', resolved_at = now(),
         uncollected_fee = case when v_claim.skipper_id is null then board_claim_fee(v_req) end
   where id = v_claim.id;
  update booking_requests set status = 'matched' where id = v_req.id;

  if v_claim.skipper_id is not null then
    perform notify_user(v_skipper.user_id, 'board_claim_chosen',
      jsonb_build_object('request_id', v_req.id, 'place', board_place(v_req), 'start', v_req.start_date,
                         'end', v_req.end_date, 'role', v_req.crew_role),
      '/platform/bookings');
  end if;

  return jsonb_build_object('claim_id', v_claim.id, 'booking_id', v_booking.id, 'external', v_claim.skipper_id is null);
end;
$$;
revoke execute on function client_choose_board_claim(uuid) from public, anon;
grant execute on function client_choose_board_claim(uuid) to authenticated;

-- Στοιχεία επικοινωνίας εξωτερικού υποψηφίου: μόνο αφού τον διάλεξε ο πελάτης.
create or replace function client_board_external_contact(p_request_id uuid)
returns table (name text, phone text, note text)
language sql stable security definer set search_path = public as $$
  select c.external_name, c.external_phone, c.external_note
    from open_request_claims c join booking_requests br on br.id = c.request_id
   where c.request_id = p_request_id and br.client_id = auth.uid() and c.status = 'chosen' and c.skipper_id is null;
$$;
revoke execute on function client_board_external_contact(uuid) from public, anon;
grant execute on function client_board_external_contact(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Όταν το αίτημα κλείσει (επιλογή, ακύρωση, λήξη), κλείνουν οι ενεργές
--    διεκδικήσεις και οι διεκδικητές ενημερώνονται.
-- ---------------------------------------------------------------------------
create or replace function close_board_claims() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not new.board_open or old.status <> 'open' or new.status = 'open' then return null; end if;
  perform set_config('platform.trusted', 'true', true);
  for c in
    with u as (
      update open_request_claims set status = 'closed', resolved_at = now()
       where request_id = new.id and status = 'active'
       returning skipper_id)
    select skipper_id from u
  loop
    if c.skipper_id is not null then
      perform notify_user(
        (select user_id from skipper_profiles where id = c.skipper_id), 'board_claim_closed',
        jsonb_build_object('request_id', new.id, 'place', board_place(new), 'start', new.start_date,
                           'end', new.end_date, 'role', new.crew_role,
                           'reason', case new.status when 'matched' then 'matched'
                                                     when 'cancelled' then 'cancelled' else 'expired' end),
        '/platform/board');
    end if;
  end loop;
  return null;
end;
$$;
drop trigger if exists zz_close_board_claims on booking_requests;
create trigger zz_close_board_claims after update of status on booking_requests
  for each row execute function close_board_claims();

-- Όταν το υπόλοιπο πέφτει κάτω από το τέλος και υπάρχουν ενεργές διεκδικήσεις,
-- ο επαγγελματίας ενημερώνεται (μία φορά, τη στιγμή της πτώσης).
create or replace function notify_board_claims_need_credit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_fee numeric := (select value from platform_settings where key = 'skipper_claim_fee');
  v_res numeric;
  v_n int;
begin
  if new.wallet_balance >= old.wallet_balance or v_fee <= 0 then return null; end if;
  v_res := user_reserved_credits(new.id);
  if old.wallet_balance - v_res < v_fee or new.wallet_balance - v_res >= v_fee then return null; end if;
  select count(*) into v_n
    from open_request_claims c
    join skipper_profiles sp on sp.id = c.skipper_id and sp.user_id = new.id
    join booking_requests br on br.id = c.request_id
   where c.status = 'active' and br.status = 'open' and br.expires_at > now();
  if v_n > 0 then
    perform notify_user(new.id, 'board_claims_need_credit', jsonb_build_object('count', v_n), '/platform/wallet');
  end if;
  return null;
end;
$$;
drop trigger if exists zz_board_claims_need_credit on users;
create trigger zz_board_claims_need_credit after update of wallet_balance on users
  for each row execute function notify_board_claims_need_credit();

-- ---------------------------------------------------------------------------
-- 10. Διαχείριση: εξωτερικοί υποψήφιοι και παρακολούθηση
-- ---------------------------------------------------------------------------
create or replace function admin_add_board_external(p_request_id uuid, p_name text, p_phone text, p_note text default null)
returns open_request_claims language plpgsql security definer set search_path = public as $$
declare v_req booking_requests%rowtype; v_claim open_request_claims%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_phone, '')) = '' then raise exception 'invalid_value'; end if;
  select * into v_req from booking_requests where id = p_request_id for update;
  if not found or not v_req.board_open then raise exception 'request_not_found'; end if;
  if v_req.status <> 'open' or v_req.expires_at <= now() then raise exception 'request_not_open'; end if;
  perform set_config('platform.trusted', 'true', true);
  insert into open_request_claims (request_id, external_name, external_phone, external_note, added_by)
    values (p_request_id, btrim(p_name), btrim(p_phone), nullif(btrim(p_note), ''), auth.uid())
    returning * into v_claim;
  perform notify_user(v_req.client_id, 'board_claim_received',
    jsonb_build_object('request_id', v_req.id, 'place', board_place(v_req), 'start', v_req.start_date,
                       'end', v_req.end_date, 'role', v_req.crew_role),
    '/platform/requests');
  return v_claim;
end;
$$;
revoke execute on function admin_add_board_external(uuid, text, text, text) from public, anon;
grant execute on function admin_add_board_external(uuid, text, text, text) to authenticated;

create or replace function admin_remove_board_external(p_claim_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform set_config('platform.trusted', 'true', true);
  update open_request_claims set status = 'withdrawn', resolved_at = now()
   where id = p_claim_id and skipper_id is null and status = 'active';
end;
$$;
revoke execute on function admin_remove_board_external(uuid) from public, anon;
grant execute on function admin_remove_board_external(uuid) to authenticated;

create or replace function admin_board_overview()
returns table (
  request_id uuid, client_id uuid, client_name text, start_date date, end_date date, region_id uuid,
  departure_point text, arrival_point text, boat_type_id uuid, crew_role crew_role, status text,
  posted_at timestamptz, closes_at timestamptz, claims jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
  select br.id, br.client_id, u.full_name, br.start_date, br.end_date, br.region_id,
         br.departure_point, br.arrival_point, br.boat_type_id, br.crew_role, br.status::text,
         br.board_posted_at, br.expires_at,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'claim_id', c.id, 'status', c.status, 'skipper_id', c.skipper_id,
                     'name', coalesce(c.external_name, su.full_name), 'phone', coalesce(c.external_phone, su.phone_number),
                     'note', c.external_note, 'uncollected_fee', c.uncollected_fee, 'created_at', c.created_at)
                   order by c.created_at)
                    from open_request_claims c
                    left join skipper_profiles sp on sp.id = c.skipper_id
                    left join users su on su.id = sp.user_id
                   where c.request_id = br.id), '[]'::jsonb)
    from booking_requests br join users u on u.id = br.client_id
   where br.board_open
   order by (br.status = 'open') desc, br.start_date, br.id;
end;
$$;
revoke execute on function admin_board_overview() from public, anon;
grant execute on function admin_board_overview() to authenticated;
