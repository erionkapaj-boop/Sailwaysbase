-- ============================================================================
-- Η αξιολόγηση ενός επαγγελματία γίνεται πλέον σε 6 ξεχωριστές κατηγορίες
-- (ασφάλεια, ναυτοσύνη, επαγγελματισμός, καθαριότητα & τάξη, επικοινωνία,
-- εμπειρία & φιλοξενία) αντί για ένα ενιαίο 1-5. Η συνολική βαθμολογία της
-- αξιολόγησης είναι ο μέσος όρος των 6 — δεν την επιλέγει ο πελάτης απευθείας,
-- υπολογίζεται από το σύστημα, ώστε να μην μπορεί ποτέ να αποκλίνει από τις
-- επιμέρους απαντήσεις του.
--
-- Η αξιολόγηση προς ΠΕΛΑΤΗ (όταν ο επαγγελματίας αξιολογεί τον πελάτη μετά το
-- ναύλο) ΔΕΝ αλλάζει — παραμένει ένα απλό 1-5, όπως ήταν.
-- ============================================================================

-- Το rating ήταν int (1-5 ακέραιος)· τώρα μπορεί να είναι μέσος όρος 6
-- ακεραίων (π.χ. 4.33), οπότε πλατύνεται σε numeric. Το CHECK «between 1
-- and 5» ισχύει κανονικά και σε numeric. Ο trigger που παρακολουθεί
-- συγκεκριμένα τη στήλη rating (trg_apply_review_rating, 0017) πρέπει να
-- φύγει πριν την αλλαγή τύπου και ξαναμπαίνει αμέσως μετά, ίδιος.
drop trigger if exists trg_apply_review_rating on reviews;
alter table reviews alter column rating type numeric using rating::numeric;
create trigger trg_apply_review_rating
  after insert or update of rating, reviewee_id or delete on reviews
  for each row execute function apply_review_rating();

alter table reviews
  add column if not exists rating_safety int check (rating_safety is null or rating_safety between 1 and 5),
  add column if not exists rating_seamanship int check (rating_seamanship is null or rating_seamanship between 1 and 5),
  add column if not exists rating_professionalism int check (rating_professionalism is null or rating_professionalism between 1 and 5),
  add column if not exists rating_cleanliness int check (rating_cleanliness is null or rating_cleanliness between 1 and 5),
  add column if not exists rating_communication int check (rating_communication is null or rating_communication between 1 and 5),
  add column if not exists rating_hospitality int check (rating_hospitality is null or rating_hospitality between 1 and 5);

-- Οι συναθροισμένοι μέσοι όροι ανά κατηγορία, ένας ανά επαγγελματία — ό,τι
-- είναι το rating_avg για το συνολικό, αυτό είναι αυτές οι έξι στήλες για
-- τις επιμέρους. Μόνο skipper_profiles: η αξιολόγηση προς πελάτη δεν έχει
-- κατηγορίες, οπότε client_profiles δεν χρειάζεται τα ίδια.
alter table skipper_profiles
  add column if not exists rating_avg_safety numeric,
  add column if not exists rating_avg_seamanship numeric,
  add column if not exists rating_avg_professionalism numeric,
  add column if not exists rating_avg_cleanliness numeric,
  add column if not exists rating_avg_communication numeric,
  add column if not exists rating_avg_hospitality numeric;

-- Πριν αυτές οι 6 στήλες μπορούσε να τις γράψει όποιος επεξεργάζεται το δικό
-- του προφίλ (ίδια πολιτική RLS με το όνομα, την τιμή κ.λπ.) — χωρίς αυτόν
-- τον φύλακα, ένας επαγγελματίας θα μπορούσε να βάλει μόνος του «5» σε κάθε
-- κατηγορία, ακριβώς όπως θα μπορούσε πριν με το rating_avg αν δεν υπήρχε
-- ήδη αυτός ο φύλακας για εκείνο.
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
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  new.user_id := old.user_id;
  new.deleted_at := old.deleted_at;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ποιος επιτρέπεται να στείλει τι: αν ο αξιολογούμενος είναι ο επαγγελματίας
-- ΓΙ' ΑΥΤΗ την κράτηση, χρειάζονται και οι 6 κατηγορίες, και το συνολικό
-- rating υπολογίζεται εδώ (αγνοείται ό,τι έστειλε ο client σε αυτό το
-- πεδίο). Αν είναι ο πελάτης, καμία κατηγορία δεν επιτρέπεται — μένει το
-- απλό μονό 1-5, όπως πριν.
-- ----------------------------------------------------------------------------
create or replace function enforce_review_categories() returns trigger
language plpgsql as $$
declare
  v_client_id uuid;
  v_skipper_user_id uuid;
begin
  select b.client_id, sp.user_id into v_client_id, v_skipper_user_id
    from bookings b join skipper_profiles sp on sp.id = b.skipper_id
    where b.id = new.booking_id;

  if new.reviewee_id = v_skipper_user_id then
    if new.rating_safety is null or new.rating_seamanship is null or new.rating_professionalism is null
       or new.rating_cleanliness is null or new.rating_communication is null or new.rating_hospitality is null then
      raise exception 'all_categories_required';
    end if;
    new.rating := round((
      new.rating_safety + new.rating_seamanship + new.rating_professionalism +
      new.rating_cleanliness + new.rating_communication + new.rating_hospitality
    )::numeric / 6, 2);
  elsif new.reviewee_id = v_client_id then
    if new.rating_safety is not null or new.rating_seamanship is not null or new.rating_professionalism is not null
       or new.rating_cleanliness is not null or new.rating_communication is not null or new.rating_hospitality is not null then
      raise exception 'categories_not_allowed_for_client_review';
    end if;
  else
    raise exception 'reviewee_not_participant';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_review_categories on reviews;
create trigger trg_review_categories
  before insert on reviews
  for each row execute function enforce_review_categories();

-- ----------------------------------------------------------------------------
-- Η συναθροίση: ίδια λογική με πριν (0029, χωριστό μέσο όρο για κάθε
-- ιδιότητα ενός λογαριασμού), με τις 6 κατηγορίες προστιθέμενες στο κλαδί
-- του επαγγελματία.
-- ----------------------------------------------------------------------------
create or replace function recalc_user_rating(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_skipper_avg numeric; v_skipper_count int;
  v_client_avg numeric; v_client_count int;
  v_safety numeric; v_seamanship numeric; v_professionalism numeric;
  v_cleanliness numeric; v_communication numeric; v_hospitality numeric;
begin
  if p_user_id is null then return; end if;

  select round(avg(r.rating)::numeric, 2), count(*),
         round(avg(r.rating_safety)::numeric, 2),
         round(avg(r.rating_seamanship)::numeric, 2),
         round(avg(r.rating_professionalism)::numeric, 2),
         round(avg(r.rating_cleanliness)::numeric, 2),
         round(avg(r.rating_communication)::numeric, 2),
         round(avg(r.rating_hospitality)::numeric, 2)
    into v_skipper_avg, v_skipper_count,
         v_safety, v_seamanship, v_professionalism, v_cleanliness, v_communication, v_hospitality
    from reviews r
    join bookings b on b.id = r.booking_id
    join skipper_profiles sp on sp.id = b.skipper_id
    where r.reviewee_id = p_user_id and sp.user_id = p_user_id;

  select round(avg(r.rating)::numeric, 2), count(*)
    into v_client_avg, v_client_count
    from reviews r
    join bookings b on b.id = r.booking_id
    where r.reviewee_id = p_user_id and b.client_id = p_user_id;

  perform set_config('platform.trusted', 'true', true);

  update skipper_profiles set
    rating_avg = v_skipper_avg, rating_count = coalesce(v_skipper_count, 0),
    rating_avg_safety = v_safety, rating_avg_seamanship = v_seamanship,
    rating_avg_professionalism = v_professionalism, rating_avg_cleanliness = v_cleanliness,
    rating_avg_communication = v_communication, rating_avg_hospitality = v_hospitality
    where user_id = p_user_id;
  update client_profiles set rating_avg = v_client_avg, rating_count = coalesce(v_client_count, 0)
    where user_id = p_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Δημόσια έκθεση: skipper_public + search_available_skippers, ίδιο δίδυμο
-- και ίδια σειρά drop/create με το 0012 και το 0027 — η συνάρτηση επιστρέφει
-- setof skipper_public, άρα πέφτει πρώτη και ξαναχτίζεται τελευταία.
-- ----------------------------------------------------------------------------
drop function if exists search_available_skippers(date, date, uuid, uuid, numeric, text);
drop view if exists skipper_public;

create view skipper_public as
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
         rating_avg_cleanliness, rating_avg_communication, rating_avg_hospitality
  from skipper_profiles
  where approval_status = 'approved' and deleted_at is null;
grant select on skipper_public to anon, authenticated;

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
grant execute on function search_available_skippers to anon, authenticated;

-- Αναδρομικός επαναϋπολογισμός για ό,τι ιστορικό υπάρχει ήδη, ώστε οι νέες
-- στήλες να μην μείνουν κενές μέχρι την επόμενη αξιολόγηση.
do $$
declare r record;
begin
  for r in select distinct user_id from skipper_profiles loop
    perform recalc_user_rating(r.user_id);
  end loop;
end $$;
