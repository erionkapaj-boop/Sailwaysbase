-- ============================================================================
-- "View as" for admins: the real pages, not a summary of them.
--
-- The admin screen rebuilt each account's data in its own layout, so it
-- answered "what is stored about this person" but never "what does this
-- person actually see" — which is the question worth asking after every
-- design change, for every role.
--
-- Rendering the genuine pages needs the genuine data, and these three
-- functions read auth.uid() internally: called by an admin they returned the
-- *admin's* notifications and threads inside somebody else's dashboard. They
-- now take an optional subject, refused to anyone who isn't an admin, so the
-- permission lives in the database rather than in the hope that the UI asked
-- nicely.
--
-- Writing is not part of this. An admin viewing someone else still writes as
-- themselves, and every ownership policy compares against auth.uid(), so the
-- database already refuses on their behalf; the UI blocks it earlier only so
-- the refusal never has to happen.
-- ============================================================================

create or replace function acting_user(p_user_id uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if p_user_id is null or p_user_id = auth.uid() then
    return auth.uid();
  end if;
  if not is_admin() then
    raise exception 'not_admin';
  end if;
  return p_user_id;
end;
$$;
grant execute on function acting_user(uuid) to authenticated;

-- Skipper profile id for whoever is being viewed, not for the caller.
create or replace function skipper_profile_id_of(p_user_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from skipper_profiles where user_id = p_user_id limit 1;
$$;
grant execute on function skipper_profile_id_of(uuid) to authenticated;

create or replace function my_notification_counts(p_user_id uuid default null)
returns table(pending_requests int, unread_booking_ids uuid[])
language sql stable security definer set search_path = public as $$
  with me as (
    select acting_user(p_user_id) as user_id,
           skipper_profile_id_of(acting_user(p_user_id)) as skipper_id
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
grant execute on function my_notification_counts(uuid) to authenticated;

create or replace function my_conversations(p_user_id uuid default null)
returns table(
  booking_id uuid,
  port_name text,
  start_date date,
  end_date date,
  last_message text,
  last_at timestamptz,
  unread int
)
language sql stable security definer set search_path = public as $$
  with me as (
    select acting_user(p_user_id) as uid,
           skipper_profile_id_of(acting_user(p_user_id)) as sid
  ),
  mine as (
    select b.*
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
    b.id, p.name, b.start_date, b.end_date,
    (select m2.content from messages m2 where m2.booking_id = b.id order by m2.sent_at desc limit 1),
    a.last_at, a.unread
  from mine b
  join agg a on a.booking_id = b.id
  left join ports p on p.id = b.port_id
  order by a.last_at desc
  limit 30;
$$;
grant execute on function my_conversations(uuid) to authenticated;

create or replace function my_standing(p_user_id uuid default null)
returns table(response_rate numeric, responded int, ignored int)
language sql stable security definer set search_path = public as $$
  with me as (select skipper_profile_id_of(acting_user(p_user_id)) as skipper_id)
  select
    skipper_response_rate((select skipper_id from me)),
    count(*) filter (where brp.status = 'claimed' or brp.declined_at is not null)::int,
    count(*) filter (where brp.status = 'pending' and br.status = 'expired_unclaimed')::int
  from booking_request_pings brp
  join booking_requests br on br.id = brp.booking_request_id
  where brp.skipper_id = (select skipper_id from me);
$$;
grant execute on function my_standing(uuid) to authenticated;

-- The old no-argument versions would now be ambiguous against the new
-- defaulted ones, so they go.
drop function if exists my_notification_counts();
drop function if exists my_conversations();
drop function if exists my_standing();

-- Notifications are the one table an admin couldn't read for someone else;
-- every other select policy already allows is_admin().
drop policy if exists "own notifications" on notifications;
create policy "own notifications" on notifications for select
  using (user_id = auth.uid() or is_admin());
