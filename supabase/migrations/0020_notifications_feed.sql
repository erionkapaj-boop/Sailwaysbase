-- ============================================================================
-- A real notification feed behind the bell.
--
-- The bell counted one thing (open requests) and led nowhere in particular.
-- Everything else that happens to a person on the platform — a review landing,
-- a booking confirming, money leaving or arriving — was invisible unless they
-- went looking for it.
--
-- Rows carry a kind and a small jsonb payload rather than a finished sentence:
-- the Greek wording then lives in the UI next to every other string, so
-- rephrasing anything is a code change instead of a migration, and old rows
-- pick up the new wording automatically.
--
-- Every row is written by a trigger on the event itself, never by the client.
-- A notification the app has to remember to send is one it eventually forgets.
-- ============================================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on notifications (user_id) where read_at is null;

alter table notifications enable row level security;

drop policy if exists "own notifications" on notifications;
create policy "own notifications" on notifications for select using (user_id = auth.uid());
-- No insert/update policy on purpose: the triggers below are SECURITY DEFINER
-- and bypass RLS, so nobody can forge a notification for themselves or anyone
-- else. Marking read goes through the function further down.

create or replace function notify_user(
  p_user_id uuid, p_kind text, p_data jsonb default '{}'::jsonb, p_link text default null
) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, data, link)
  values (p_user_id, p_kind, coalesce(p_data, '{}'::jsonb), p_link);
$$;

-- ---------------------------------------------------------------------------
-- A request lands in a professional's inbox.
-- ---------------------------------------------------------------------------
create or replace function notify_request_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_req booking_requests%rowtype; v_port text;
begin
  select user_id into v_uid from skipper_profiles where id = new.skipper_id;
  select * into v_req from booking_requests where id = new.booking_request_id;
  select name into v_port from ports where id = v_req.port_id;
  perform notify_user(
    v_uid, 'request_received',
    jsonb_build_object('port', v_port, 'start', v_req.start_date, 'end', v_req.end_date),
    '/platform/skipper'
  );
  return null;
end;
$$;
drop trigger if exists trg_notify_request_received on booking_request_pings;
create trigger trg_notify_request_received
  after insert on booking_request_pings
  for each row execute function notify_request_received();

-- ---------------------------------------------------------------------------
-- A booking is created — both sides hear about it, each pointed at their own
-- dashboard.
-- ---------------------------------------------------------------------------
create or replace function notify_booking_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_port text; v_payload jsonb;
begin
  select user_id into v_skipper_uid from skipper_profiles where id = new.skipper_id;
  select name into v_port from ports where id = new.port_id;
  v_payload := jsonb_build_object('port', v_port, 'start', new.start_date, 'end', new.end_date);

  perform notify_user(new.client_id, 'booking_confirmed', v_payload,
                      '/platform/client?focus=' || new.id);
  perform notify_user(v_skipper_uid, 'booking_confirmed', v_payload,
                      '/platform/skipper?focus=' || new.id);
  return null;
end;
$$;
drop trigger if exists trg_notify_booking_created on bookings;
create trigger trg_notify_booking_created
  after insert on bookings
  for each row execute function notify_booking_created();

-- ---------------------------------------------------------------------------
-- A booking is cancelled — the other party is the one who needs to know.
-- ---------------------------------------------------------------------------
create or replace function notify_booking_cancelled() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_port text; v_payload jsonb;
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
  end if;
  return null;
end;
$$;
drop trigger if exists trg_notify_booking_cancelled on bookings;
create trigger trg_notify_booking_cancelled
  after update of status on bookings
  for each row execute function notify_booking_cancelled();

-- ---------------------------------------------------------------------------
-- A review arrives.
-- ---------------------------------------------------------------------------
create or replace function notify_review_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role user_role;
begin
  select role into v_role from users where id = new.reviewee_id;
  perform notify_user(
    new.reviewee_id, 'review_received',
    jsonb_build_object('rating', new.rating),
    case when v_role = 'skipper' then '/platform/skipper' else '/platform/client' end
  );
  return null;
end;
$$;
drop trigger if exists trg_notify_review_received on reviews;
create trigger trg_notify_review_received
  after insert on reviews
  for each row execute function notify_review_received();

-- ---------------------------------------------------------------------------
-- Money moves. The sign carries the direction, so one kind covers both.
-- ---------------------------------------------------------------------------
create or replace function notify_wallet_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role user_role;
begin
  select role into v_role from users where id = new.user_id;
  perform notify_user(
    new.user_id, 'wallet',
    jsonb_build_object('amount', new.amount, 'txn_type', new.type),
    case when v_role = 'skipper' then '/platform/skipper/wallet' else '/platform/client' end
  );
  return null;
end;
$$;
drop trigger if exists trg_notify_wallet_movement on wallet_transactions;
create trigger trg_notify_wallet_movement
  after insert on wallet_transactions
  for each row execute function notify_wallet_movement();

-- ---------------------------------------------------------------------------
-- Reading them.
-- ---------------------------------------------------------------------------
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns void
language sql security definer set search_path = public as $$
  update notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and (p_ids is null or id = any(p_ids));
$$;
grant execute on function mark_notifications_read(uuid[]) to authenticated;

-- The bell now counts unread notifications rather than open requests: a
-- request is one of the things it reports, not the only one.
create or replace function my_notification_counts()
returns table(pending_requests int, unread_booking_ids uuid[])
language sql stable security definer set search_path = public as $$
  with me as (
    select auth.uid() as user_id, my_skipper_profile_id() as skipper_id
  )
  select
    coalesce((
      select count(*)::int from notifications
      where user_id = (select user_id from me) and read_at is null
    ), 0),
    coalesce((
      select array_agg(distinct m.booking_id)
      from messages m
      join bookings b on b.id = m.booking_id
      where m.read_at is null
        and m.sender_id <> (select user_id from me)
        and (
          b.client_id = (select user_id from me)
          or b.skipper_id = (select skipper_id from me)
        )
    ), '{}');
$$;
grant execute on function my_notification_counts() to authenticated;
