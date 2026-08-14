-- ============================================================================
-- Ranking takes behaviour into account; the star rating stays a pure mean.
--
-- Agreed shape: what a client *reads* (stars + count) keeps meaning exactly
-- "the average of these reviews" and nothing else. Good behaviour is rewarded
-- where it actually pays — position in search results — plus honest,
-- separately-labelled badges. Nothing is silently blended into the stars.
--
-- ---------------------------------------------------------------------------
-- Measuring responsiveness without punishing the wrong people.
--
-- booking_request_pings.status already distinguishes the cases, but not
-- obviously:
--   'claimed'                      -> took the job
--   'missed'                       -> ONLY ever set when someone else claimed
--                                     first (claim_booking_request marks the
--                                     siblings). Losing a race is not a fault
--                                     and must not count against anyone.
--   'pending' + request expired    -> genuinely never acted on
--
-- So "ignored" is a still-pending ping on an expired request, and the ten
-- professionals who lost a race to a faster eleventh are excluded entirely.
-- Declining is added as a timestamp rather than a new enum value: enum
-- additions can't be used in the same transaction that creates them, which
-- makes them awkward to apply to a live database in one script.
-- ============================================================================

alter table booking_request_pings add column if not exists declined_at timestamptz;

-- Saying "not for me" is a response, and a useful one — it clears the
-- professional's inbox and stops the client waiting on someone who is never
-- going to answer. Status goes to 'missed' so it leaves the inbox; the
-- timestamp is what separates a decline from a lost race.
create or replace function decline_booking_request(p_request_id uuid, p_skipper_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()
  ) then
    raise exception 'not_owner';
  end if;

  update booking_request_pings
    set status = 'missed', declined_at = now()
  where booking_request_id = p_request_id
    and skipper_id = p_skipper_id
    and status = 'pending';

  if not found then raise exception 'ping_not_open'; end if;
end;
$$;
grant execute on function decline_booking_request(uuid, uuid) to authenticated;

create or replace function skipper_response_rate(p_skipper_id uuid)
returns numeric
language sql stable as $$
  with p as (
    select
      count(*) filter (where brp.status = 'claimed' or brp.declined_at is not null) as responded,
      count(*) filter (where brp.status = 'pending' and br.status = 'expired_unclaimed') as ignored
    from booking_request_pings brp
    join booking_requests br on br.id = brp.booking_request_id
    where brp.skipper_id = p_skipper_id
  )
  -- Shrunk toward a neutral prior for the same reason the star rating is:
  -- one answered request is not a 100% response rate.
  select round(((0.8 * 5) + responded)::numeric / (5 + responded + ignored), 4) from p;
$$;
grant execute on function skipper_response_rate(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- The composite used for ordering only. Never shown as a number: it has no
-- meaning a user could interpret, and presenting it would invite exactly the
-- misreading we avoided by keeping the stars clean.
--
-- Cancelling weighs more than not answering, deliberately: claiming
-- everything and then cancelling must not be a way to look responsive.
-- Nulls (nobody has any history on day one) land on neutral values rather
-- than zero, so a new profile is neither punished nor boosted.
-- ----------------------------------------------------------------------------
create or replace function skipper_rank_score(
  p_rating_avg numeric,
  p_rating_count int,
  p_reliability numeric,
  p_response numeric
) returns numeric
language sql immutable as $$
  select round(
      0.60 * (bayesian_rating(p_rating_avg, p_rating_count) / 5.0)
    + 0.25 * (coalesce(p_reliability, 90) / 100.0)
    + 0.15 * coalesce(p_response, 0.8)
  , 6);
$$;
grant execute on function skipper_rank_score(numeric, int, numeric, numeric) to anon, authenticated;

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

-- What the professional sees about their own standing: the two behavioural
-- figures, each labelled for what it actually measures.
create or replace function my_standing()
returns table(response_rate numeric, responded int, ignored int)
language sql stable security definer set search_path = public as $$
  with me as (select my_skipper_profile_id() as skipper_id)
  select
    skipper_response_rate((select skipper_id from me)),
    count(*) filter (where brp.status = 'claimed' or brp.declined_at is not null)::int,
    count(*) filter (where brp.status = 'pending' and br.status = 'expired_unclaimed')::int
  from booking_request_pings brp
  join booking_requests br on br.id = brp.booking_request_id
  where brp.skipper_id = (select skipper_id from me);
$$;
grant execute on function my_standing() to authenticated;
