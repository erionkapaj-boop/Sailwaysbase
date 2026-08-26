-- ============================================================================
-- Διόρθωση εμβέλειας: οι 6 κατηγορίες αξιολόγησης (0033) ισχύουν ΜΟΝΟ όταν ο
-- αξιολογούμενος επαγγελματίας έχει crew_role = 'skipper'. Η προηγούμενη
-- έκδοση έλεγχε μόνο «είναι ο επαγγελματίας αυτής της κράτησης», που θα
-- ανάγκαζε και μελλοντικές κρατήσεις hostess/cook/deckhand στις ίδιες 6
-- ναυτικές κατηγορίες (π.χ. «Ναυτοσύνη») — αυτές οι ιδιότητες θα πάρουν δικό
-- τους σύνολο κατηγοριών αργότερα. Μέχρι τότε παραμένουν στο απλό μονό 1-5,
-- όπως ο πελάτης.
-- ============================================================================

create or replace function enforce_review_categories() returns trigger
language plpgsql as $$
declare
  v_client_id uuid;
  v_skipper_user_id uuid;
  v_skipper_role crew_role;
begin
  select b.client_id, sp.user_id, sp.role into v_client_id, v_skipper_user_id, v_skipper_role
    from bookings b join skipper_profiles sp on sp.id = b.skipper_id
    where b.id = new.booking_id;

  if new.reviewee_id = v_skipper_user_id and v_skipper_role = 'skipper' then
    if new.rating_safety is null or new.rating_seamanship is null or new.rating_professionalism is null
       or new.rating_cleanliness is null or new.rating_communication is null or new.rating_hospitality is null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_safety + new.rating_seamanship + new.rating_professionalism +
      new.rating_cleanliness + new.rating_communication + new.rating_hospitality
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_skipper_user_id or new.reviewee_id = v_client_id then
    -- Ο πελάτης, ή ένας επαγγελματίας άλλης ιδιότητας εκτός skipper: απλό
    -- μονό rating, καμία κατηγορία δεν επιτρέπεται.
    if new.rating_safety is not null or new.rating_seamanship is not null or new.rating_professionalism is not null
       or new.rating_cleanliness is not null or new.rating_communication is not null or new.rating_hospitality is not null then
      raise exception 'categories_not_allowed';
    end if;
  else
    raise exception 'reviewee_not_participant';
  end if;
  return new;
end;
$$;
