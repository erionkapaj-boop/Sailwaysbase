-- Δοκιμαστικοί επαγγελματίες: διαθέσιμοι παντού, για όλο το 2026–2027.
--
-- Για λογαριασμούς επίδειξης (δοκιμαστικό τηλέφωνο +3069800000NN ή
-- σημειωμένοι ως δοκιμαστικοί). Πραγματικοί επαγγελματίες δεν αγγίζονται.
--
-- Κάθε δοκιμαστικός επαγγελματίας παίρνει ΜΙΑ περίοδο, από σήμερα έως
-- 31/12/2027, σε ΟΛΕΣ τις περιοχές, για ΟΛΟΥΣ τους ρόλους του (crew_role
-- null = κύριος και δεύτερος ρόλος). Οι υπάρχουσες περίοδοί του μένουν όπως
-- είναι· η αναζήτηση ενώνει τις περιόδους, οπότε δεν χρειάζεται διαγραφή.
-- Οι απουσίες που έχει δηλώσει (availability_blocks) ΔΕΝ πειράζονται.
--
-- Ασφαλές να τρέξει ξανά: όποιος έχει ήδη αυτή την κάλυψη παραλείπεται.
-- Νέες περιοχές που θα προστεθούν αργότερα δεν καλύπτονται αυτόματα· ξανά
-- εκτέλεση τις προσθέτει.

with pros as (
  select sp.id
  from skipper_profiles sp
  join users u on u.id = sp.user_id
  where sp.deleted_at is null
    and (is_test_phone(u.phone_number) or u.is_test_account)
),
need as (
  select p.id
  from pros p
  where not exists (
    select 1 from availability_windows w
    where w.skipper_id = p.id
      and w.crew_role is null
      and w.start_date <= current_date
      and w.end_date >= date '2027-12-31'
      and not exists (
        select 1 from regions r
        where not exists (
          select 1 from availability_window_regions wr where wr.window_id = w.id and wr.region_id = r.id
        )
      )
  )
),
added as (
  insert into availability_windows (skipper_id, start_date, end_date)
  select id, current_date, date '2027-12-31' from need
  returning id
),
linked as (
  insert into availability_window_regions (window_id, region_id)
  select a.id, r.id from added a cross join regions r
  returning window_id
)
select
  (select count(*) from pros) as test_professionals,
  (select count(*) from added) as windows_added,
  (select count(*) from regions) as regions_each,
  (select count(*) from pros) - (select count(*) from added) as already_covered;
