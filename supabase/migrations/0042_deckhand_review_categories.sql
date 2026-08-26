-- ============================================================================
-- Ενεργοποίηση της ιδιότητας ναύτη (deckhand) — τελευταία από τις 4
-- επαγγελματικές ιδιότητες, ίδια λογική με hostess/cook (0039/0041): ίδιος
-- πίνακας skipper_profiles (role='deckhand'), αναζήτηση/κράτηση ήδη γενικά,
-- μόνο οι 6 δικές του κατηγορίες αξιολόγησης χρειάζονται δουλειά.
--
-- 3 από τις 6 ταυτίζονται νοηματικά και στο όνομα με ήδη υπάρχουσες στήλες
-- του skipper (Ναυτοσύνη -> rating_seamanship, Ασφάλεια -> rating_safety,
-- Καθαριότητα & Τάξη -> rating_cleanliness) — ίδιο μοτίβο επαναχρησιμοποίησης
-- με hostess/cook. Οι άλλες 3 (συντήρηση, συνεργασία με το πλήρωμα,
-- εργατικότητα) δεν έχουν αντιστοιχία πουθενά· η "Συνεργασία" εδώ σημαίνει
-- ομαδικότητα με το πλήρωμα, όχι το ίδιο πράγμα με το rating_cooperation του
-- πελάτη (που είναι για το πόσο συνεργάσιμος ήταν ο πελάτης) — παραμένει
-- ξεχωριστή στήλη ώστε να μη σημαίνει δύο πράγματα ανάλογα με το ποιος
-- αξιολογείται, όπως και στο 0040.
-- ============================================================================

alter table reviews
  add column if not exists rating_maintenance int check (rating_maintenance is null or rating_maintenance between 1 and 5),
  add column if not exists rating_teamwork int check (rating_teamwork is null or rating_teamwork between 1 and 5),
  add column if not exists rating_diligence int check (rating_diligence is null or rating_diligence between 1 and 5);

alter table skipper_profiles
  add column if not exists rating_avg_maintenance numeric,
  add column if not exists rating_avg_teamwork numeric,
  add column if not exists rating_avg_diligence numeric;

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
  new.rating_avg_maintenance := old.rating_avg_maintenance;
  new.rating_avg_teamwork := old.rating_avg_teamwork;
  new.rating_avg_diligence := old.rating_avg_diligence;
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
  v_maintenance numeric; v_teamwork numeric; v_diligence numeric;
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
         round(avg(r.rating_organization)::numeric, 2),
         round(avg(r.rating_maintenance)::numeric, 2),
         round(avg(r.rating_teamwork)::numeric, 2),
         round(avg(r.rating_diligence)::numeric, 2)
    into v_skipper_avg, v_skipper_count,
         v_safety, v_seamanship, v_professionalism, v_cleanliness, v_communication, v_hospitality,
         v_cooking, v_service, v_taste, v_variety, v_presentation, v_adaptability, v_organization,
         v_maintenance, v_teamwork, v_diligence
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
    rating_avg_adaptability = v_adaptability, rating_avg_organization = v_organization,
    rating_avg_maintenance = v_maintenance, rating_avg_teamwork = v_teamwork, rating_avg_diligence = v_diligence
    where user_id = p_user_id;
  update client_profiles set
    rating_avg = v_client_avg, rating_count = coalesce(v_client_count, 0),
    rating_avg_boat_respect = v_boat_respect, rating_avg_responsibility = v_responsibility,
    rating_avg_cooperation = v_cooperation, rating_avg_consistency = v_consistency,
    rating_avg_conduct = v_conduct, rating_avg_tidiness = v_tidiness
    where user_id = p_user_id;
end;
$$;

-- skipper_public: πάλι καθαρή προσθήκη στηλών στο τέλος, το
-- search_available_skippers (sp.*) τις παίρνει αυτόματα χωρίς να χρειάζεται
-- να ξαναφτιαχτεί (επιβεβαιωμένο τοπικά στο 0041).
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
         rating_avg_adaptability, rating_avg_organization,
         rating_avg_maintenance, rating_avg_teamwork, rating_avg_diligence
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
