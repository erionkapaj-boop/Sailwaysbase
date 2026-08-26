-- ============================================================================
-- ΣΟΒΑΡΟ ΕΥΡΗΜΑ από βαθύ έλεγχο (όχι κάτι που πρόσθεσε αυτή η σεζόν δουλειάς —
-- προϋπήρχε από το 0005/0013): search_available_skippers τρέχει ΧΩΡΙΣ
-- security definer, άρα η δική της υποερώτηση
--   not exists (select 1 from bookings b where b.skipper_id = sp.id and
--               b.status in ('confirmed','completed') and daterange(...) && ...)
-- διαβάζει τον πίνακα bookings ΜΕ τα δικαιώματα του καλούντος. Η RLS policy
-- "booking visible to participants" δείχνει μια κράτηση ΜΟΝΟ στον πελάτη ή
-- τον επαγγελματία της — άρα για οποιονδήποτε άλλο ψάχνει (δηλαδή σχεδόν
-- πάντα, αφού μια νέα αναζήτηση είναι εξ ορισμού από κάποιον χωρίς καμία
-- σχέση με τις υπάρχουσες κρατήσεις του επαγγελματία), η RLS κρύβει ΟΛΕΣ τις
-- γραμμές bookings αυτού του επαγγελματία, το NOT EXISTS γίνεται πάντα true,
-- και ο επαγγελματίας εμφανίζεται "ελεύθερος" ακριβώς τις ημέρες που έχει
-- ήδη ΕΠΙΒΕΒΑΙΩΜΕΝΗ κράτηση με κάποιον άλλον.
--
-- Επιβεβαιώθηκε τοπικά: ένας εντελώς άσχετος πελάτης έβλεπε έναν skipper
-- διαθέσιμο στις ίδιες ακριβώς ημερομηνίες όπου ο skipper είχε ήδη
-- επιβεβαιωμένη κράτηση με άλλον πελάτη — πραγματικός κίνδυνος διπλής
-- κράτησης.
--
-- Διόρθωση: security definer (όπως σχεδόν κάθε άλλη συνάρτηση σε αυτή τη
-- βάση που χρειάζεται να δει δεδομένα πέρα από αυτά που θα έβλεπε ο ίδιος ο
-- καλών) — η ίδια η έξοδος παραμένει η δημόσια skipper_public όψη, τίποτα
-- παραπάνω δεν διαρρέει, αλλάζει μόνο τι μπορεί να δει ΕΣΩΤΕΡΙΚΑ για να
-- αποφασίσει σωστά.
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
language sql stable security definer set search_path = public as $$
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
