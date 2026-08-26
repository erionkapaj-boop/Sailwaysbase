-- ============================================================================
-- Δεύτερο πραγματικό εύρημα από βαθύ έλεγχο: search_available_skippers (0039)
-- είχε "or p_boat_type_id is null" μέσα στην ίδια συνθήκη με το
-- "p_crew_role <> 'skipper'" — αποτέλεσμα, μια κλήση για SKIPPER χωρίς κανένα
-- τύπο σκάφους (π.χ. απευθείας κλήση του RPC, χωρίς να περάσει από τη φόρμα
-- της αναζήτησης που το απαιτεί) παρέκαμπτε εντελώς το φίλτρο τύπου σκάφους
-- και επέστρεφε ΟΛΟΥΣ τους εγκεκριμένους skipper, ανεξαρτήτως αν είχαν καν
-- δηλώσει τον ζητούμενο τύπο. Πριν το 0039 (0033 και πριν) δεν υπήρχε αυτή η
-- διαφυγή — ένα null boat_type_id έδινε πάντα μηδέν αποτελέσματα. Το "or
-- p_boat_type_id is null" έπρεπε να ισχύει ΜΟΝΟ μαζί με το "p_crew_role <>
-- 'skipper'" (hostess/cook/deckhand δεν έχουν καν τύπο σκάφους), όχι
-- ανεξάρτητα.
-- ============================================================================

create or replace function search_available_skippers(
  p_start date,
  p_end date,
  p_port_id uuid,
  p_boat_type_id uuid,
  p_max_price numeric default null,
  p_gender text default null,
  p_crew_role crew_role default 'skipper'
) returns setof skipper_public
language sql stable as $$
  select sp.* from skipper_public sp
  where sp.role = p_crew_role
    and (
      p_crew_role <> 'skipper' or exists (
        select 1 from skipper_boat_types bt where bt.skipper_id = sp.id and bt.boat_type_id = p_boat_type_id
      )
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
             cancellation_standing(sp.id),
             skipper_response_rate(sp.id)
           ) desc;
$$;
