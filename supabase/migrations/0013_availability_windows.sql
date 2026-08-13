-- ============================================================================
-- Availability becomes a positive declaration tied to place.
--
-- The old model had two disconnected pieces: skipper_availability held
-- blackout dates ("everything not listed is available"), and
-- skipper_coverage_areas held one fixed list of ports for all time. That
-- can't express the actual working pattern — available out of Mykonos over
-- summer, out of Volos in winter — because the ports were global to the
-- profile rather than attached to a period.
--
-- Now a professional declares windows: "these dates, from these ports".
-- Anything not covered by a window is simply not available, which is also
-- safer than the blackout default: forgetting to update your calendar makes
-- you invisible rather than bookable on a date you can't work.
-- ============================================================================

create table if not exists availability_windows (
  id uuid primary key default gen_random_uuid(),
  skipper_id uuid not null references skipper_profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  -- "Anywhere" is a common answer for delivery-style work, and storing it as
  -- a flag avoids inserting a row per port every time.
  all_ports boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists availability_windows_skipper_idx
  on availability_windows (skipper_id, start_date, end_date);

create table if not exists availability_window_ports (
  window_id uuid not null references availability_windows(id) on delete cascade,
  port_id uuid not null references ports(id) on delete cascade,
  primary key (window_id, port_id)
);

alter table availability_windows enable row level security;
alter table availability_window_ports enable row level security;

-- Public read: the search runs for anonymous visitors.
drop policy if exists "availability windows public read" on availability_windows;
create policy "availability windows public read" on availability_windows for select using (true);

drop policy if exists "availability windows owner write" on availability_windows;
create policy "availability windows owner write" on availability_windows for all
  using (skipper_id = my_skipper_profile_id())
  with check (skipper_id = my_skipper_profile_id());

drop policy if exists "window ports public read" on availability_window_ports;
create policy "window ports public read" on availability_window_ports for select using (true);

drop policy if exists "window ports owner write" on availability_window_ports;
create policy "window ports owner write" on availability_window_ports for all
  using (
    exists (
      select 1 from availability_windows w
      where w.id = window_id and w.skipper_id = my_skipper_profile_id()
    )
  )
  with check (
    exists (
      select 1 from availability_windows w
      where w.id = window_id and w.skipper_id = my_skipper_profile_id()
    )
  );

-- ----------------------------------------------------------------------------
-- Search: from "not blacked out" to "positively covered".
--
-- range_agg unions a professional's windows for the requested port, so a
-- request spanning two adjacent windows (1–15 July and 16–31 July) still
-- matches — checking each window separately would wrongly reject it.
-- ----------------------------------------------------------------------------
drop function if exists search_available_skippers(date, date, uuid, uuid, numeric, text);

create function search_available_skippers(
  p_start date,
  p_end date,
  p_port_id uuid,
  p_boat_type_id uuid,
  p_max_price numeric default null,
  p_gender text default null
) returns setof skipper_public
language sql stable as $$
  select sp.* from skipper_public sp
  where exists (
      select 1 from skipper_boat_types bt where bt.skipper_id = sp.id and bt.boat_type_id = p_boat_type_id
    )
    -- Available for the whole requested range, out of the requested port.
    and (
      select coalesce(range_agg(daterange(w.start_date, w.end_date, '[]')), '{}'::datemultirange)
      from availability_windows w
      where w.skipper_id = sp.id
        and (
          w.all_ports
          or exists (
            select 1 from availability_window_ports wp
            where wp.window_id = w.id and wp.port_id = p_port_id
          )
        )
    ) @> daterange(p_start, p_end, '[]')
    -- ...and not already committed elsewhere in that range.
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
    and (p_max_price is null or sp.price_per_day <= p_max_price)
    and (p_gender is null or sp.gender = p_gender)
  order by case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
           sp.rating_avg desc nulls last;
$$;
grant execute on function search_available_skippers to anon, authenticated;

-- Lets the profile page answer "is this person findable?" honestly, instead
-- of hard-coding the availability criterion to false.
create or replace function has_future_availability(p_skipper_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from availability_windows
    where skipper_id = p_skipper_id and end_date >= current_date
  );
$$;
grant execute on function has_future_availability to anon, authenticated;
