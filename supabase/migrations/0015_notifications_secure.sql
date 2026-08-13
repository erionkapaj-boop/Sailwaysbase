-- ============================================================================
-- Notification counts, fixed two ways.
--
-- 1. Security: skipper_notification_counts(p_skipper_id) was SECURITY DEFINER
--    with a caller-supplied id and no authorization check, so any logged-in
--    user could ask how many open requests a competitor had. Identity now
--    comes from the session, never from an argument.
--
-- 2. Coverage: only professionals had counts at all. A client whose skipper
--    replied had no way to find out. One function now answers for whoever is
--    asking, so both sides of a booking get the same treatment.
-- ============================================================================

drop function if exists skipper_notification_counts(uuid);

create or replace function my_notification_counts()
returns table(pending_requests int, unread_booking_ids uuid[])
language sql stable security definer set search_path = public as $$
  with me as (
    select auth.uid() as user_id, my_skipper_profile_id() as skipper_id
  )
  select
    -- Professionals only: requests waiting to be claimed. A client's own
    -- outgoing requests aren't news to them, so this stays 0 for clients.
    coalesce((
      select count(*)::int
      from booking_request_pings brp
      join booking_requests br on br.id = brp.booking_request_id
      where brp.skipper_id = (select skipper_id from me)
        and brp.status = 'pending'
        and br.status = 'open'
    ), 0),
    -- Unread messages on any booking the caller is party to, from either
    -- side of it.
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
