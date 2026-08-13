-- ============================================================================
-- Read tracking for messages, and a single cheap call the header can use to
-- ask "does this skipper have anything new?" — new booking requests or
-- unread messages — without the dashboard's full data load.
-- ============================================================================

alter table messages add column if not exists read_at timestamptz;

-- Marking read is a controlled write (only your own booking, only messages
-- someone else sent you) rather than an open RLS update policy, matching
-- how every other write in this schema goes through a function instead of
-- a raw table policy.
create or replace function mark_messages_read(p_booking_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from bookings b
    where b.id = p_booking_id
      and (
        b.client_id = auth.uid()
        or exists (select 1 from skipper_profiles sp where sp.id = b.skipper_id and sp.user_id = auth.uid())
      )
  ) then
    raise exception 'not_participant';
  end if;

  update messages
  set read_at = now()
  where booking_id = p_booking_id
    and sender_id <> auth.uid()
    and read_at is null;
end;
$$;
grant execute on function mark_messages_read(uuid) to authenticated;

-- One round trip for the header bell: how many open requests are waiting,
-- and which bookings (if any) have a message the skipper hasn't read yet.
create or replace function skipper_notification_counts(p_skipper_id uuid)
returns table(pending_requests int, unread_booking_ids uuid[])
language sql stable security definer set search_path = public as $$
  select
    (
      select count(*)::int
      from booking_request_pings brp
      join booking_requests br on br.id = brp.booking_request_id
      where brp.skipper_id = p_skipper_id
        and brp.status = 'pending'
        and br.status = 'open'
    ) as pending_requests,
    (
      select coalesce(array_agg(distinct m.booking_id), '{}')
      from messages m
      join bookings b on b.id = m.booking_id
      join skipper_profiles sp on sp.id = b.skipper_id
      where b.skipper_id = p_skipper_id
        and m.sender_id <> sp.user_id
        and m.read_at is null
    ) as unread_booking_ids;
$$;
grant execute on function skipper_notification_counts(uuid) to authenticated;
