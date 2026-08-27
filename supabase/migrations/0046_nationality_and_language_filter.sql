-- ============================================================================
-- Ζητήθηκε: εθνικότητα και γλώσσες να είναι ορατά στοιχεία και για τις δύο
-- πλευρές (ο πελάτης βλέπει την εθνικότητα/γλώσσες του επαγγελματία στα
-- αποτελέσματα αναζήτησης· ο επαγγελματίας βλέπει την εθνικότητα/γλώσσες του
-- πελάτη πριν αποδεχτεί ένα αίτημα), και η γλώσσα να γίνει ένα ακόμα φίλτρο
-- αναζήτησης, δίπλα στο λιμάνι/περιοχή.
--
-- Ό,τι ακολουθεί είναι idempotent (if not exists / drop-if-exists πριν από
-- recreate) — ασφαλές να τρέξει ξανά αν κάτι σκάσει στη μέση, σύμφωνα με το
-- ίδιο πρότυπο που ακολούθησαν όλα τα migrations αυτής της σεζόν.
-- ============================================================================

-- ---- 1. Εθνικότητες: ίδιο μοτίβο με languages/boat_types/ports — δημόσια
-- αναγνώσιμη curated λίστα, admin write. ----
create table if not exists nationalities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table nationalities enable row level security;

drop policy if exists "lookups readable by everyone" on nationalities;
create policy "lookups readable by everyone" on nationalities for select using (true);

drop policy if exists "lookups admin write" on nationalities;
create policy "lookups admin write" on nationalities for all using (is_admin()) with check (is_admin());

insert into nationalities (name)
values
  ('Ελληνική'), ('Κυπριακή'), ('Αλβανική'), ('Βουλγαρική'), ('Ρουμανική'),
  ('Σερβική'), ('Βορειομακεδονική'), ('Τουρκική'), ('Ιταλική'), ('Γαλλική'),
  ('Ισπανική'), ('Πορτογαλική'), ('Γερμανική'), ('Αυστριακή'), ('Ελβετική'),
  ('Ολλανδική'), ('Βελγική'), ('Βρετανική'), ('Ιρλανδική'), ('Σουηδική'),
  ('Νορβηγική'), ('Δανική'), ('Φινλανδική'), ('Πολωνική'), ('Τσεχική'),
  ('Σλοβακική'), ('Ουγγρική'), ('Κροατική'), ('Σλοβενική'), ('Ουκρανική'),
  ('Ρωσική'), ('Αμερικανική'), ('Καναδική'), ('Αυστραλιανή'), ('Βραζιλιάνικη'),
  ('Νοτιοαφρικανική'), ('Κινεζική'), ('Ιαπωνική'), ('Ινδική'), ('Άλλη')
on conflict (name) do nothing;

-- ---- 2. nationality_id στα δύο προφίλ ----
alter table skipper_profiles add column if not exists nationality_id uuid references nationalities(id);
alter table client_profiles add column if not exists nationality_id uuid references nationalities(id);

-- ---- 3. Γλώσσες πελάτη — δεν υπήρχαν καθόλου πριν, μόνο ο επαγγελματίας
-- είχε skipper_languages. Ίδια δομή, αλλά ορατότητα σαν το client_profiles
-- (όχι δημόσιο σαν το skipper_languages) — η γλώσσα ενός πελάτη δεν είναι
-- κάτι που βλέπει ο καθένας, μόνο ο ίδιος, ο admin, ή ο επαγγελματίας στον
-- οποίο έστειλε αίτημα. ----
create table if not exists client_languages (
  client_id uuid not null references client_profiles(user_id) on delete cascade,
  language_id uuid not null references languages(id) on delete cascade,
  primary key (client_id, language_id)
);

alter table client_languages enable row level security;

drop policy if exists "client reads own languages" on client_languages;
create policy "client reads own languages" on client_languages for select using (
  client_id = auth.uid()
  or is_admin()
  or exists (
    select 1 from booking_requests br
    join booking_request_pings p on p.booking_request_id = br.id
    join skipper_profiles sp on sp.id = p.skipper_id
    where br.client_id = client_languages.client_id and sp.user_id = auth.uid()
  )
);

drop policy if exists "client writes own languages" on client_languages;
create policy "client writes own languages" on client_languages for all using (
  client_id = auth.uid()
) with check (
  client_id = auth.uid()
);

-- ---- 4. skipper_public: καθαρή προσθήκη στηλών στο τέλος (ίδιο πρότυπο με
-- 0041/0042) — το search_available_skippers παίρνει τις νέες στήλες αυτόματα
-- μέσω του sp.* χωρίς να χρειάζεται να ξαναγραφτεί το ίδιο. ----
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
         rating_avg_maintenance, rating_avg_teamwork, rating_avg_diligence,
         (select n.name from nationalities n where n.id = skipper_profiles.nationality_id) as nationality_name,
         (select array_agg(l.name order by l.name)
            from skipper_languages sl join languages l on l.id = sl.language_id
            where sl.skipper_id = skipper_profiles.id) as languages
  from skipper_profiles
  where approval_status = 'approved' and deleted_at is null;

-- ---- 5. search_available_skippers: προσθήκη p_language_id.
-- Η προσθήκη παραμέτρου αλλάζει την υπογραφή — ένα create or replace ΔΕΝ θα
-- αντικαθιστούσε την παλιά (7 ορίσματα) συνάρτηση, θα δημιουργούσε μια
-- δεύτερη, overloaded. Το drop πρώτα είναι απαραίτητο (ίδιο μάθημα με το
-- 0044/0045 αυτής της σεζόν). ----
drop function if exists search_available_skippers(date, date, uuid, uuid, numeric, text, crew_role);

create or replace function search_available_skippers(
  p_start date,
  p_end date,
  p_port_id uuid,
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
    and (
      p_language_id is null or exists (
        select 1 from skipper_languages sl where sl.skipper_id = sp.id and sl.language_id = p_language_id
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
