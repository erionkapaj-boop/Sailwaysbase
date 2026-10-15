-- «Δεν ξέρω ακόμα» (0131): ο πελάτης που ψάχνει skipper πριν κλείσει σκάφος δεν έχει τύπο σκάφους.
-- Χωρίς τύπο (null) η αναζήτηση δεν φιλτράρει ανά σκάφος· με τύπο ισχύει ό,τι και πριν.
-- Το αίτημα αποθηκεύεται με boat_type_id null (η στήλη επιτρέπει null από το 0039).
-- Ίδια υπογραφή και σώμα με την έκδοση του 0081, με μία μόνο αλλαγή. Ασφαλές να ξανατρέξει.

create or replace function search_available_skippers_all(
  p_start date,
  p_end date,
  p_region_id uuid,
  p_boat_type_id uuid,
  p_max_price numeric default null,
  p_gender text default null,
  p_crew_role crew_role default 'skipper',
  p_language_id uuid default null
) returns setof skipper_public
language sql stable security definer set search_path = public as $$
  select sp.* from skipper_public sp
  where sp.role = p_crew_role
    and (
      p_crew_role <> 'skipper' or p_boat_type_id is null or exists (
        select 1 from skipper_boat_types bt where bt.skipper_id = sp.id and bt.boat_type_id = p_boat_type_id
      )
    )
    and not exists (
      select 1 from skipper_profiles own where own.id = sp.id and own.user_id = auth.uid()
    )
    and net_availability(sp.id, null, p_region_id, p_crew_role) @> daterange(p_start, p_end, '[]')
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
    and (p_max_price is null or sp.price_per_day <= p_max_price)
    and (p_gender is null or sp.gender = p_gender)
    and (
      p_language_id is null or exists (
        select 1 from user_languages ul
        join skipper_profiles spx on spx.user_id = ul.user_id
        where spx.id = sp.id and ul.language_id = p_language_id
      )
    )
  order by case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
           skipper_rank_score(
             sp.rating_avg,
             sp.rating_count,
             cancellation_standing(sp.id),
             skipper_response_rate(sp.id)
           ) desc;
$$;
