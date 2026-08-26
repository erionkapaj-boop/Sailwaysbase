-- ============================================================================
-- Ενεργοποίηση της ιδιότητας cook, στην ίδια λογική με την hostess (0039):
-- ίδιος πίνακας skipper_profiles (role='cook'), έγκριση από admin, αναζήτηση,
-- κράτηση — όλα ήδη γενικά μετά το 0039 (χωρίς τύπο σκάφους, με p_crew_role
-- στην αναζήτηση, με p_role στο admin_create_offer). Δεν χρειάζεται καμία
-- αλλαγή σε αναζήτηση/κράτηση/OfferComposer — μόνο τις 6 κατηγορίες
-- αξιολόγησης του cook.
--
-- Από τις 6, μόνο η «Καθαριότητα & Υγιεινή» ταυτίζεται νοηματικά με ήδη
-- υπάρχουσα στήλη (rating_cleanliness, ίδιο μοτίβο με την επαναχρησιμοποίηση
-- skipper/hostess) — οι άλλες 5 (γεύση, ποικιλία, παρουσίαση,
-- προσαρμοστικότητα, οργάνωση) είναι αμιγώς μαγειρικές, χωρίς αντιστοιχία σε
-- καμία υπάρχουσα κατηγορία (η "cooking" της hostess είναι για τη γενική
-- εντύπωση φαγητού μαζί με εξυπηρέτηση επισκεπτών, όχι το ίδιο πράγμα με το
-- να τρέχει κανείς ολόκληρη την κουζίνα).
-- ============================================================================

alter table reviews
  add column if not exists rating_taste int check (rating_taste is null or rating_taste between 1 and 5),
  add column if not exists rating_variety int check (rating_variety is null or rating_variety between 1 and 5),
  add column if not exists rating_presentation int check (rating_presentation is null or rating_presentation between 1 and 5),
  add column if not exists rating_adaptability int check (rating_adaptability is null or rating_adaptability between 1 and 5),
  add column if not exists rating_organization int check (rating_organization is null or rating_organization between 1 and 5);

alter table skipper_profiles
  add column if not exists rating_avg_taste numeric,
  add column if not exists rating_avg_variety numeric,
  add column if not exists rating_avg_presentation numeric,
  add column if not exists rating_avg_adaptability numeric,
  add column if not exists rating_avg_organization numeric;

create or replace function guard_skipper_profile_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.role := old.role;
  new.approval_status := old.approval_status;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.wallet_balance := old.wallet_balance;
  new.tier := old.tier;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.rating_avg_safety := old.rating_avg_safety;
  new.rating_avg_seamanship := old.rating_avg_seamanship;
  new.rating_avg_professionalism := old.rating_avg_professionalism;
  new.rating_avg_cleanliness := old.rating_avg_cleanliness;
  new.rating_avg_communication := old.rating_avg_communication;
  new.rating_avg_hospitality := old.rating_avg_hospitality;
  new.rating_avg_cooking := old.rating_avg_cooking;
  new.rating_avg_service := old.rating_avg_service;
  new.rating_avg_taste := old.rating_avg_taste;
  new.rating_avg_variety := old.rating_avg_variety;
  new.rating_avg_presentation := old.rating_avg_presentation;
  new.rating_avg_adaptability := old.rating_avg_adaptability;
  new.rating_avg_organization := old.rating_avg_organization;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  new.user_id := old.user_id;
  new.deleted_at := old.deleted_at;
  return new;
end;
$$;

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
       or new.rating_cleanliness is null or new.rating_communication is null or new.rating_hospitality is null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_boat_respect is not null or new.rating_responsibility is not null
       or new.rating_cooperation is not null or new.rating_consistency is not null
       or new.rating_conduct is not null or new.rating_tidiness is not null
       or new.rating_taste is not null or new.rating_variety is not null or new.rating_presentation is not null
       or new.rating_adaptability is not null or new.rating_organization is not null then
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
       or new.rating_adaptability is not null or new.rating_organization is not null then
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
       or new.rating_conduct is not null or new.rating_tidiness is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_taste + new.rating_variety + new.rating_presentation +
      new.rating_adaptability + new.rating_organization + new.rating_cleanliness
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_client_id then
    if new.rating_boat_respect is null or new.rating_responsibility is null or new.rating_cooperation is null
       or new.rating_consistency is null or new.rating_conduct is null or new.rating_tidiness is null
       or new.rating_safety is not null or new.rating_seamanship is not null or new.rating_professionalism is not null
       or new.rating_cleanliness is not null or new.rating_communication is not null or new.rating_hospitality is not null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_taste is not null or new.rating_variety is not null or new.rating_presentation is not null
       or new.rating_adaptability is not null or new.rating_organization is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_boat_respect + new.rating_responsibility + new.rating_cooperation +
      new.rating_consistency + new.rating_conduct + new.rating_tidiness
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_skipper_user_id then
    -- επαγγελματίας άλλης, μη υποστηριζόμενης ακόμα ιδιότητας (deckhand):
    -- απλό μονό rating, καμία κατηγορία δεν επιτρέπεται.
    if new.rating_safety is not null or new.rating_seamanship is not null or new.rating_professionalism is not null
       or new.rating_cleanliness is not null or new.rating_communication is not null or new.rating_hospitality is not null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_boat_respect is not null or new.rating_responsibility is not null
       or new.rating_cooperation is not null or new.rating_consistency is not null
       or new.rating_conduct is not null or new.rating_tidiness is not null
       or new.rating_taste is not null or new.rating_variety is not null or new.rating_presentation is not null
       or new.rating_adaptability is not null or new.rating_organization is not null then
      raise exception 'categories_not_allowed';
    end if;
  else
    raise exception 'reviewee_not_participant';
  end if;
  return new;
end;
$$;

create or replace function recalc_user_rating(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_skipper_avg numeric; v_skipper_count int;
  v_client_avg numeric; v_client_count int;
  v_safety numeric; v_seamanship numeric; v_professionalism numeric;
  v_cleanliness numeric; v_communication numeric; v_hospitality numeric;
  v_cooking numeric; v_service numeric;
  v_taste numeric; v_variety numeric; v_presentation numeric;
  v_adaptability numeric; v_organization numeric;
  v_boat_respect numeric; v_responsibility numeric; v_cooperation numeric;
  v_consistency numeric; v_conduct numeric; v_tidiness numeric;
begin
  if p_user_id is null then return; end if;

  select round(avg(r.rating)::numeric, 2), count(*),
         round(avg(r.rating_safety)::numeric, 2),
         round(avg(r.rating_seamanship)::numeric, 2),
         round(avg(r.rating_professionalism)::numeric, 2),
         round(avg(r.rating_cleanliness)::numeric, 2),
         round(avg(r.rating_communication)::numeric, 2),
         round(avg(r.rating_hospitality)::numeric, 2),
         round(avg(r.rating_cooking)::numeric, 2),
         round(avg(r.rating_service)::numeric, 2),
         round(avg(r.rating_taste)::numeric, 2),
         round(avg(r.rating_variety)::numeric, 2),
         round(avg(r.rating_presentation)::numeric, 2),
         round(avg(r.rating_adaptability)::numeric, 2),
         round(avg(r.rating_organization)::numeric, 2)
    into v_skipper_avg, v_skipper_count,
         v_safety, v_seamanship, v_professionalism, v_cleanliness, v_communication, v_hospitality,
         v_cooking, v_service, v_taste, v_variety, v_presentation, v_adaptability, v_organization
    from reviews r
    join bookings b on b.id = r.booking_id
    join skipper_profiles sp on sp.id = b.skipper_id
    where r.reviewee_id = p_user_id and sp.user_id = p_user_id;

  select round(avg(r.rating)::numeric, 2), count(*),
         round(avg(r.rating_boat_respect)::numeric, 2),
         round(avg(r.rating_responsibility)::numeric, 2),
         round(avg(r.rating_cooperation)::numeric, 2),
         round(avg(r.rating_consistency)::numeric, 2),
         round(avg(r.rating_conduct)::numeric, 2),
         round(avg(r.rating_tidiness)::numeric, 2)
    into v_client_avg, v_client_count,
         v_boat_respect, v_responsibility, v_cooperation, v_consistency, v_conduct, v_tidiness
    from reviews r
    join bookings b on b.id = r.booking_id
    where r.reviewee_id = p_user_id and b.client_id = p_user_id;

  perform set_config('platform.trusted', 'true', true);

  update skipper_profiles set
    rating_avg = v_skipper_avg, rating_count = coalesce(v_skipper_count, 0),
    rating_avg_safety = v_safety, rating_avg_seamanship = v_seamanship,
    rating_avg_professionalism = v_professionalism, rating_avg_cleanliness = v_cleanliness,
    rating_avg_communication = v_communication, rating_avg_hospitality = v_hospitality,
    rating_avg_cooking = v_cooking, rating_avg_service = v_service,
    rating_avg_taste = v_taste, rating_avg_variety = v_variety, rating_avg_presentation = v_presentation,
    rating_avg_adaptability = v_adaptability, rating_avg_organization = v_organization
    where user_id = p_user_id;
  update client_profiles set
    rating_avg = v_client_avg, rating_count = coalesce(v_client_count, 0),
    rating_avg_boat_respect = v_boat_respect, rating_avg_responsibility = v_responsibility,
    rating_avg_cooperation = v_cooperation, rating_avg_consistency = v_consistency,
    rating_avg_conduct = v_conduct, rating_avg_tidiness = v_tidiness
    where user_id = p_user_id;
end;
$$;

-- Αναζήτηση/skipper_public: προστίθενται οι 5 νέες στήλες μέσου όρου στην
-- έξοδο — ίδιο drop/create με το 0039, το view πρώτα (μόνο προσθήκη στηλών
-- στο τέλος, ασφαλές), μετά η συνάρτηση (ίδια υπογραφή με το 0039, άρα
-- CREATE OR REPLACE αρκεί, όχι DROP).
create or replace view skipper_public as
  select id, role, photo_url, gender, years_experience, license_type, price_per_day,
         rating_avg, rating_count,
         case
           when (completed_bookings_count + cancellation_flag_count)
                < (select value from platform_settings where key = 'reliability_min_history')
           then null
           else reliability_percentage
         end as reliability_percentage,
         tier,
         rating_avg_safety, rating_avg_seamanship, rating_avg_professionalism,
         rating_avg_cleanliness, rating_avg_communication, rating_avg_hospitality,
         rating_avg_cooking, rating_avg_service,
         rating_avg_taste, rating_avg_variety, rating_avg_presentation,
         rating_avg_adaptability, rating_avg_organization
  from skipper_profiles
  where approval_status = 'approved' and deleted_at is null;

-- Αναδρομικός επαναϋπολογισμός για το ήδη υπάρχον ιστορικό.
do $$
declare r record;
begin
  for r in select distinct user_id from skipper_profiles loop
    perform recalc_user_rating(r.user_id);
  end loop;
end $$;
