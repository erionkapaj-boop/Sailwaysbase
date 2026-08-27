-- ============================================================================
-- Ζητήθηκε: δίπλα στη σημαία να φαίνεται σκέτο το όνομα της χώρας
-- (π.χ. "Ελλάδα", "Γερμανία", "Φινλανδία", "Πολωνία", "Τσεχία"), όχι το
-- επίθετο εθνικότητας που ήδη έχουμε στο nationalities.name (π.χ.
-- "Ελληνική", "Γερμανική") — εκείνο μένει όπως είναι (χρησιμοποιείται αλλού,
-- π.χ. στο dropdown επιλογής εθνικότητας στη φόρμα προφίλ), απλώς προστίθεται
-- μια νέα στήλη με το ουσιαστικό της χώρας για την εμφάνιση δίπλα στο όνομα.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

-- ---- 1. Νέα στήλη: όνομα χώρας (ουσιαστικό), ξεχωριστό από το επίθετο. ----
alter table nationalities add column if not exists country_name text;

update nationalities set country_name = case name
  when 'Ελληνική' then 'Ελλάδα'
  when 'Κυπριακή' then 'Κύπρος'
  when 'Αλβανική' then 'Αλβανία'
  when 'Βουλγαρική' then 'Βουλγαρία'
  when 'Ρουμανική' then 'Ρουμανία'
  when 'Σερβική' then 'Σερβία'
  when 'Βορειομακεδονική' then 'Βόρεια Μακεδονία'
  when 'Τουρκική' then 'Τουρκία'
  when 'Ιταλική' then 'Ιταλία'
  when 'Γαλλική' then 'Γαλλία'
  when 'Ισπανική' then 'Ισπανία'
  when 'Πορτογαλική' then 'Πορτογαλία'
  when 'Γερμανική' then 'Γερμανία'
  when 'Αυστριακή' then 'Αυστρία'
  when 'Ελβετική' then 'Ελβετία'
  when 'Ολλανδική' then 'Ολλανδία'
  when 'Βελγική' then 'Βέλγιο'
  when 'Βρετανική' then 'Ην. Βασίλειο'
  when 'Ιρλανδική' then 'Ιρλανδία'
  when 'Σουηδική' then 'Σουηδία'
  when 'Νορβηγική' then 'Νορβηγία'
  when 'Δανική' then 'Δανία'
  when 'Φινλανδική' then 'Φινλανδία'
  when 'Πολωνική' then 'Πολωνία'
  when 'Τσεχική' then 'Τσεχία'
  when 'Σλοβακική' then 'Σλοβακία'
  when 'Ουγγρική' then 'Ουγγαρία'
  when 'Κροατική' then 'Κροατία'
  when 'Σλοβενική' then 'Σλοβενία'
  when 'Ουκρανική' then 'Ουκρανία'
  when 'Ρωσική' then 'Ρωσία'
  when 'Αμερικανική' then 'ΗΠΑ'
  when 'Καναδική' then 'Καναδάς'
  when 'Αυστραλιανή' then 'Αυστραλία'
  when 'Βραζιλιάνικη' then 'Βραζιλία'
  when 'Νοτιοαφρικανική' then 'Ν. Αφρική'
  when 'Κινεζική' then 'Κίνα'
  when 'Ιαπωνική' then 'Ιαπωνία'
  when 'Ινδική' then 'Ινδία'
  when 'Άλλη' then 'Άλλη'
  else name
end
where country_name is null;

-- ---- 2. skipper_public: καθαρή προσθήκη στήλης στο τέλος (ίδιο πρότυπο με
-- 0041/0042/0046/0051) — nationality_country δίπλα στο ήδη υπάρχον
-- nationality_name/nationality_flag. Το frontend θα δείχνει πλέον αυτή τη
-- στήλη αντί για το επίθετο. ----
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
            where sl.skipper_id = skipper_profiles.id) as languages,
         (select n.flag_emoji from nationalities n where n.id = skipper_profiles.nationality_id) as nationality_flag,
         date_part('year', age(current_date, date_of_birth))::int as age,
         (select n.country_name from nationalities n where n.id = skipper_profiles.nationality_id) as nationality_country
  from skipper_profiles
  where approval_status = 'approved' and deleted_at is null;
