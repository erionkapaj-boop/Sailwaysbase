-- ============================================================================
-- Ο πελάτης αξιολογείται πλέον κι αυτός σε 6 κατηγορίες (μέχρι τώρα έπαιρνε
-- απλό μονό 1-5 από τον επαγγελματία) — ίδια λογική με τον skipper/hostess:
-- ο επαγγελματίας βαθμολογεί κάθε κατηγορία ξεχωριστά, το συνολικό rating
-- είναι ο μέσος όρος τους, δεν επιλέγεται απευθείας.
--
-- Καμία από τις 6 δεν ταυτίζεται νοηματικά με καμία από τις κατηγορίες
-- skipper/hostess (αυτές μιλάνε για το πώς φέρθηκε ο πελάτης, όχι πώς
-- δούλεψε ο επαγγελματίας) — οπότε παίρνουν εντελώς δικές τους στήλες, ώστε
-- μια στήλη να μη σημαίνει δύο διαφορετικά πράγματα ανάλογα με το ποιος
-- αξιολογείται.
-- ============================================================================

alter table reviews
  add column if not exists rating_boat_respect int check (rating_boat_respect is null or rating_boat_respect between 1 and 5),
  add column if not exists rating_responsibility int check (rating_responsibility is null or rating_responsibility between 1 and 5),
  add column if not exists rating_cooperation int check (rating_cooperation is null or rating_cooperation between 1 and 5),
  add column if not exists rating_consistency int check (rating_consistency is null or rating_consistency between 1 and 5),
  add column if not exists rating_conduct int check (rating_conduct is null or rating_conduct between 1 and 5),
  add column if not exists rating_tidiness int check (rating_tidiness is null or rating_tidiness between 1 and 5);

alter table client_profiles
  add column if not exists rating_avg_boat_respect numeric,
  add column if not exists rating_avg_responsibility numeric,
  add column if not exists rating_avg_cooperation numeric,
  add column if not exists rating_avg_consistency numeric,
  add column if not exists rating_avg_conduct numeric,
  add column if not exists rating_avg_tidiness numeric;

create or replace function guard_client_profile_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.wallet_balance := old.wallet_balance;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.rating_avg_boat_respect := old.rating_avg_boat_respect;
  new.rating_avg_responsibility := old.rating_avg_responsibility;
  new.rating_avg_cooperation := old.rating_avg_cooperation;
  new.rating_avg_consistency := old.rating_avg_consistency;
  new.rating_avg_conduct := old.rating_avg_conduct;
  new.rating_avg_tidiness := old.rating_avg_tidiness;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  return new;
end;
$$;

-- Κάθε κλάδος απορρίπτει ρητά τις κατηγορίες που δεν του ανήκουν, ίδιο
-- πνεύμα με το 0039: μια αξιολόγηση πελάτη δεν μπορεί ποτέ να καταλήξει με
-- "rating_safety" και μια αξιολόγηση skipper/hostess δεν μπορεί ποτέ να
-- καταλήξει με "rating_boat_respect".
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
       or new.rating_conduct is not null or new.rating_tidiness is not null then
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
       or new.rating_conduct is not null or new.rating_tidiness is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_cleanliness + new.rating_cooking + new.rating_service +
      new.rating_professionalism + new.rating_communication + new.rating_hospitality
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_client_id then
    if new.rating_boat_respect is null or new.rating_responsibility is null or new.rating_cooperation is null
       or new.rating_consistency is null or new.rating_conduct is null or new.rating_tidiness is null
       or new.rating_safety is not null or new.rating_seamanship is not null or new.rating_professionalism is not null
       or new.rating_cleanliness is not null or new.rating_communication is not null or new.rating_hospitality is not null
       or new.rating_cooking is not null or new.rating_service is not null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_boat_respect + new.rating_responsibility + new.rating_cooperation +
      new.rating_consistency + new.rating_conduct + new.rating_tidiness
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_skipper_user_id then
    -- επαγγελματίας άλλης, μη υποστηριζόμενης ακόμα ιδιότητας (cook/deckhand):
    -- απλό μονό rating, καμία κατηγορία δεν επιτρέπεται.
    if new.rating_safety is not null or new.rating_seamanship is not null or new.rating_professionalism is not null
       or new.rating_cleanliness is not null or new.rating_communication is not null or new.rating_hospitality is not null
       or new.rating_cooking is not null or new.rating_service is not null
       or new.rating_boat_respect is not null or new.rating_responsibility is not null
       or new.rating_cooperation is not null or new.rating_consistency is not null
       or new.rating_conduct is not null or new.rating_tidiness is not null then
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
         round(avg(r.rating_service)::numeric, 2)
    into v_skipper_avg, v_skipper_count,
         v_safety, v_seamanship, v_professionalism, v_cleanliness, v_communication, v_hospitality,
         v_cooking, v_service
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
    rating_avg_cooking = v_cooking, rating_avg_service = v_service
    where user_id = p_user_id;
  update client_profiles set
    rating_avg = v_client_avg, rating_count = coalesce(v_client_count, 0),
    rating_avg_boat_respect = v_boat_respect, rating_avg_responsibility = v_responsibility,
    rating_avg_cooperation = v_cooperation, rating_avg_consistency = v_consistency,
    rating_avg_conduct = v_conduct, rating_avg_tidiness = v_tidiness
    where user_id = p_user_id;
end;
$$;

-- Αναδρομικός επαναϋπολογισμός για το ήδη υπάρχον ιστορικό.
do $$
declare r record;
begin
  for r in select distinct user_id from client_profiles loop
    perform recalc_user_rating(r.user_id);
  end loop;
end $$;
