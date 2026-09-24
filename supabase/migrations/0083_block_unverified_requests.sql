-- ============================================================================
-- Βρέθηκε σε δοκιμή χρηστικότητας: ένας νέος λογαριασμός (χωρίς SMS OTP,
-- 0075) μπορούσε να στείλει αίτημα και να χρεωθεί το τέλος πριν τον
-- επαληθεύσει ο admin. Αμέσως μετά, κάθε σελίδα που θα του έδειχνε το αίτημα
-- (Αιτήματα, Κρατήσεις, Πορτοφόλι) ήταν πίσω από την οθόνη «περιμένει
-- επαλήθευση» — πλήρωσε για κάτι που δεν μπορούσε να δει.
--
-- Κανόνας πλέον: λογαριασμός με users.phone_verified_at = null δεν μπορεί να
-- δημιουργήσει αίτημα πληρώματος ή αίτημα μεταφοράς σκάφους. Μπλοκάρεται στο
-- INSERT — δηλαδή ΠΡΙΝ από οποιαδήποτε χρέωση (το τέλος χρεώνεται αργότερα,
-- στο pay_and_broadcast / create_delivery_role_request). Εξαιρούνται οι
-- admin (role='admin' ή is_staff_admin), όπως ήδη εξαιρούνται από την
-- οθόνη επαλήθευσης στο UI.
--
-- Trigger αντί για αλλαγή σε κάθε RPC: ένα σημείο, πιάνει κάθε μονοπάτι που
-- γράφει αίτημα, όσα κι αν προστεθούν αργότερα.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

create or replace function guard_unverified_client_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from users u
    where u.id = new.client_id
      and u.phone_verified_at is null
      and u.role <> 'admin'
      and not u.is_staff_admin
  ) then
    raise exception 'account_not_verified';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_unverified_booking_request on booking_requests;
create trigger trg_guard_unverified_booking_request
  before insert on booking_requests
  for each row execute function guard_unverified_client_request();

drop trigger if exists trg_guard_unverified_delivery_request on delivery_requests;
create trigger trg_guard_unverified_delivery_request
  before insert on delivery_requests
  for each row execute function guard_unverified_client_request();
