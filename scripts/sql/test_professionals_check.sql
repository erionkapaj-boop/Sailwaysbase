-- Έλεγχος: ποιοι δοκιμαστικοί επαγγελματίες ΔΕΝ βρίσκονται στην αναζήτηση, και γιατί.
-- Μόνο ανάγνωση. Άδειο αποτέλεσμα = όλοι εμφανίζονται.
select
  coalesce(nullif(u.full_name, ''), sp.full_name) as name,
  u.phone_number,
  sp.role,
  case
    when sp.approval_status <> 'approved' then 'δεν είναι εγκεκριμένος'
    when sp.price_per_day is null then 'δεν έχει ορίσει τιμή'
    when sp.role = 'skipper' and not exists (select 1 from skipper_boat_types b where b.skipper_id = sp.id) then 'δεν έχει τύπο σκάφους'
    when not has_future_availability(sp.id) then 'δεν έχει διαθεσιμότητα'
  end as reason
from skipper_profiles sp
join users u on u.id = sp.user_id
where sp.deleted_at is null
  and (is_test_phone(u.phone_number) or u.is_test_account)
  and (
    sp.approval_status <> 'approved'
    or sp.price_per_day is null
    or (sp.role = 'skipper' and not exists (select 1 from skipper_boat_types b where b.skipper_id = sp.id))
    or not has_future_availability(sp.id)
  )
order by 1;
