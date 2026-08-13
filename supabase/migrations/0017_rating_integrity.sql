-- ============================================================================
-- How the rating is computed.
--
-- It was a plain arithmetic mean, kept incrementally:
--   rating_avg = round((rating_avg * rating_count + new.rating) / (count+1), 2)
--
-- The mean itself is the right thing to *show* — it's what anyone reading a
-- star row expects. Three things about the bookkeeping were not right:
--
-- 1. Rounding fed back into itself. Each insert rounded to 2 decimals and the
--    rounded figure became the base for the next one, so the stored average
--    slowly drifted away from the real mean of the reviews.
--
-- 2. The trigger was INSERT-only. Deleting a review (moderating abuse) or
--    correcting its rating left rating_avg and rating_count permanently
--    reflecting a review that no longer existed.
--
-- 3. Ranking used the raw mean, so one 5-star review outranked fifty
--    averaging 4.9. That is both unfair to a long track record and trivially
--    gamed by a single friendly first customer.
--
-- Fixes: recompute from the reviews table (exact, and correct under
-- update/delete), and rank on a shrunk average rather than the raw one.
-- The displayed number stays the honest mean, with its count next to it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Recompute from source instead of accumulating.
-- ----------------------------------------------------------------------------
create or replace function recalc_user_rating(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role;
  v_avg numeric;
  v_count int;
begin
  if p_user_id is null then return; end if;
  select role into v_role from users where id = p_user_id;

  select round(avg(rating)::numeric, 2), count(*)
    into v_avg, v_count
    from reviews where reviewee_id = p_user_id;

  -- Writes go through the privileged-column guard, which only lets the
  -- platform itself touch rating fields.
  perform set_config('platform.trusted', 'true', true);

  if v_role = 'skipper' then
    update skipper_profiles
      set rating_avg = v_avg, rating_count = coalesce(v_count, 0)
      where user_id = p_user_id;
  elsif v_role = 'client' then
    update client_profiles
      set rating_avg = v_avg, rating_count = coalesce(v_count, 0)
      where user_id = p_user_id;
  end if;
end;
$$;

create or replace function apply_review_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- On an edited review the reviewee could in principle change, so both the
  -- old and the new subject are recomputed.
  if tg_op in ('UPDATE', 'DELETE') then
    perform recalc_user_rating(old.reviewee_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform recalc_user_rating(new.reviewee_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_apply_review_rating on reviews;
create trigger trg_apply_review_rating
  after insert or update of rating, reviewee_id or delete on reviews
  for each row execute function apply_review_rating();

-- One-off repair of any drift the old incremental version already left behind.
do $$
declare r record;
begin
  for r in select distinct reviewee_id from reviews loop
    perform recalc_user_rating(r.reviewee_id);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ranking: shrink the average toward a prior so volume counts for something.
--
-- Same idea as IMDb's weighted rating. PRIOR_WEIGHT is roughly "how many
-- reviews before the real average is trusted over the prior"; below that a
-- profile sits near the prior instead of at whatever its handful of reviews
-- happens to say.
-- ----------------------------------------------------------------------------
create or replace function bayesian_rating(p_avg numeric, p_count int)
returns numeric
language sql immutable as $$
  select round(
    ((4.4 * 8) + coalesce(p_avg, 0) * coalesce(p_count, 0))::numeric / (8 + coalesce(p_count, 0)),
    4
  );
$$;
grant execute on function bayesian_rating(numeric, int) to anon, authenticated;

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
           bayesian_rating(sp.rating_avg, sp.rating_count) desc;
$$;
grant execute on function search_available_skippers to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Tier: don't let a single review decide it.
--
-- The 'high' branch already required 10 completed bookings, but the 'low'
-- branch didn't guard on volume at all — one unlucky first customer rating a
-- 2 dropped a brand-new professional straight to the bottom tier, where they
-- rank last in every search and so struggle to earn the reviews that would
-- lift them back out.
-- ----------------------------------------------------------------------------
create or replace function recompute_skipper_tier() returns trigger
language plpgsql as $$
declare v_tier skipper_tier;
begin
  if new.completed_bookings_count = 0 and new.rating_count = 0 then
    v_tier := 'medium';
  elsif coalesce(new.reliability_percentage, 100) < 70
        or (new.rating_count >= 3 and coalesce(new.rating_avg, 5) < 3) then
    v_tier := 'low';
  elsif new.completed_bookings_count >= 10
        and coalesce(new.rating_avg, 0) >= 4.5
        and coalesce(new.reliability_percentage, 0) >= 90 then
    v_tier := 'high';
  else
    v_tier := 'medium';
  end if;

  if v_tier is distinct from new.tier then
    perform set_config('platform.trusted', 'true', true);
    update skipper_profiles set tier = v_tier where id = new.id;
  end if;
  return null;
end;
$$;
