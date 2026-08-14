-- ============================================================================
-- The envelope needs something to open.
--
-- It navigated to the dashboard, which is usually the page you are already on
-- — so tapping it did nothing visible. It now opens a list of conversations,
-- the same shape as the bell's list, and one query builds it rather than one
-- per booking from the client.
--
-- Works for either side of a booking: identity comes from the session, so a
-- professional and a client get their own threads from the same function.
-- ============================================================================

create or replace function my_conversations()
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
    select auth.uid() as uid, my_skipper_profile_id() as sid
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
    b.id,
    p.name,
    b.start_date,
    b.end_date,
    (select m2.content from messages m2
      where m2.booking_id = b.id order by m2.sent_at desc limit 1),
    a.last_at,
    a.unread
  from mine b
  join agg a on a.booking_id = b.id
  left join ports p on p.id = b.port_id
  order by a.last_at desc
  limit 30;
$$;
grant execute on function my_conversations() to authenticated;
