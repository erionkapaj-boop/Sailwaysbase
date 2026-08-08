-- ============================================================================
-- Row Level Security. Deny-by-default; sensitive writes (approvals, wallet
-- credits, claims, cancellations) go through the SECURITY DEFINER functions
-- in 0002_functions.sql, which do their own auth.uid()/is_admin() checks, so
-- the RLS policies here mainly cover plain reads and simple owner-writes.
-- ============================================================================

alter table users enable row level security;
alter table client_profiles enable row level security;
alter table skipper_profiles enable row level security;
alter table languages enable row level security;
alter table skipper_languages enable row level security;
alter table boat_types enable row level security;
alter table skipper_boat_types enable row level security;
alter table ports enable row level security;
alter table skipper_coverage_areas enable row level security;
alter table skipper_availability enable row level security;
alter table booking_requests enable row level security;
alter table booking_request_pings enable row level security;
alter table bookings enable row level security;
alter table reviews enable row level security;
alter table cancellation_reports enable row level security;
alter table wallet_transactions enable row level security;
alter table messages enable row level security;
alter table admin_actions enable row level security;
alter table platform_settings enable row level security;

-- ---- lookups: public read, admin write ----
create policy "lookups readable by everyone" on languages for select using (true);
create policy "lookups readable by everyone" on boat_types for select using (true);
create policy "lookups readable by everyone" on ports for select using (true);
create policy "lookups admin write" on languages for all using (is_admin()) with check (is_admin());
create policy "lookups admin write" on boat_types for all using (is_admin()) with check (is_admin());
create policy "lookups admin write" on ports for all using (is_admin()) with check (is_admin());

create policy "settings readable by everyone" on platform_settings for select using (true);
create policy "settings admin write" on platform_settings for all using (is_admin()) with check (is_admin());

-- ---- users ----
create policy "user reads own row" on users for select using (id = auth.uid() or is_admin());
create policy "user inserts own row" on users for insert with check (id = auth.uid());
create policy "user updates own row" on users for update using (id = auth.uid() or is_admin());

-- ---- client_profiles ----
create policy "client reads own profile" on client_profiles for select using (user_id = auth.uid() or is_admin());
create policy "client inserts own profile" on client_profiles for insert with check (user_id = auth.uid());
create policy "client updates own profile" on client_profiles for update using (user_id = auth.uid() or is_admin());
-- a skipper can see the anonymised reliability/rating of a client who pinged them
create policy "skipper reads pinging client stats" on client_profiles for select using (
  exists (
    select 1 from booking_requests br
    join booking_request_pings p on p.booking_request_id = br.id
    join skipper_profiles sp on sp.id = p.skipper_id
    where br.client_id = client_profiles.user_id and sp.user_id = auth.uid()
  )
);

-- ---- skipper_profiles ----
-- Anonymous/public search must NOT go through this table directly (it holds
-- full_name + license_number); the app queries the `skipper_public` view
-- instead. This table's own SELECT policy only allows the owner, admin, or
-- a client/skipper who share a confirmed+ booking (post-reveal, §6).
create policy "skipper reads own profile" on skipper_profiles for select using (
  user_id = auth.uid()
  or is_admin()
  or exists (
    select 1 from bookings b
    where b.skipper_id = skipper_profiles.id
      and b.status in ('confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_skipper')
      and b.client_id = auth.uid()
  )
);
create policy "skipper inserts own profile" on skipper_profiles for insert with check (user_id = auth.uid());
create policy "skipper updates own profile" on skipper_profiles for update using (user_id = auth.uid() or is_admin());

create view skipper_public as
  select id, photo_url, gender, bio, years_experience, license_type, price_per_day,
         rating_avg, rating_count, reliability_percentage, tier
  from skipper_profiles
  where approval_status = 'approved' and deleted_at is null;
grant select on skipper_public to anon, authenticated;

-- ---- skipper join/lookup tables: public read (no PII), owner write ----
create policy "skipper join public read" on skipper_languages for select using (true);
create policy "skipper join owner write" on skipper_languages for all using (
  exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
) with check (
  exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
);

create policy "skipper join public read" on skipper_boat_types for select using (true);
create policy "skipper join owner write" on skipper_boat_types for all using (
  exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
) with check (
  exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
);

create policy "skipper join public read" on skipper_coverage_areas for select using (true);
create policy "skipper join owner write" on skipper_coverage_areas for all using (
  exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
) with check (
  exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
);

create policy "availability public read" on skipper_availability for select using (true);
create policy "availability owner write" on skipper_availability for all using (
  exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
) with check (
  exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
);

-- ---- booking_requests ----
create policy "client reads own requests" on booking_requests for select using (
  client_id = auth.uid()
  or is_admin()
  or exists (
    select 1 from booking_request_pings p
    join skipper_profiles sp on sp.id = p.skipper_id
    where p.booking_request_id = booking_requests.id and sp.user_id = auth.uid()
  )
);
create policy "client inserts own request" on booking_requests for insert with check (client_id = auth.uid());
create policy "client updates own open request" on booking_requests for update using (
  client_id = auth.uid() or is_admin()
);

-- ---- booking_request_pings ----
create policy "ping visible to client and pinged skipper" on booking_request_pings for select using (
  is_admin()
  or exists (select 1 from booking_requests br where br.id = booking_request_id and br.client_id = auth.uid())
  or exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
);

-- ---- bookings ----
create policy "booking visible to participants" on bookings for select using (
  is_admin()
  or client_id = auth.uid()
  or exists (select 1 from skipper_profiles sp where sp.id = skipper_id and sp.user_id = auth.uid())
);
create policy "admin updates booking" on bookings for update using (is_admin());

-- ---- reviews ----
create policy "reviews publicly readable" on reviews for select using (true);
create policy "reviewer posts own review" on reviews for insert with check (reviewer_id = auth.uid());
create policy "reviewee replies to own review" on reviews for update using (reviewee_id = auth.uid());

-- ---- cancellation_reports ----
create policy "cancellation report visible to participants" on cancellation_reports for select using (
  is_admin()
  or exists (
    select 1 from bookings b
    where b.id = booking_id
      and (b.client_id = auth.uid() or exists (
        select 1 from skipper_profiles sp where sp.id = b.skipper_id and sp.user_id = auth.uid()
      ))
  )
);

-- ---- wallet_transactions ----
create policy "wallet ledger visible to owner" on wallet_transactions for select using (
  user_id = auth.uid() or is_admin()
);

-- ---- messages ----
create policy "messages visible to booking participants" on messages for select using (
  is_admin()
  or exists (
    select 1 from bookings b
    where b.id = booking_id
      and (b.client_id = auth.uid() or exists (
        select 1 from skipper_profiles sp where sp.id = b.skipper_id and sp.user_id = auth.uid()
      ))
  )
);
create policy "participant sends message" on messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from bookings b
    where b.id = booking_id
      and b.status in ('confirmed', 'completed')
      and (b.client_id = auth.uid() or exists (
        select 1 from skipper_profiles sp where sp.id = b.skipper_id and sp.user_id = auth.uid()
      ))
  )
);

-- ---- admin_actions ----
create policy "admin actions visible to admins" on admin_actions for select using (is_admin());
