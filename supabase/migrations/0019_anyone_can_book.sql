-- ============================================================================
-- Booking crew stops being tied to the account type.
--
-- users.role was doing two jobs: "is this person a professional" and "is this
-- person allowed to hire". Only the first is real. A skipper needs a hostess
-- for a charter as often as anyone else, and nothing about being registered
-- as crew should stand in the way.
--
-- So: client_profiles becomes the customer side of *every* account, held by
-- professionals and clients alike, while users.role keeps meaning only
-- "do they also have a professional profile and dashboard". The RLS on
-- client_profiles was already role-agnostic (user_id = auth.uid()), so the
-- permissions need no change — only the rows need to exist.
-- ============================================================================

-- Every existing account gets its customer side.
insert into client_profiles (user_id)
select u.id from users u
where u.role in ('client', 'skipper')
  and not exists (select 1 from client_profiles cp where cp.user_id = u.id)
on conflict do nothing;

-- ...and every future one, so the app never has to remember to.
create or replace function ensure_client_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role in ('client', 'skipper') then
    insert into client_profiles (user_id) values (new.id) on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ensure_client_profile on users;
create trigger trg_ensure_client_profile
  after insert on users
  for each row execute function ensure_client_profile();

-- ----------------------------------------------------------------------------
-- You cannot hire yourself.
--
-- This was impossible before only because professionals couldn't book at all;
-- opening that up makes it reachable. Blocked at the ping rather than at the
-- claim so it can never be created in the first place, whichever path
-- inserts it — a self-claim would otherwise move money between a person's own
-- two wallets and manufacture a completed booking.
-- ----------------------------------------------------------------------------
create or replace function reject_self_ping() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1
    from booking_requests br
    join skipper_profiles sp on sp.id = new.skipper_id
    where br.id = new.booking_request_id
      and br.client_id = sp.user_id
  ) then
    raise exception 'cannot_hire_self';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reject_self_ping on booking_request_pings;
create trigger trg_reject_self_ping
  before insert on booking_request_pings
  for each row execute function reject_self_ping();

-- Keep yourself out of your own results, so the rule above never has to
-- surface as an error the user didn't see coming.
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
    and not exists (
      select 1 from skipper_profiles own where own.id = sp.id and own.user_id = auth.uid()
    )
    and net_availability(sp.id, p_port_id) @> daterange(p_start, p_end, '[]')
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
    and (p_max_price is null or sp.price_per_day <= p_max_price)
    and (p_gender is null or sp.gender = p_gender)
  order by case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
           skipper_rank_score(
             sp.rating_avg,
             sp.rating_count,
             sp.reliability_percentage,
             skipper_response_rate(sp.id)
           ) desc;
$$;
grant execute on function search_available_skippers to anon, authenticated;
