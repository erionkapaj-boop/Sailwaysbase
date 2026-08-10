-- ============================================================================
-- Fix mutually-recursive RLS policies.
--
-- 0003_rls.sql wrote policies that reference other RLS-protected tables
-- inline. Those subqueries are themselves subject to RLS, so any pair that
-- points at each other recurses until Postgres aborts the query:
--
--   skipper_profiles SELECT  -> subquery on bookings
--   bookings         SELECT  -> subquery on skipper_profiles
--
-- Same shape for client_profiles/booking_requests/pings/messages/
-- cancellation_reports. The symptom is an error on perfectly ordinary reads
-- (e.g. a skipper loading their own profile), not a permission denial.
--
-- Fix: move every cross-table check into a SECURITY DEFINER helper. Those
-- run with the definer's rights and so do not re-enter RLS, which breaks the
-- cycle. Each helper still scopes strictly to auth.uid(), so the access rules
-- themselves are unchanged — only the evaluation path is.
-- ============================================================================

-- ---- helpers ----------------------------------------------------------------

-- The caller's own skipper profile id (null when they aren't a skipper).
create or replace function my_skipper_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from skipper_profiles where user_id = auth.uid() limit 1;
$$;

-- Caller is the client on a booking with this skipper (identity is revealed
-- from confirmation onward, §6).
create or replace function client_shares_booking_with_skipper(p_skipper_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings b
    where b.skipper_id = p_skipper_id
      and b.client_id = auth.uid()
      and b.status in ('confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_skipper')
  );
$$;

-- Caller (as skipper) received a ping from a request by this client, so may
-- see that client's anonymous reliability/rating (§6).
create or replace function skipper_was_pinged_by_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from booking_requests br
    join booking_request_pings p on p.booking_request_id = br.id
    where br.client_id = p_client_id
      and p.skipper_id = my_skipper_profile_id()
  );
$$;

create or replace function skipper_pinged_for_request(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from booking_request_pings p
    where p.booking_request_id = p_request_id
      and p.skipper_id = my_skipper_profile_id()
  );
$$;

create or replace function owns_booking_request(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from booking_requests br
    where br.id = p_request_id and br.client_id = auth.uid()
  );
$$;

create or replace function is_booking_participant(p_booking_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings b
    where b.id = p_booking_id
      and (b.client_id = auth.uid() or b.skipper_id = my_skipper_profile_id())
  );
$$;

create or replace function booking_is_active_for_messaging(p_booking_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings b
    where b.id = p_booking_id
      and b.status in ('confirmed', 'completed')
      and (b.client_id = auth.uid() or b.skipper_id = my_skipper_profile_id())
  );
$$;

grant execute on function my_skipper_profile_id, client_shares_booking_with_skipper,
  skipper_was_pinged_by_client, skipper_pinged_for_request, owns_booking_request,
  is_booking_participant, booking_is_active_for_messaging to anon, authenticated;

-- ---- rewritten policies -----------------------------------------------------

drop policy if exists "skipper reads own profile" on skipper_profiles;
create policy "skipper reads own profile" on skipper_profiles for select using (
  user_id = auth.uid()
  or is_admin()
  or client_shares_booking_with_skipper(id)
);

drop policy if exists "skipper reads pinging client stats" on client_profiles;
create policy "skipper reads pinging client stats" on client_profiles for select using (
  skipper_was_pinged_by_client(user_id)
);

drop policy if exists "client reads own requests" on booking_requests;
create policy "client reads own requests" on booking_requests for select using (
  client_id = auth.uid()
  or is_admin()
  or skipper_pinged_for_request(id)
);

drop policy if exists "ping visible to client and pinged skipper" on booking_request_pings;
create policy "ping visible to client and pinged skipper" on booking_request_pings for select using (
  is_admin()
  or owns_booking_request(booking_request_id)
  or skipper_id = my_skipper_profile_id()
);

drop policy if exists "booking visible to participants" on bookings;
create policy "booking visible to participants" on bookings for select using (
  is_admin()
  or client_id = auth.uid()
  or skipper_id = my_skipper_profile_id()
);

drop policy if exists "cancellation report visible to participants" on cancellation_reports;
create policy "cancellation report visible to participants" on cancellation_reports for select using (
  is_admin() or is_booking_participant(booking_id)
);

drop policy if exists "messages visible to booking participants" on messages;
create policy "messages visible to booking participants" on messages for select using (
  is_admin() or is_booking_participant(booking_id)
);

drop policy if exists "participant sends message" on messages;
create policy "participant sends message" on messages for insert with check (
  sender_id = auth.uid() and booking_is_active_for_messaging(booking_id)
);

-- The skipper join tables checked skipper_profiles inline too; same fix.
drop policy if exists "skipper join owner write" on skipper_languages;
create policy "skipper join owner write" on skipper_languages for all
  using (skipper_id = my_skipper_profile_id())
  with check (skipper_id = my_skipper_profile_id());

drop policy if exists "skipper join owner write" on skipper_boat_types;
create policy "skipper join owner write" on skipper_boat_types for all
  using (skipper_id = my_skipper_profile_id())
  with check (skipper_id = my_skipper_profile_id());

drop policy if exists "skipper join owner write" on skipper_coverage_areas;
create policy "skipper join owner write" on skipper_coverage_areas for all
  using (skipper_id = my_skipper_profile_id())
  with check (skipper_id = my_skipper_profile_id());

drop policy if exists "availability owner write" on skipper_availability;
create policy "availability owner write" on skipper_availability for all
  using (skipper_id = my_skipper_profile_id())
  with check (skipper_id = my_skipper_profile_id());
