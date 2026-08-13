-- ============================================================================
-- Closing days inside an open period.
--
-- Windows say "available these dates, from these ports". Until now the only
-- way to carve a holiday out of one was to delete it and rebuild it as two
-- windows around the gap — destructive, fiddly, and it threw away the fact
-- that the surrounding period was ever one thing.
--
-- Blocks subtract from windows instead. Availability is windows MINUS blocks,
-- so deleting a block reopens the days exactly as they were. This is NOT the
-- old skipper_availability blackout table coming back: that one meant
-- "available everywhere except here" with no positive declaration at all.
-- Here a block only ever removes days that a window already granted.
-- ============================================================================

create table if not exists availability_blocks (
  id uuid primary key default gen_random_uuid(),
  skipper_id uuid not null references skipper_profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists availability_blocks_skipper_idx
  on availability_blocks (skipper_id, start_date, end_date);

alter table availability_blocks enable row level security;

-- Public read: search runs for anonymous visitors and must subtract these.
drop policy if exists "availability blocks public read" on availability_blocks;
create policy "availability blocks public read" on availability_blocks for select using (true);

drop policy if exists "availability blocks owner write" on availability_blocks;
create policy "availability blocks owner write" on availability_blocks for all
  using (skipper_id = my_skipper_profile_id())
  with check (skipper_id = my_skipper_profile_id());

-- ----------------------------------------------------------------------------
-- Reusable: the days this professional is actually free, as one multirange.
-- Both the search filter and the profile's "are you findable" check need the
-- same subtraction, and duplicating it invites the two drifting apart.
-- ----------------------------------------------------------------------------
create or replace function net_availability(p_skipper_id uuid, p_port_id uuid default null)
returns datemultirange
language sql stable as $$
  select
    coalesce((
      select range_agg(daterange(w.start_date, w.end_date, '[]'))
      from availability_windows w
      where w.skipper_id = p_skipper_id
        and (
          p_port_id is null
          or w.all_ports
          or exists (
            select 1 from availability_window_ports wp
            where wp.window_id = w.id and wp.port_id = p_port_id
          )
        )
    ), '{}'::datemultirange)
    -
    coalesce((
      select range_agg(daterange(b.start_date, b.end_date, '[]'))
      from availability_blocks b
      where b.skipper_id = p_skipper_id
    ), '{}'::datemultirange);
$$;
grant execute on function net_availability(uuid, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Search and the visibility check, both rebuilt on net_availability.
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
    -- Declared for the whole requested range out of that port, minus any
    -- days the professional has since closed off.
    and net_availability(sp.id, p_port_id) @> daterange(p_start, p_end, '[]')
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

create or replace function has_future_availability(p_skipper_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from unnest(net_availability(p_skipper_id)) as r
    where upper(r) > current_date
  );
$$;
grant execute on function has_future_availability to anon, authenticated;
