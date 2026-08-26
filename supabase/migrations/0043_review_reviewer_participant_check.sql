-- ============================================================================
-- Πραγματικό, σοβαρό κενό ασφαλείας βρέθηκε σε βαθύ έλεγχο: RLS επιτρέπει
-- insert σε reviews με μοναδικό όρο "reviewer_id = auth.uid()" — δεν ελέγχει
-- ότι ο reviewer είναι όντως ο ένας από τους δύο συμμετέχοντες στη
-- συγκεκριμένη κράτηση. Το ίδιο enforce_review_categories() ήλεγχε πάντα
-- μόνο ότι ο reviewee_id είναι ένας από τους δύο (client_id/skipper user_id
-- της κράτησης) — ΠΟΤΕ δεν ήλεγχε τον reviewer_id.
--
-- Αποτέλεσμα: ΟΠΟΙΟΣΔΗΠΟΤΕ συνδεδεμένος πελάτης μπορούσε να στείλει
-- αξιολόγηση (π.χ. 1 αστέρι σε όλες τις κατηγορίες) πάνω σε ΟΠΟΙΑΔΗΠΟΤΕ
-- ολοκληρωμένη κράτηση άλλου πελάτη με έναν επαγγελματία — αρκεί να ήξερε
-- (ή να μάντευε) το booking_id. Επιβεβαιώθηκε τοπικά: ένας πελάτης που ποτέ
-- δεν είχε καμία κράτηση με έναν skipper κατέβασε τη μέση βαθμολογία του σε
-- 1.00 με μία μόνο πλαστή αξιολόγηση. Το ίδιο ισχύει αντίστροφα
-- (επαγγελματίας αξιολογεί πελάτη που ποτέ δεν εξυπηρέτησε).
--
-- Διόρθωση: ο reviewer_id πρέπει να είναι ο ΑΛΛΟΣ συμμετέχων της
-- συγκεκριμένης κράτησης — αν αξιολογείται ο επαγγελματίας, ο reviewer
-- πρέπει να είναι ο πελάτης αυτής της κράτησης· αν αξιολογείται ο πελάτης,
-- ο reviewer πρέπει να είναι ο επαγγελματίας αυτής της κράτησης.
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

  if new.reviewee_id = v_skipper_user_id then
    if new.reviewer_id <> v_client_id then raise exception 'reviewer_not_participant'; end if;
  elsif new.reviewee_id = v_client_id then
    if new.reviewer_id <> v_skipper_user_id then raise exception 'reviewer_not_participant'; end if;
  end if;

  if new.reviewee_id = v_skipper_user_id and v_skipper_role = 'skipper' then
    if new.rating_safety is null or new.rating_seamanship is null or new.rating_professionalism is null
       or new.rating_cleanliness is null or new.rating_communication is null or new.rating_hospitality is null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_boat_respect is not null or new.rating_responsibility is not null
       or new.rating_cooperation is not null or new.rating_consistency is not null
       or new.rating_conduct is not null or new.rating_tidiness is not null
       or new.rating_taste is not null or new.rating_variety is not null or new.rating_presentation is not null
       or new.rating_adaptability is not null or new.rating_organization is not null
       or new.rating_maintenance is not null or new.rating_teamwork is not null or new.rating_diligence is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_safety + new.rating_seamanship + new.rating_professionalism +
      new.rating_cleanliness + new.rating_communication + new.rating_hospitality
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_skipper_user_id and v_skipper_role = 'hostess' then
    if new.rating_cleanliness is null or new.rating_cooking is null or new.rating_service is null
       or new.rating_professionalism is null or new.rating_communication is null or new.rating_hospitality is null
       or new.rating_safety is not null or new.rating_seamanship is not null
       or new.rating_boat_respect is not null or new.rating_responsibility is not null
       or new.rating_cooperation is not null or new.rating_consistency is not null
       or new.rating_conduct is not null or new.rating_tidiness is not null
       or new.rating_taste is not null or new.rating_variety is not null or new.rating_presentation is not null
       or new.rating_adaptability is not null or new.rating_organization is not null
       or new.rating_maintenance is not null or new.rating_teamwork is not null or new.rating_diligence is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_cleanliness + new.rating_cooking + new.rating_service +
      new.rating_professionalism + new.rating_communication + new.rating_hospitality
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_skipper_user_id and v_skipper_role = 'cook' then
    if new.rating_taste is null or new.rating_variety is null or new.rating_presentation is null
       or new.rating_adaptability is null or new.rating_organization is null or new.rating_cleanliness is null
       or new.rating_safety is not null or new.rating_seamanship is not null or new.rating_professionalism is not null
       or new.rating_communication is not null or new.rating_hospitality is not null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_boat_respect is not null or new.rating_responsibility is not null
       or new.rating_cooperation is not null or new.rating_consistency is not null
       or new.rating_conduct is not null or new.rating_tidiness is not null
       or new.rating_maintenance is not null or new.rating_teamwork is not null or new.rating_diligence is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_taste + new.rating_variety + new.rating_presentation +
      new.rating_adaptability + new.rating_organization + new.rating_cleanliness
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_skipper_user_id and v_skipper_role = 'deckhand' then
    if new.rating_seamanship is null or new.rating_safety is null or new.rating_maintenance is null
       or new.rating_cleanliness is null or new.rating_teamwork is null or new.rating_diligence is null
       or new.rating_professionalism is not null or new.rating_communication is not null or new.rating_hospitality is not null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_boat_respect is not null or new.rating_responsibility is not null
       or new.rating_cooperation is not null or new.rating_consistency is not null
       or new.rating_conduct is not null or new.rating_tidiness is not null
       or new.rating_taste is not null or new.rating_variety is not null or new.rating_presentation is not null
       or new.rating_adaptability is not null or new.rating_organization is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_seamanship + new.rating_safety + new.rating_maintenance +
      new.rating_cleanliness + new.rating_teamwork + new.rating_diligence
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_client_id then
    if new.rating_boat_respect is null or new.rating_responsibility is null or new.rating_cooperation is null
       or new.rating_consistency is null or new.rating_conduct is null or new.rating_tidiness is null
       or new.rating_safety is not null or new.rating_seamanship is not null or new.rating_professionalism is not null
       or new.rating_cleanliness is not null or new.rating_communication is not null or new.rating_hospitality is not null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_taste is not null or new.rating_variety is not null or new.rating_presentation is not null
       or new.rating_adaptability is not null or new.rating_organization is not null
       or new.rating_maintenance is not null or new.rating_teamwork is not null or new.rating_diligence is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_boat_respect + new.rating_responsibility + new.rating_cooperation +
      new.rating_consistency + new.rating_conduct + new.rating_tidiness
    )::numeric / 6, 2);
  else
    raise exception 'reviewee_not_participant';
  end if;
  return new;
end;
$$;

-- Καθαρισμός: πλαστές αξιολογήσεις που πέρασαν πριν από αυτή τη διόρθωση θα
-- έμειναν στη βάση με λάθος reviewer_id (δεν συμπίπτει με κανέναν από τους
-- δύο συμμετέχοντες της κράτησης). Ασφαλές να τρέξει ξανά — αν δεν υπάρχει
-- καμία τέτοια γραμμή, το DELETE δεν κάνει τίποτα.
delete from reviews r
where not exists (
  select 1 from bookings b join skipper_profiles sp on sp.id = b.skipper_id
  where b.id = r.booking_id
    and r.reviewer_id in (b.client_id, sp.user_id)
    and r.reviewee_id in (b.client_id, sp.user_id)
    and r.reviewer_id <> r.reviewee_id
);

-- Επαναϋπολογισμός μετά τον καθαρισμό, για όποιον είχε ήδη πληγεί.
do $$
declare r record;
begin
  for r in select distinct user_id from skipper_profiles loop
    perform recalc_user_rating(r.user_id);
  end loop;
  for r in select distinct user_id from client_profiles loop
    perform recalc_user_rating(r.user_id);
  end loop;
end $$;
