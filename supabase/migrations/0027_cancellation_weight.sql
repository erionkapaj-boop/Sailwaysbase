-- ============================================================================
-- Μια ακύρωση δύο εβδομάδες πριν δεν είναι το ίδιο με μια ακύρωση την παραμονή.
--
-- Μέχρι τώρα ήταν: το cancellation_flag_count μετρούσε κεφάλια. Ο επαγγελματίας
-- που ειδοποίησε έγκαιρα — και άφησε χρόνο να βρεθεί άλλος — τιμωρούνταν όσο
-- κι εκείνος που εξαφανίστηκε την τελευταία στιγμή. Ήταν ακριβώς το αντίθετο
-- από αυτό που θέλαμε να ενθαρρύνουμε, γιατί η έγκαιρη ειδοποίηση είναι η ίδια
-- η ουσία του επαγγελματισμού εδώ.
--
-- ---------------------------------------------------------------------------
-- Τι μπαίνει πού.
--
-- Το ΝΟΥΜΕΡΟ ΠΟΥ ΔΙΑΒΑΖΕΙ ο πελάτης (reliability_percentage) μένει όπως είναι:
-- ολοκληρωμένες προς ολοκληρωμένες συν ακυρώσεις, ωμό και εξηγήσιμο σε μία
-- πρόταση. «3 δουλειές, 1 ακύρωση, 75%» καταλαβαίνεται· «92% επειδή η ακύρωση
-- ήταν έγκαιρη και έχει αποσβεστεί κατά 40%» δεν καταλαβαίνεται από κανέναν.
--
-- Η ΣΥΜΠΕΡΙΦΟΡΑ πάει εκεί που πραγματικά πληρώνει: στη σειρά εμφάνισης. Ίδια
-- αρχή με τα αστέρια στο 0018 — τίποτα δεν αναμειγνύεται κρυφά σε ένα νούμερο
-- που κάποιος νομίζει ότι σημαίνει κάτι άλλο.
--
-- ---------------------------------------------------------------------------
-- Οι τιμές μπαίνουν στα platform_settings, όχι στον κώδικα.
--
-- Είναι κρίσεις, όχι σταθερές: το πόσο βαραίνει μια ακύρωση τριών ημερών είναι
-- εμπορική απόφαση που θα αλλάξει όταν φανεί η πραγματική συμπεριφορά. Στις
-- ρυθμίσεις αλλάζει με ένα νούμερο, στον κώδικα θα ήθελε migration κάθε φορά.
-- ============================================================================

insert into platform_settings (key, value) values
  ('cancel_early_days', 14),          -- ≥ τόσες ημέρες πριν = έγκαιρη
  ('cancel_late_days', 3),            -- < τόσες ημέρες πριν = τελευταία στιγμή
  ('cancel_weight_early', 0.25),
  ('cancel_weight_mid', 0.5),
  ('cancel_weight_late', 1.0),
  ('cancel_weight_after_start', 2.0), -- εγκατάλειψη εν πλω, η χειρότερη
  ('cancel_decay_full_months', 6),    -- μέχρι εδώ μετράει ακέραιη
  ('cancel_decay_zero_months', 18),   -- από εδώ και πέρα δεν μετράει καθόλου
  ('cancel_prior_jobs', 5),           -- «πιστώνονται» ως καθαρές, ώστε ο νέος να μην κρίνεται από ένα περιστατικό
  ('cancel_full_rate', 0.5),          -- ρυθμός ακύρωσης στον οποίο ο όρος συμπεριφοράς μηδενίζεται
  ('reliability_min_history', 3)      -- κάτω από τόσα περιστατικά δεν δείχνουμε ποσοστό
on conflict (key) do nothing;

alter table bookings add column if not exists cancellation_lead_days int;
alter table bookings add column if not exists cancellation_weight numeric;

-- ----------------------------------------------------------------------------
-- Η βαρύτητα μιας ακύρωσης, από τον χρόνο που άφησε πίσω της.
--
-- Υπολογίζεται και ΑΠΟΘΗΚΕΥΕΤΑΙ τη στιγμή της ακύρωσης, δεν ξαναβγαίνει από
-- μηδέν αργότερα: αν αύριο αλλάξεις τα όρια, οι παλιές ακυρώσεις κρατούν τη
-- βαρύτητα που ίσχυε όταν έγιναν. Το αντίθετο θα σήμαινε ότι μια αλλαγή
-- ρύθμισης ξαναγράφει αναδρομικά το ιστορικό όλων.
-- ----------------------------------------------------------------------------
create or replace function cancellation_weight_for(p_cancelled_at timestamptz, p_start date)
returns numeric
language sql stable set search_path = public as $$
  with s as (
    select
      (select value from platform_settings where key = 'cancel_early_days') as early_days,
      (select value from platform_settings where key = 'cancel_late_days') as late_days,
      (select value from platform_settings where key = 'cancel_weight_early') as w_early,
      (select value from platform_settings where key = 'cancel_weight_mid') as w_mid,
      (select value from platform_settings where key = 'cancel_weight_late') as w_late,
      (select value from platform_settings where key = 'cancel_weight_after_start') as w_after
  ),
  lead as (select (p_start - coalesce(p_cancelled_at, now())::date) as days)
  select case
    when (select days from lead) < 0 then (select w_after from s)
    when (select days from lead) >= (select early_days from s) then (select w_early from s)
    when (select days from lead) < (select late_days from s) then (select w_late from s)
    else (select w_mid from s)
  end;
$$;
grant execute on function cancellation_weight_for(timestamptz, date) to anon, authenticated;

-- Πόσες ημέρες πριν, σε μορφή που διαβάζεται σε αναφορά.
create or replace function cancellation_lead_days_for(p_cancelled_at timestamptz, p_start date)
returns int
language sql immutable as $$
  select (p_start - coalesce(p_cancelled_at, now())::date);
$$;
grant execute on function cancellation_lead_days_for(timestamptz, date) to anon, authenticated;

-- Οι ήδη καταγεγραμμένες ακυρώσεις παίρνουν βαρύτητα αναδρομικά, αλλιώς το
-- σύστημα θα ξεκινούσε να μετράει από το μηδέν και όσοι έχουν ήδη ιστορικό θα
-- εμφανίζονταν καθαροί.
update bookings
set cancellation_lead_days = cancellation_lead_days_for(cancelled_at, start_date),
    cancellation_weight = cancellation_weight_for(cancelled_at, start_date)
where status in ('cancelled_by_client', 'cancelled_by_skipper')
  and cancellation_weight is null;

-- ----------------------------------------------------------------------------
-- Το βάρος που κουβαλάει κάποιος σήμερα.
--
-- Άθροισμα βαρυτήτων με απόσβεση: ακέραιο μέχρι τους 6 μήνες, γραμμικά προς το
-- μηδέν ως τους 18, μετά τίποτα. Μια ακύρωση πριν από δύο χρόνια δεν λέει
-- τίποτα για το ποιος είσαι τώρα, και ένα σύστημα που δεν ξεχνάει ποτέ δίνει
-- στους παλιούς χρήστες ένα βάρος που δεν μπορούν να ξεφορτωθούν όσο σωστά
-- κι αν δουλέψουν.
-- ----------------------------------------------------------------------------
create or replace function cancellation_load(p_skipper_id uuid)
returns numeric
language sql stable set search_path = public as $$
  with s as (
    select
      (select value from platform_settings where key = 'cancel_decay_full_months') as full_m,
      (select value from platform_settings where key = 'cancel_decay_zero_months') as zero_m
  )
  select coalesce(round(sum(
    coalesce(b.cancellation_weight, 1) *
    case
      when age_m <= (select full_m from s) then 1
      when age_m >= (select zero_m from s) then 0
      else ((select zero_m from s) - age_m) / nullif((select zero_m from s) - (select full_m from s), 0)
    end
  ), 4), 0)
  from (
    select b.*,
           extract(epoch from (now() - b.cancelled_at)) / (30.44 * 86400) as age_m
    from bookings b
    where b.skipper_id = p_skipper_id
      and b.status = 'cancelled_by_skipper'
      and b.cancelled_at is not null
  ) b;
$$;
grant execute on function cancellation_load(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Ο όρος συμπεριφοράς που μπαίνει στην κατάταξη. 100 = καθαρό μητρώο.
--
-- ΕΔΩ ΖΕΙ Η ΚΛΙΜΑΚΩΣΗ, και χρειάστηκαν δύο προσπάθειες για να ζήσει σωστά.
--
-- Η πρώτη ήταν να υψωθεί στο τετράγωνο η αξιοπιστία, δηλαδή ο λόγος
-- ολοκληρωμένες/(ολοκληρωμένες+ακυρώσεις). Δεν κλιμακώνει: ο ίδιος ο λόγος
-- πέφτει όλο και λιγότερο με κάθε επιπλέον ακύρωση, οπότε το συνολικό κόστος
-- ανά ακύρωση *μειωνόταν*. Το μέτρησα και ήταν 0.020, 0.018, 0.016, 0.014 —
-- ακριβώς ανάποδα από το ζητούμενο.
--
-- Αυτό που κλιμακώνει είναι ο ΡΥΘΜΟΣ ακύρωσης υψωμένος στο τετράγωνο:
--
--     ρυθμός = βάρος ακυρώσεων / (ολοκληρωμένες + prior)
--     ποινή  = min(1, (ρυθμός / cancel_full_rate)^2)
--
-- Σε 20 ολοκληρωμένες, το κόστος ανά ακύρωση τελευταίας στιγμής πάει
-- 0.0016 -> 0.0048 -> 0.0080 -> 0.0112 -> 0.0144 -> 0.0176: η πρώτη σχεδόν
-- δωρεάν, η έκτη ένδεκα φορές ακριβότερη. Και επειδή η έγκαιρη ακύρωση μετράει
-- 0.25 αντί 1.0, έξι έγκαιρες κοστίζουν λιγότερο από μία τελευταίας στιγμής.
--
-- Το prior των «καθαρών» δουλειών κρατάει τον νέο μακριά από το μηδέν: χωρίς
-- αυτό, το πρώτο του περιστατικό θα ήταν και ολόκληρο το μητρώο του.
-- ----------------------------------------------------------------------------
create or replace function cancellation_standing(p_skipper_id uuid)
returns numeric
language sql stable set search_path = public as $$
  with s as (
    select
      (select value from platform_settings where key = 'cancel_prior_jobs') as prior,
      (select value from platform_settings where key = 'cancel_full_rate') as full_rate
  ),
  d as (
    select coalesce(sp.completed_bookings_count, 0)::numeric as done,
           cancellation_load(p_skipper_id) as load
    from skipper_profiles sp where sp.id = p_skipper_id
  )
  select round(
    (1 - least(1, power(
      (d.load / nullif(d.done + (select prior from s), 0)) / nullif((select full_rate from s), 0)
    , 2))) * 100
  , 2) from d;
$$;
grant execute on function cancellation_standing(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Η κατάταξη μένει σταθμισμένο άθροισμα, γραμμικό και στα τρία σκέλη.
--
-- Η μη γραμμικότητα ανήκει στο cancellation_standing, όχι εδώ: ένα score που
-- ήταν ταυτόχρονα άθροισμα ΚΑΙ έκρυβε δυνάμεις μέσα του δεν διαβαζόταν από
-- κανέναν, ούτε από εμένα — γι' αυτό και η πρώτη εκδοχή ήταν λάθος χωρίς να
-- φαίνεται. Ίδια υπογραφή με το 0018· αλλάζει μόνο τι περνούν οι καλούντες.
-- ----------------------------------------------------------------------------
create or replace function skipper_rank_score(
  p_rating_avg numeric,
  p_rating_count int,
  p_reliability numeric,
  p_response numeric
) returns numeric
language sql immutable as $$
  select round(
      0.60 * (bayesian_rating(p_rating_avg, p_rating_count) / 5.0)
    + 0.25 * (coalesce(p_reliability, 90) / 100.0)
    + 0.15 * coalesce(p_response, 0.8)
  , 6);
$$;
grant execute on function skipper_rank_score(numeric, int, numeric, numeric) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Η ακύρωση καταγράφει πλέον πόσο χρόνο άφησε.
--
-- Ό,τι άλλο κάνει η cancel_booking μένει ακριβώς ίδιο: καμία επιστροφή τελών —
-- και οι δύο πλευρές πλήρωσαν στο match και αυτό ισχύει — μόνο η καταγραφή
-- προστίθεται.
-- ----------------------------------------------------------------------------
create or replace function cancel_booking(p_booking_id uuid, p_reason text) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_uid uuid := auth.uid();
  v_is_client boolean;
  v_fee_amount numeric;
  v_lead int;
  v_weight numeric;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_booking.status <> 'confirmed' then raise exception 'not_cancellable'; end if;

  if v_uid = v_booking.client_id then
    v_is_client := true;
  elsif exists (select 1 from skipper_profiles where id = v_booking.skipper_id and user_id = v_uid) then
    v_is_client := false;
  else
    raise exception 'not_participant';
  end if;

  v_lead := cancellation_lead_days_for(now(), v_booking.start_date);
  v_weight := cancellation_weight_for(now(), v_booking.start_date);

  select fee_amount into v_fee_amount from booking_requests where id = v_booking.booking_request_id;
  perform set_config('platform.trusted', 'true', true);

  if v_is_client then
    update bookings set status = 'cancelled_by_client', cancelled_at = now(), cancellation_reason = p_reason,
                        cancellation_lead_days = v_lead, cancellation_weight = v_weight
      where id = p_booking_id;
    update skipper_profiles set wallet_balance = wallet_balance + v_booking.skipper_claim_fee_amount
      where id = v_booking.skipper_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_id)
      select user_id, 'refund_credit', v_booking.skipper_claim_fee_amount, p_booking_id
      from skipper_profiles where id = v_booking.skipper_id;
    insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
      values (p_booking_id, v_uid, 'client', p_reason);
  else
    update bookings set status = 'cancelled_by_skipper', cancelled_at = now(), cancellation_reason = p_reason,
                        cancellation_lead_days = v_lead, cancellation_weight = v_weight
      where id = p_booking_id;
    update client_profiles set wallet_balance = wallet_balance + v_fee_amount where user_id = v_booking.client_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_id)
      values (v_booking.client_id, 'refund_credit', v_fee_amount, p_booking_id);
    insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
      values (p_booking_id, v_uid, 'skipper', p_reason);
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  return v_booking;
end;
$$;

-- ----------------------------------------------------------------------------
-- Οι δύο αναζητήσεις περνούν τη σταθμισμένη αξιοπιστία στην κατάταξη.
-- Το φιλτράρισμα, η σειρά βαθμίδας και ο αποκλεισμός του εαυτού σου μένουν
-- ίδια — αντιγράφονται αυτούσια από το 0019/0024 και μόνο ο ένας όρος αλλάζει.
-- ----------------------------------------------------------------------------
-- Κάτω από ένα ελάχιστο ιστορικό, το ποσοστό γίνεται null και η οθόνη λέει
-- «νέος στην πλατφόρμα» — που ήδη ξέρει να λέει. Ο κανόνας μπαίνει εδώ, στη
-- μία θέση απ' όπου διαβάζουν όλες οι δημόσιες οθόνες, αντί να επαναλαμβάνεται
-- σε κάθε σελίδα και να ξεχαστεί στην επόμενη.
--
-- Το «0% αξιοπιστία» μετά από μία ακύρωση στην πρώτη δουλειά δεν ήταν αυστηρό,
-- ήταν λάθος: δεν περιγράφει κανέναν, μόνο την απουσία ιστορικού.
-- Η ΣΕΙΡΑ ΜΕΤΡΑΕΙ, όπως και στο 0012: η search_available_skippers επιστρέφει
-- setof skipper_public, οπότε η συνάρτηση πέφτει πρώτη και ξαναχτίζεται
-- τελευταία.
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
         tier
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

create or replace function admin_search_availability(
  p_role crew_role default 'skipper',
  p_start date default current_date,
  p_end date default current_date,
  p_port_id uuid default null
)
returns table(
  skipper_id uuid,
  user_id uuid,
  full_name text,
  phone_number text,
  crew_role crew_role,
  price_per_day numeric,
  rating_avg numeric,
  rating_count int,
  reliability_percentage numeric,
  tier skipper_tier,
  photo_url text
)
language sql stable security definer set search_path = public as $$
  select
    sp.id, sp.user_id, sp.full_name, u.phone_number, sp.role,
    sp.price_per_day, sp.rating_avg, sp.rating_count,
    sp.reliability_percentage, sp.tier, sp.photo_url
  from skipper_profiles sp
  join users u on u.id = sp.user_id
  where is_admin()
    and sp.approval_status = 'approved'
    and sp.deleted_at is null
    and sp.role = p_role
    and net_availability(sp.id, p_port_id) @> daterange(p_start, p_end, '[]')
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
  order by
    case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
    skipper_rank_score(sp.rating_avg, sp.rating_count, cancellation_standing(sp.id),
                       skipper_response_rate(sp.id)) desc;
$$;
grant execute on function admin_search_availability(crew_role, date, date, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Το ίδιο ισχύει για τη βαθμίδα: υποβιβάζει με βάση τη σταθμισμένη αξιοπιστία,
-- όχι το ωμό ποσοστό, αλλιώς μία έγκαιρη ακύρωση θα έριχνε κάποιον σε «χαμηλή»
-- ενώ η κατάταξη μόλις που το είχε προσέξει.
-- ----------------------------------------------------------------------------
create or replace function recompute_skipper_tier() returns trigger
language plpgsql as $$
declare v_tier skipper_tier; v_rel numeric;
begin
  v_rel := cancellation_standing(new.id);

  if new.completed_bookings_count = 0 and new.rating_count = 0 then
    v_tier := 'medium';
  elsif coalesce(v_rel, 100) < 70
        or (coalesce(new.rating_avg, 5) < 3 and new.rating_count >= 3) then
    v_tier := 'low';
  elsif new.completed_bookings_count >= 10
        and coalesce(new.rating_avg, 0) >= 4.5
        and coalesce(v_rel, 0) >= 90 then
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

-- ----------------------------------------------------------------------------
-- Ο επαγγελματίας βλέπει τι μετράει για εκείνον, με νούμερα και όχι με αίσθηση.
-- ----------------------------------------------------------------------------
-- Κρατάει την παράμετρο του 0022: χωρίς αυτήν η «Προβολή ως» θα έδειχνε στον
-- διαχειριστή τη δική του κατάσταση ενώ θα νόμιζε ότι βλέπει του άλλου.
-- drop πρώτα, γιατί προστίθενται στήλες εξόδου.
drop function if exists my_standing(uuid);
create or replace function my_standing(p_user_id uuid default null)
returns table(
  response_rate numeric,
  responded int,
  ignored int,
  cancellations int,
  -- Τα ονόματα των στηλών δεν είναι τα ονόματα των συναρτήσεων επίτηδες: σε
  -- language sql οι έξοδοι μπαίνουν στο ίδιο scope, και μια στήλη
  -- «cancellation_load» δίπλα σε μια συνάρτηση «cancellation_load» είναι
  -- ακριβώς το είδος της ασάφειας που σκάει αργότερα.
  cancel_load numeric,
  cancel_standing numeric,
  raw_reliability numeric
)
language sql stable security definer set search_path = public as $$
  with me as (select skipper_profile_id_of(acting_user(p_user_id)) as skipper_id)
  select
    skipper_response_rate((select skipper_id from me)),
    (select count(*) filter (where brp.status = 'claimed' or brp.declined_at is not null)::int
       from booking_request_pings brp where brp.skipper_id = (select skipper_id from me)),
    (select count(*) filter (where brp.status = 'pending' and br.status = 'expired_unclaimed')::int
       from booking_request_pings brp
       join booking_requests br on br.id = brp.booking_request_id
      where brp.skipper_id = (select skipper_id from me)),
    (select count(*)::int from bookings b
      where b.skipper_id = (select skipper_id from me) and b.status = 'cancelled_by_skipper'),
    cancellation_load((select skipper_id from me)),
    cancellation_standing((select skipper_id from me)),
    (select sp.reliability_percentage from skipper_profiles sp where sp.id = (select skipper_id from me));
$$;
grant execute on function my_standing(uuid) to authenticated;

-- Οι ακυρώσεις με τη βαρύτητά τους, για την οθόνη διαφορών.
create or replace function admin_cancellation_detail(p_skipper_id uuid)
returns table(
  booking_id uuid,
  start_date date,
  end_date date,
  port_name text,
  cancelled_at timestamptz,
  lead_days int,
  weight numeric,
  reason text
)
language sql stable security definer set search_path = public as $$
  select b.id, b.start_date, b.end_date, p.name, b.cancelled_at,
         b.cancellation_lead_days, b.cancellation_weight, b.cancellation_reason
  from bookings b
  left join ports p on p.id = b.port_id
  where is_admin()
    and b.skipper_id = p_skipper_id
    and b.status = 'cancelled_by_skipper'
  order by b.cancelled_at desc;
$$;
grant execute on function admin_cancellation_detail(uuid) to authenticated;
