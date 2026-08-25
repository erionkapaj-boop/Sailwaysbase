-- ============================================================================
-- The account that owns the platform can also hold a professional profile.
--
-- Nothing on the database side actually stopped an admin's user_id from
-- having a skipper_profiles row — the table has no role check, only a
-- unique constraint on user_id. What was missing was reachability: the
-- front end hard-gated the professional dashboard on users.role = 'skipper',
-- and there was no way for an admin to opt in.
--
-- That gate is now app-side only (see PlatformShell.js / app/platform/skipper/
-- *.js): an admin can create their own skipper_profiles row through the same
-- MissingProfile flow anyone else would use after an interrupted signup, and
-- it goes through the same approval step everyone else's does.
--
-- The one thing this migration actually changes: my_conversations() unions
-- bookings where you're the client with bookings where you're the crew, and
-- for an account that can be BOTH at once, the message list needs to say
-- which one applies to each thread — otherwise the envelope can only guess
-- where to send you, and guesses wrongly. See MessagesPanel.js for the half
-- that reads this.
-- ============================================================================

drop function if exists my_conversations(uuid);
create or replace function my_conversations(p_user_id uuid default null)
returns table(
  booking_id uuid,
  port_name text,
  start_date date,
  end_date date,
  last_message text,
  last_at timestamptz,
  unread int,
  -- true when you're the client on this booking, false when you're the crew.
  -- Never both: self-hire is blocked at the ping (0019), so no booking can
  -- have the same person on each side.
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
    p.name,
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
  order by a.last_at desc
  limit 30;
$$;
grant execute on function my_conversations(uuid) to authenticated;
