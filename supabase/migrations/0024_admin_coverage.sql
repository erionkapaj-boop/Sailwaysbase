-- ============================================================================
-- Covering a cancelled booking by hand.
--
-- The rule: a cancellation is not a refund. Both sides paid at match time and
-- that stands. What the client gets instead is a guarantee — the platform
-- finds them someone else — and that replacement is *assigned by an operator*,
-- never browsed by the client.
--
-- That last part is the whole point. Letting the client pick again would turn
-- one paid request into a way to page through the roster: collect a
-- cancellation, look at the next batch, repeat, and walk away with everyone's
-- details for the price of a single fee. Because the client never sees a list,
-- there is nothing to harvest.
--
-- The professional's side of the deterrent is unchanged and deliberate: they
-- forfeit their claim fee and carry the cancellation on their record, so the
-- decision costs them twice.
-- ============================================================================

-- A replacement is a second booking against the same request, so the old
-- one-booking-per-request rule has to become one *live* booking per request.
alter table bookings drop constraint if exists bookings_booking_request_id_key;
create unique index if not exists bookings_active_per_request_idx
  on bookings (booking_request_id)
  where status in ('confirmed', 'completed');

alter table bookings add column if not exists replaces_booking_id uuid references bookings(id);
alter table bookings add column if not exists assigned_by uuid references users(id);

-- ----------------------------------------------------------------------------
-- Who could actually take this job.
--
-- Same availability rules the public search uses — declared windows minus
-- closed days — so an operator is never offered someone the system would not
-- have offered a client. Approval and existing bookings are filtered here
-- rather than left for the assignment to reject.
-- ----------------------------------------------------------------------------
create or replace function admin_search_availability(
  p_role crew_role default 'skipper',
  p_start date default current_date,
  p_end date default current_date,
  p_port_id uuid default null
)
returns table(
  skipper_id uuid,
  user_id uuid,
  full_name text,
  phone_number text,
  crew_role crew_role,
  price_per_day numeric,
  rating_avg numeric,
  rating_count int,
  reliability_percentage numeric,
  tier skipper_tier,
  photo_url text
)
language sql stable security definer set search_path = public as $$
  select
    sp.id, sp.user_id, sp.full_name, u.phone_number, sp.role,
    sp.price_per_day, sp.rating_avg, sp.rating_count,
    sp.reliability_percentage, sp.tier, sp.photo_url
  from skipper_profiles sp
  join users u on u.id = sp.user_id
  where is_admin()
    and sp.approval_status = 'approved'
    and sp.deleted_at is null
    and sp.role = p_role
    and net_availability(sp.id, p_port_id) @> daterange(p_start, p_end, '[]')
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
  order by
    case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
    skipper_rank_score(sp.rating_avg, sp.rating_count, sp.reliability_percentage,
                       skipper_response_rate(sp.id)) desc;
$$;
grant execute on function admin_search_availability(crew_role, date, date, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Bookings left without a professional.
-- ----------------------------------------------------------------------------
create or replace function admin_coverage_needed()
returns table(
  booking_id uuid,
  client_id uuid,
  client_name text,
  client_phone text,
  port_id uuid,
  port_name text,
  start_date date,
  end_date date,
  crew_role crew_role,
  cancelled_at timestamptz,
  cancellation_reason text
)
language sql stable security definer set search_path = public as $$
  select
    b.id, b.client_id, u.full_name, u.phone_number,
    b.port_id, p.name, b.start_date, b.end_date,
    coalesce(sp.role, 'skipper'::crew_role),
    b.cancelled_at, b.cancellation_reason
  from bookings b
  join users u on u.id = b.client_id
  left join ports p on p.id = b.port_id
  left join skipper_profiles sp on sp.id = b.skipper_id
  where is_admin()
    -- Only the professional's cancellation leaves a client needing cover; a
    -- client who cancelled has nothing to be covered for.
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
-- Hand the job to someone.
--
-- No claim fee is charged to the replacement. They are covering a booking the
-- platform failed to protect, at short notice and without having chosen it —
-- billing them for the rescue would be backwards. The client is not charged
-- again either; their original fee already bought this outcome.
-- ----------------------------------------------------------------------------
create or replace function admin_assign_replacement(p_booking_id uuid, p_skipper_id uuid)
returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_old bookings%rowtype;
  v_new bookings%rowtype;
  v_skipper skipper_profiles%rowtype;
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

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if not found or v_skipper.approval_status <> 'approved' or v_skipper.deleted_at is not null then
    raise exception 'skipper_not_eligible';
  end if;
  if v_skipper.user_id = v_old.client_id then raise exception 'cannot_hire_self'; end if;

  -- The exclusion constraint on bookings would catch an overlap anyway; this
  -- turns it into an error an operator can read.
  if exists (
    select 1 from bookings b
    where b.skipper_id = p_skipper_id
      and b.status in ('confirmed', 'completed')
      and daterange(b.start_date, b.end_date, '[]') && daterange(v_old.start_date, v_old.end_date, '[]')
  ) then
    raise exception 'skipper_already_booked';
  end if;

  insert into bookings (
    booking_request_id, client_id, skipper_id, start_date, end_date,
    port_id, boat_type_id, skipper_claim_fee_amount, confirmed_at,
    status, replaces_booking_id, assigned_by
  ) values (
    v_old.booking_request_id, v_old.client_id, p_skipper_id, v_old.start_date, v_old.end_date,
    v_old.port_id, v_old.boat_type_id, 0, now(),
    'confirmed', p_booking_id, auth.uid()
  ) returning * into v_new;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
  values (auth.uid(), 'edit_booking', v_skipper.user_id, 'Ανάθεση αντικατάστασης');

  return v_new;
end;
$$;
grant execute on function admin_assign_replacement(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- A cancellation has to reach an operator immediately, not wait to be noticed.
-- ----------------------------------------------------------------------------
create or replace function notify_booking_cancelled() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_port text; v_payload jsonb; v_admin record;
begin
  if new.status not in ('cancelled_by_client', 'cancelled_by_skipper')
     or old.status = new.status then
    return null;
  end if;

  select user_id into v_skipper_uid from skipper_profiles where id = new.skipper_id;
  select name into v_port from ports where id = new.port_id;
  v_payload := jsonb_build_object('port', v_port, 'start', new.start_date, 'end', new.end_date);

  if new.status = 'cancelled_by_client' then
    perform notify_user(v_skipper_uid, 'booking_cancelled', v_payload, '/platform/skipper');
  else
    perform notify_user(new.client_id, 'booking_cancelled', v_payload, '/platform/client');
    -- Only this direction leaves someone stranded, so only this direction
    -- needs an operator.
    for v_admin in select id from users where role = 'admin' loop
      perform notify_user(v_admin.id, 'coverage_needed', v_payload, '/platform/admin/coverage');
    end loop;
  end if;
  return null;
end;
$$;

-- Coverage waiting on someone is a headline figure like the others.
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
    'coverage_needed',    (select count(*) from admin_coverage_needed()),
    'requests_open',      (select count(*) from booking_requests where status = 'open'),
    'requests_unclaimed_7d', (select count(*) from booking_requests
                              where status = 'expired_unclaimed' and created_at > now() - interval '7 days'),
    'bookings_confirmed', (select count(*) from bookings where status = 'confirmed'),
    'bookings_upcoming',  (select count(*) from bookings where status = 'confirmed' and start_date >= current_date),
    'bookings_completed', (select count(*) from bookings where status = 'completed'),
    'bookings_cancelled_30d', (select count(*) from bookings
                               where status in ('cancelled_by_client','cancelled_by_skipper')
                                 and created_at > now() - interval '30 days'),
    'wallet_clients',     (select coalesce(sum(wallet_balance), 0) from client_profiles),
    'wallet_pros',        (select coalesce(sum(wallet_balance), 0) from skipper_profiles),
    'fees_30d',           (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee') and created_at > now() - interval '30 days'),
    'fees_all_time',      (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee')),
    'refunds_30d',        (select coalesce(sum(amount), 0) from wallet_transactions
                           where type = 'refund_credit' and created_at > now() - interval '30 days'),
    'profiles_invisible', (select count(*) from skipper_profiles sp
                           where sp.approval_status = 'approved' and sp.deleted_at is null
                             and not has_future_availability(sp.id))
  ) end;
$$;
grant execute on function admin_overview() to authenticated;
