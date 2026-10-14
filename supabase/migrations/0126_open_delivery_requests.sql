-- ============================================================================
-- Ανοιχτά αιτήματα μεταφοράς σκάφους (0126), ίδια λογική με το 0124.
--
-- Ο πελάτης αφήνει τη μεταφορά ανοιχτή χωρίς να διαλέξει υποψήφιο (ή όταν
-- κανείς δεν είναι διαθέσιμος). Η θέση φαίνεται στον δημόσιο πίνακα και οι
-- επαγγελματίες την διεκδικούν· διαλέγει ο πελάτης.
--
-- Credits: όπως σε κάθε μεταφορά, ο πελάτης χρεώνεται στην ανάρτηση και παίρνει
-- πίσω το τέλος αν η θέση λήξει ή ακυρωθεί (expire_stale_delivery_role_requests,
-- cancel_delivery_role_request). Η διεκδίκηση δεν χρεώνει ούτε δεσμεύει τίποτα·
-- ο επαγγελματίας χρεώνεται (το τέλος του) μόνο όταν τον διαλέξει ο πελάτης.
-- Ένα credit επαγγελματία στηρίζει πολλές διεκδικήσεις: όποια επιλεγεί πρώτη το
-- χρεώνει, οι άλλες δεν επιλέγονται όσο λείπει υπόλοιπο (υπολογίζεται τη στιγμή).
--
-- Διάρκεια: μέχρι το τέλος της ημερομηνίας αναχώρησης (συν την ευελιξία).
-- ============================================================================

alter table delivery_role_requests add column if not exists board_open boolean not null default false;
create index if not exists delivery_role_requests_board
  on delivery_role_requests (expires_at, id) where board_open and status = 'open';

create table if not exists delivery_open_claims (
  id uuid primary key default gen_random_uuid(),
  role_request_id uuid not null references delivery_role_requests(id) on delete cascade,
  skipper_id uuid not null references skipper_profiles(id),
  status text not null default 'active' check (status in ('active', 'withdrawn', 'closed', 'chosen')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (role_request_id, skipper_id)
);
create unique index if not exists delivery_open_claims_one_chosen
  on delivery_open_claims (role_request_id) where status = 'chosen';
create index if not exists delivery_open_claims_skipper on delivery_open_claims (skipper_id, status);
alter table delivery_open_claims enable row level security;
revoke all on delivery_open_claims from anon, authenticated;

-- Κωδικός σφάλματος αν ο επαγγελματίας δεν μπορεί να αναλάβει τη θέση τώρα, αλλιώς null.
create or replace function delivery_board_problem(p_rr delivery_role_requests, p_skipper_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_dr delivery_requests%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_range daterange;
  v_wallet numeric;
begin
  select * into v_dr from delivery_requests where id = p_rr.delivery_request_id;
  select * into v_skipper from skipper_profiles where id = p_skipper_id;
  if not found or v_skipper.deleted_at is not null then return 'skipper_not_eligible'; end if;
  if p_rr.crew_role = v_skipper.role then
    if v_skipper.approval_status <> 'approved' then return 'skipper_not_eligible'; end if;
  elsif not exists (
    select 1 from skipper_secondary_roles
     where skipper_id = p_skipper_id and role = p_rr.crew_role and deleted_at is null and approval_status = 'approved'
  ) then
    return 'skipper_not_eligible';
  end if;
  if v_skipper.user_id = v_dr.client_id then return 'own_request'; end if;
  v_range := daterange(v_dr.departure_date - v_dr.flexible_days, v_dr.departure_date + v_dr.flexible_days, '[]');
  if exists (
    select 1 from bookings
     where skipper_id = p_skipper_id and status in ('confirmed', 'completed')
       and daterange(start_date, end_date, '[]') && v_range
  ) or exists (
    select 1 from delivery_bookings
     where skipper_id = p_skipper_id and status = 'confirmed' and estimated_range && v_range
  ) then return 'date_overlap'; end if;
  if p_rr.professional_fee > 0 then
    select wallet_balance into v_wallet from users where id = v_skipper.user_id;
    if v_wallet - user_reserved_credits(v_skipper.user_id) < p_rr.professional_fee then return 'insufficient_wallet'; end if;
  end if;
  return null;
end;
$$;
revoke execute on function delivery_board_problem(delivery_role_requests, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ο πελάτης αφήνει τη θέση ανοιχτή: ίδια χρέωση με create_delivery_role_request,
-- χωρίς υποψήφιους.
-- ---------------------------------------------------------------------------
create or replace function create_open_delivery_role_request(p_delivery_request_id uuid, p_crew_role crew_role, p_offered_price numeric)
returns delivery_role_requests language plpgsql security definer set search_path = public as $$
declare
  v_dr delivery_requests%rowtype;
  v_rate numeric; v_pct numeric; v_min_fee numeric; v_credit_price numeric;
  v_commission_base numeric; v_platform_commission numeric; v_client_fee numeric; v_wallet numeric;
  v_row delivery_role_requests%rowtype;
begin
  select * into v_dr from delivery_requests where id = p_delivery_request_id;
  if not found then raise exception 'delivery_request_not_found'; end if;
  if v_dr.client_id <> auth.uid() then raise exception 'not_owner'; end if;
  if p_offered_price is null or p_offered_price < 0 then raise exception 'invalid_price'; end if;
  if (select count(*) from delivery_role_requests rr join delivery_requests d on d.id = rr.delivery_request_id
        where d.client_id = auth.uid() and rr.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_requests';
  end if;

  v_rate := (select value from platform_settings where key = 'delivery_' || p_crew_role::text || '_rate_per_mile');
  if v_rate is null then raise exception 'delivery_rate_not_configured'; end if;
  v_pct := (select value from platform_settings where key = 'delivery_platform_fee_pct');
  v_min_fee := (select value from platform_settings where key = 'delivery_min_fee');
  v_commission_base := v_dr.distance_miles * v_rate;
  v_platform_commission := v_commission_base * (v_pct / 100.0);
  v_client_fee := greatest(v_min_fee, v_platform_commission - v_min_fee);
  v_credit_price := greatest(coalesce((select value from platform_settings where key = 'credit_price_eur'), 50), 1);
  v_client_fee := ceil(v_client_fee / v_credit_price);
  v_min_fee := ceil(v_min_fee / v_credit_price);

  select wallet_balance into v_wallet from users where id = auth.uid() for update;
  if v_wallet - user_reserved_credits(auth.uid()) < v_client_fee then raise exception 'insufficient_wallet'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance - v_client_fee where id = auth.uid();
  insert into delivery_role_requests (
    delivery_request_id, crew_role, offered_price, commission_base, platform_commission,
    client_fee, professional_fee, fee_paid_at, expires_at, board_open
  ) values (
    p_delivery_request_id, p_crew_role, p_offered_price, v_commission_base, v_platform_commission,
    v_client_fee, v_min_fee, now(), (v_dr.departure_date + v_dr.flexible_days + 1)::timestamptz, true
  ) returning * into v_row;
  insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id)
    values (auth.uid(), 'request_fee', -v_client_fee, v_row.id);
  return v_row;
end;
$$;
revoke execute on function create_open_delivery_role_request(uuid, crew_role, numeric) from public, anon;
grant execute on function create_open_delivery_role_request(uuid, crew_role, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Δημόσιος πίνακας μεταφορών (ανώνυμα, χωρίς λογαριασμό). Κοντινότερη αναχώρηση πρώτα.
-- ---------------------------------------------------------------------------
-- (drop: ο τύπος επιστροφής άλλαξε στο 0127· ώστε η εκτέλεση να επαναλαμβάνεται)
drop function if exists delivery_board_requests(crew_role, date, uuid, int);
create or replace function delivery_board_requests(
  p_role crew_role default null, p_after_date date default null, p_after_id uuid default null, p_limit int default 20)
returns table (
  id uuid, crew_role crew_role, origin_point text, destination_point text, distance_miles numeric,
  departure_date date, flexible_days int, offered_price numeric,
  covers_tickets boolean, covers_travel boolean, covers_food boolean, food_allowance_amount numeric,
  covers_fuel boolean, covers_port_expenses boolean, notes text,
  claims_count int, claimed_by_me boolean, closes_at timestamptz)
language sql stable security definer set search_path = public as $$
  select rr.id, rr.crew_role, dr.origin_point, dr.destination_point, dr.distance_miles,
         dr.departure_date, dr.flexible_days, rr.offered_price,
         dr.covers_tickets, dr.covers_travel, dr.covers_food, dr.food_allowance_amount,
         dr.covers_fuel, dr.covers_port_expenses, dr.notes,
         (select count(*)::int from delivery_open_claims c where c.role_request_id = rr.id and c.status = 'active'),
         coalesce(exists (select 1 from delivery_open_claims c join skipper_profiles sp on sp.id = c.skipper_id
                           where c.role_request_id = rr.id and c.status = 'active' and sp.user_id = auth.uid()), false),
         rr.expires_at
    from delivery_role_requests rr join delivery_requests dr on dr.id = rr.delivery_request_id
   where rr.board_open and rr.status = 'open' and rr.expires_at > now()
     and (p_role is null or rr.crew_role = p_role)
     and (p_after_date is null or (dr.departure_date, rr.id) > (p_after_date, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000')))
   order by dr.departure_date, rr.id
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function delivery_board_requests(crew_role, date, uuid, int) from public;
grant execute on function delivery_board_requests(crew_role, date, uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Διεκδίκηση και απόσυρση (χωρίς χρέωση, χωρίς δέσμευση)
-- ---------------------------------------------------------------------------
create or replace function claim_delivery_board_request(p_role_request_id uuid, p_skipper_id uuid)
returns delivery_open_claims language plpgsql security definer set search_path = public as $$
declare
  v_rr delivery_role_requests%rowtype;
  v_dr delivery_requests%rowtype;
  v_problem text;
  v_claim delivery_open_claims%rowtype;
  v_had boolean;
  v_max int := (select value from platform_settings where key = 'board_max_claims')::int;
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;
  select * into v_rr from delivery_role_requests where id = p_role_request_id for update;
  if not found or not v_rr.board_open then raise exception 'request_not_found'; end if;
  if v_rr.status <> 'open' or v_rr.expires_at <= now() then raise exception 'request_not_open'; end if;

  v_problem := delivery_board_problem(v_rr, p_skipper_id);
  if v_problem is not null then raise exception '%', v_problem; end if;

  select * into v_claim from delivery_open_claims where role_request_id = p_role_request_id and skipper_id = p_skipper_id for update;
  v_had := found;
  if v_had and v_claim.status = 'active' then return v_claim; end if;
  if v_had and v_claim.status in ('chosen', 'closed') then raise exception 'already_resolved'; end if;
  if (select count(*) from delivery_open_claims where role_request_id = p_role_request_id and status = 'active') >= v_max then
    raise exception 'too_many_claims';
  end if;

  perform set_config('platform.trusted', 'true', true);
  if v_had then
    update delivery_open_claims set status = 'active', resolved_at = null, created_at = now()
     where id = v_claim.id returning * into v_claim;
  else
    insert into delivery_open_claims (role_request_id, skipper_id) values (p_role_request_id, p_skipper_id)
      returning * into v_claim;
  end if;

  select * into v_dr from delivery_requests where id = v_rr.delivery_request_id;
  perform notify_user(v_dr.client_id, 'delivery_board_claim_received',
    jsonb_build_object('request_id', v_rr.id, 'origin', v_dr.origin_point, 'destination', v_dr.destination_point, 'role', v_rr.crew_role),
    '/platform/delivery/requests');
  return v_claim;
end;
$$;
revoke execute on function claim_delivery_board_request(uuid, uuid) from public, anon;
grant execute on function claim_delivery_board_request(uuid, uuid) to authenticated;

create or replace function withdraw_delivery_board_claim(p_role_request_id uuid, p_skipper_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;
  perform set_config('platform.trusted', 'true', true);
  update delivery_open_claims set status = 'withdrawn', resolved_at = now()
   where role_request_id = p_role_request_id and skipper_id = p_skipper_id and status = 'active';
end;
$$;
revoke execute on function withdraw_delivery_board_claim(uuid, uuid) from public, anon;
grant execute on function withdraw_delivery_board_claim(uuid, uuid) to authenticated;

create or replace function my_delivery_board_claims()
returns table (
  claim_id uuid, role_request_id uuid, skipper_id uuid, state text, crew_role crew_role,
  origin_point text, destination_point text, departure_date date, flexible_days int, offered_price numeric,
  claimed_at timestamptz, closes_at timestamptz, needs_credit boolean)
language sql stable security definer set search_path = public as $$
  select c.id, rr.id, c.skipper_id,
         case when c.status = 'active' and (rr.status <> 'open' or rr.expires_at <= now()) then 'closed' else c.status end,
         rr.crew_role, dr.origin_point, dr.destination_point, dr.departure_date, dr.flexible_days, rr.offered_price,
         c.created_at, rr.expires_at,
         (c.status = 'active' and rr.status = 'open' and rr.expires_at > now()
            and delivery_board_problem(rr, c.skipper_id) = 'insufficient_wallet')
    from delivery_open_claims c
    join skipper_profiles sp on sp.id = c.skipper_id and sp.user_id = auth.uid()
    join delivery_role_requests rr on rr.id = c.role_request_id
    join delivery_requests dr on dr.id = rr.delivery_request_id
   order by dr.departure_date, c.created_at;
$$;
revoke execute on function my_delivery_board_claims() from public, anon;
grant execute on function my_delivery_board_claims() to authenticated;

-- ---------------------------------------------------------------------------
-- Ο πελάτης βλέπει τους ανώνυμους διεκδικητές και διαλέγει
-- ---------------------------------------------------------------------------
create or replace function client_list_delivery_claims(p_role_request_id uuid)
returns table (claim_id uuid, skipper_id uuid, claimed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.skipper_id, c.created_at
    from delivery_open_claims c
    join delivery_role_requests rr on rr.id = c.role_request_id
    join delivery_requests dr on dr.id = rr.delivery_request_id
   where c.role_request_id = p_role_request_id and dr.client_id = auth.uid() and rr.board_open
     and rr.status = 'open' and rr.expires_at > now() and c.status = 'active'
     and delivery_board_problem(rr, c.skipper_id) is null
   order by c.created_at;
$$;
revoke execute on function client_list_delivery_claims(uuid) from public, anon;
grant execute on function client_list_delivery_claims(uuid) to authenticated;

create or replace function client_choose_delivery_claim(p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_claim delivery_open_claims%rowtype;
  v_rr delivery_role_requests%rowtype;
  v_dr delivery_requests%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_booking delivery_bookings%rowtype;
  v_problem text;
begin
  select * into v_claim from delivery_open_claims where id = p_claim_id;
  if not found then raise exception 'claim_not_found'; end if;

  select * into v_rr from delivery_role_requests where id = v_claim.role_request_id for update;
  select * into v_dr from delivery_requests where id = v_rr.delivery_request_id;
  if v_dr.client_id <> auth.uid() then raise exception 'not_owner'; end if;
  if not v_rr.board_open then raise exception 'claim_not_found'; end if;
  if v_rr.status <> 'open' then raise exception 'request_not_open'; end if;
  if v_rr.expires_at <= now() then raise exception 'request_expired'; end if;

  select * into v_claim from delivery_open_claims where id = p_claim_id for update;
  if v_claim.status <> 'active' then raise exception 'claim_not_active'; end if;

  perform set_config('platform.trusted', 'true', true);
  perform pg_advisory_xact_lock(hashtext(v_claim.skipper_id::text));
  select * into v_skipper from skipper_profiles where id = v_claim.skipper_id for update;
  perform 1 from users where id = v_skipper.user_id for update;
  v_problem := delivery_board_problem(v_rr, v_claim.skipper_id);
  if v_problem is not null then
    raise exception '%', case when v_problem = 'insufficient_wallet' then 'claimant_cannot_pay' else v_problem end;
  end if;

  insert into delivery_bookings (
    delivery_role_request_id, delivery_request_id, client_id, skipper_id, crew_role,
    origin_point, destination_point, distance_miles, departure_date, flexible_days,
    covers_tickets, covers_travel, covers_food, food_allowance_amount, covers_fuel, covers_port_expenses,
    offered_price, professional_fee_amount
  ) values (
    v_rr.id, v_dr.id, v_dr.client_id, v_claim.skipper_id, v_rr.crew_role,
    v_dr.origin_point, v_dr.destination_point, v_dr.distance_miles, v_dr.departure_date, v_dr.flexible_days,
    v_dr.covers_tickets, v_dr.covers_travel, v_dr.covers_food, v_dr.food_allowance_amount, v_dr.covers_fuel, v_dr.covers_port_expenses,
    v_rr.offered_price, v_rr.professional_fee
  ) returning * into v_booking;

  update users set wallet_balance = wallet_balance - v_rr.professional_fee where id = v_skipper.user_id;
  insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id, related_delivery_booking_id)
    values (v_skipper.user_id, 'claim_fee', -v_rr.professional_fee, v_rr.id, v_booking.id);

  -- Πρώτα η επιλεγμένη, ώστε ο φρουρός κλεισίματος να κλείσει μόνο τις υπόλοιπες.
  update delivery_open_claims set status = 'chosen', resolved_at = now() where id = v_claim.id;
  update delivery_role_requests set status = 'filled' where id = v_rr.id;

  perform notify_user(v_skipper.user_id, 'delivery_board_claim_chosen',
    jsonb_build_object('request_id', v_rr.id, 'origin', v_dr.origin_point, 'destination', v_dr.destination_point, 'role', v_rr.crew_role),
    '/platform/bookings');
  perform notify_user(v_dr.client_id, 'delivery_accepted',
    jsonb_build_object('origin', v_dr.origin_point, 'destination', v_dr.destination_point, 'role', v_rr.crew_role),
    '/platform/delivery/requests');
  return jsonb_build_object('claim_id', v_claim.id, 'delivery_booking_id', v_booking.id);
end;
$$;
revoke execute on function client_choose_delivery_claim(uuid) from public, anon;
grant execute on function client_choose_delivery_claim(uuid) to authenticated;

-- Όταν η θέση κλείσει (επιλογή, ακύρωση, λήξη), κλείνουν οι ενεργές διεκδικήσεις.
create or replace function close_delivery_board_claims() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record; v_dr delivery_requests%rowtype;
begin
  if not new.board_open or old.status <> 'open' or new.status = 'open' then return null; end if;
  perform set_config('platform.trusted', 'true', true);
  select * into v_dr from delivery_requests where id = new.delivery_request_id;
  for c in
    with u as (
      update delivery_open_claims set status = 'closed', resolved_at = now()
       where role_request_id = new.id and status = 'active'
       returning skipper_id)
    select skipper_id from u
  loop
    perform notify_user(
      (select user_id from skipper_profiles where id = c.skipper_id), 'delivery_board_claim_closed',
      jsonb_build_object('request_id', new.id, 'origin', v_dr.origin_point, 'destination', v_dr.destination_point,
                         'role', new.crew_role,
                         'reason', case new.status when 'filled' then 'matched' when 'cancelled' then 'cancelled' else 'expired' end),
      '/platform/board');
  end loop;
  return null;
end;
$$;
drop trigger if exists zz_close_delivery_board_claims on delivery_role_requests;
create trigger zz_close_delivery_board_claims after update of status on delivery_role_requests
  for each row execute function close_delivery_board_claims();

-- list_my_delivery_requests: η θέση δηλώνει αν είναι ανοιχτή στον πίνακα.
create or replace function list_my_delivery_requests()
returns table(
  request delivery_requests,
  role_requests jsonb
)
language sql stable security definer set search_path = public as $$
  select dr, coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', rr.id, 'crew_role', rr.crew_role, 'offered_price', rr.offered_price,
      'client_fee', rr.client_fee, 'professional_fee', rr.professional_fee,
      'status', rr.status, 'expires_at', rr.expires_at, 'created_at', rr.created_at,
      'board_open', rr.board_open,
      'pings', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'skipper_id', p.skipper_id, 'status', p.status,
          'full_name', sp.full_name, 'photo_url', u.photo_url
        ) order by p.sent_at), '[]'::jsonb)
        from delivery_role_pings p
        join skipper_profiles sp on sp.id = p.skipper_id
        join users u on u.id = sp.user_id
        where p.delivery_role_request_id = rr.id
      ),
      'booking', (
        select to_jsonb(b) from delivery_bookings b where b.delivery_role_request_id = rr.id
      )
    ) order by rr.created_at)
    from delivery_role_requests rr where rr.delivery_request_id = dr.id
  ), '[]'::jsonb)
  from delivery_requests dr
  where dr.client_id = auth.uid()
  order by dr.created_at desc;
$$;
