-- Γιατί ένας πελάτης δεν βρίσκει τον επαγγελματία; Μόνο ανάγνωση.
-- Ελέγχει μία-μία τις προϋποθέσεις της αναζήτησης (search_available_skippers)
-- για τον λογαριασμό του ιδιοκτήτη απέναντι στον πελάτη.
-- Άλλαξε μόνο τις τρεις τιμές στο params.
with params as (
  select '%hyundai%'::text as client_name,  -- όνομα πελάτη (ή μέρος του)
         date '2027-06-01' as d1,          -- ημερομηνίες που έψαξε
         date '2027-06-07' as d2
),
pro as (
  select u.id as uid, u.phone_number, u.is_test_account, sp.*
  from users u join skipper_profiles sp on sp.user_id = u.id
  where u.is_owner
),
cl as (
  select u.* from users u, params p
  where u.full_name ilike p.client_name or u.email ilike p.client_name
  order by u.created_at desc limit 1
)
select 1 as n, 'Πελάτης' as check, coalesce((select full_name || ' · ' || phone_number from cl), 'ΔΕΝ ΒΡΕΘΗΚΕ με αυτό το όνομα') as result
union all select 2, 'Επαγγελματικό προφίλ ιδιοκτήτη',
  coalesce((select 'ναι · κύριος ρόλος: ' || role from pro), 'ΚΑΝΕΝΑ — ο λογαριασμός δεν έχει επαγγελματικό προφίλ')
union all select 3, 'Ίδιος κόσμος (πραγματικός / δοκιμαστικός)',
  (select case when in_test_world(pro.uid) = in_test_world(cl.id) then 'ok'
               else 'ΠΡΟΒΛΗΜΑ — επαγγελματίας ' || case when in_test_world(pro.uid) then 'δοκιμαστικός' else 'πραγματικός' end
                    || ', πελάτης ' || case when in_test_world(cl.id) then 'δοκιμαστικός' else 'πραγματικός' end end
   from pro, cl)
union all select 4, 'Έγκριση', (select case when approval_status = 'approved' then 'ok' else 'ΠΡΟΒΛΗΜΑ — ' || approval_status end from pro)
union all select 5, 'Ενεργό προφίλ', (select case when deleted_at is null then 'ok' else 'ΠΡΟΒΛΗΜΑ — διαγραμμένο' end from pro)
union all select 6, 'Τιμή ανά ημέρα', (select case when price_per_day is not null then 'ok · ' || price_per_day || ' €' else 'ΠΡΟΒΛΗΜΑ — δεν έχει οριστεί' end from pro)
union all select 7, 'Ρόλος skipper',
  (select case when role = 'skipper' or exists (select 1 from skipper_secondary_roles r where r.skipper_id = pro.id and r.role = 'skipper' and r.approval_status = 'approved' and r.deleted_at is null)
               then 'ok' else 'ΠΡΟΒΛΗΜΑ — δεν είναι skipper (είναι ' || role || ')' end from pro)
union all select 8, 'Τύποι σκάφους (ο πελάτης πρέπει να διαλέξει έναν από αυτούς)',
  (select coalesce(string_agg(b.name, ', ' order by b.name), 'ΠΡΟΒΛΗΜΑ — κανένας') from pro join skipper_boat_types sb on sb.skipper_id = pro.id join boat_types b on b.id = sb.boat_type_id)
union all select 9, 'Γλώσσες (αν ο πελάτης φίλτραρε γλώσσα, πρέπει να είναι εδώ)',
  (select coalesce(string_agg(l.name, ', ' order by l.name), 'καμία') from pro join user_languages ul on ul.user_id = pro.uid join languages l on l.id = ul.language_id)
union all select 10 + row_number() over (order by r.name), 'Διαθέσιμος ' || r.name || ' για τις ημερομηνίες',
  case when net_availability(pro.id, null, r.id, 'skipper') @> daterange(p.d1, p.d2, '[]') then 'ok'
       else 'ΟΧΙ — δηλωμένο: ' || coalesce(nullif(net_availability(pro.id, null, r.id, 'skipper')::text, '{}'), 'τίποτα') end
  from pro, regions r, params p
union all select 30, 'Επιβεβαιωμένη κράτηση πάνω στις ημερομηνίες',
  (select case when exists (select 1 from bookings b, params p where b.skipper_id = pro.id and b.status in ('confirmed', 'completed')
                              and daterange(b.start_date, b.end_date, '[]') && daterange(p.d1, p.d2, '[]'))
               then 'ΠΡΟΒΛΗΜΑ — υπάρχει κράτηση' else 'ok' end from pro)
union all select 31, 'Ο πελάτης είναι ο ίδιος ο ιδιοκτήτης',
  (select case when cl.id = pro.uid then 'ΠΡΟΒΛΗΜΑ — κανείς δεν βλέπει τον εαυτό του' else 'ok' end from pro, cl)
order by n;
