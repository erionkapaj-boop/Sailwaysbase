-- ============================================================================
-- Ζητήθηκαν δύο πράγματα στην κάρτα του επαγγελματία:
--
-- 1. Σημαία δίπλα στην εθνικότητα (π.χ. 🇬🇷 Ελληνική).
-- 2. Ηλικία — μόνο ο αριθμός, όχι η πλήρης ημερομηνία γέννησης. Η
--    ημερομηνία γέννησης (skipper_profiles.date_of_birth) υπάρχει ήδη και
--    συλλέγεται ήδη από τη φόρμα προφίλ (ProfileForm.js) — απλώς δεν είχε
--    εκτεθεί ποτέ δημόσια. Μένει έτσι: το skipper_public view παίρνει μόνο
--    την υπολογισμένη ηλικία, ποτέ την ίδια την ημερομηνία.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

-- ---- 1. Σημαίες: μία στήλη στο ήδη υπάρχον nationalities lookup. ----
alter table nationalities add column if not exists flag_emoji text;

update nationalities set flag_emoji = case name
  when 'Ελληνική' then '🇬🇷'
  when 'Κυπριακή' then '🇨🇾'
  when 'Αλβανική' then '🇦🇱'
  when 'Βουλγαρική' then '🇧🇬'
  when 'Ρουμανική' then '🇷🇴'
  when 'Σερβική' then '🇷🇸'
  when 'Βορειομακεδονική' then '🇲🇰'
  when 'Τουρκική' then '🇹🇷'
  when 'Ιταλική' then '🇮🇹'
  when 'Γαλλική' then '🇫🇷'
  when 'Ισπανική' then '🇪🇸'
  when 'Πορτογαλική' then '🇵🇹'
  when 'Γερμανική' then '🇩🇪'
  when 'Αυστριακή' then '🇦🇹'
  when 'Ελβετική' then '🇨🇭'
  when 'Ολλανδική' then '🇳🇱'
  when 'Βελγική' then '🇧🇪'
  when 'Βρετανική' then '🇬🇧'
  when 'Ιρλανδική' then '🇮🇪'
  when 'Σουηδική' then '🇸🇪'
  when 'Νορβηγική' then '🇳🇴'
  when 'Δανική' then '🇩🇰'
  when 'Φινλανδική' then '🇫🇮'
  when 'Πολωνική' then '🇵🇱'
  when 'Τσεχική' then '🇨🇿'
  when 'Σλοβακική' then '🇸🇰'
  when 'Ουγγρική' then '🇭🇺'
  when 'Κροατική' then '🇭🇷'
  when 'Σλοβενική' then '🇸🇮'
  when 'Ουκρανική' then '🇺🇦'
  when 'Ρωσική' then '🇷🇺'
  when 'Αμερικανική' then '🇺🇸'
  when 'Καναδική' then '🇨🇦'
  when 'Αυστραλιανή' then '🇦🇺'
  when 'Βραζιλιάνικη' then '🇧🇷'
  when 'Νοτιοαφρικανική' then '🇿🇦'
  when 'Κινεζική' then '🇨🇳'
  when 'Ιαπωνική' then '🇯🇵'
  when 'Ινδική' then '🇮🇳'
  else null
end;

-- ---- 2. skipper_public: καθαρή προσθήκη στηλών στο τέλος (ίδιο πρότυπο με
-- 0041/0042/0046) — nationality_flag δίπλα στο ήδη υπάρχον nationality_name,
-- και age υπολογισμένη από το date_of_birth (ποτέ η ίδια η ημερομηνία). ----
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
         date_part('year', age(current_date, date_of_birth))::int as age
  from skipper_profiles
  where approval_status = 'approved' and deleted_at is null;
