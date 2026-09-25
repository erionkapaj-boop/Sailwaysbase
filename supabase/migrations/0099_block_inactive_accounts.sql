-- ============================================================================
-- Ανεσταλμένος (ή διαγραμμένος) λογαριασμός δεν κάνει τίποτα.
--
-- Η εφαρμογή αποσυνδέει έναν ανεσταλμένο χρήστη στο login, αλλά μια συνεδρία
-- που ήταν ήδη ανοιχτή κρατά το token της. Με αυτό μπορούσε ακόμα να πληρώσει
-- και να στείλει αίτημα (pay_and_broadcast), να στείλει μηνύματα, να γράψει
-- αξιολόγηση, να δεχτεί δουλειά — κανένα RPC και καμία πολιτική RLS δεν
-- κοίταζε το users.status.
--
-- Αντί να ξαναγραφτεί κάθε RPC, ένας έλεγχος μπαίνει ως trigger στους πίνακες
-- όπου γράφει κάθε ενέργεια: αν ο καλών (auth.uid()) είναι σε αναστολή ή
-- διαγραμμένος, η εγγραφή απορρίπτεται με account_not_active. (Ο 'draft' —
-- επαγγελματίας που περιμένει έγκριση — συνεχίζει κανονικά να συμπληρώνει
-- προφίλ και διαθεσιμότητα.) Ισχύει είτε η εγγραφή γίνεται απευθείας
-- (PostgREST) είτε μέσα από SECURITY DEFINER RPC, αφού το auth.uid() είναι
-- πάντα αυτός που έκανε την κλήση.
--
-- Δεν επηρεάζει:
--   - τον admin που ενεργεί πάνω σε ανεσταλμένο λογαριασμό (ο καλών είναι ο admin)
--   - τις νυχτερινές εργασίες (δεν υπάρχει auth.uid())
--   - την ανάγνωση: ο χρήστης βλέπει ακόμα το ιστορικό του
--   - τη διαγραφή λογαριασμού και την επανεγγραφή (γράφουν σε users /
--     skipper_profiles, όχι σε αυτούς τους πίνακες)
--   - τη φόρμα επικοινωνίας (contact_messages), ώστε να μπορεί να ρωτήσει γιατί
-- ============================================================================

create or replace function block_inactive_caller() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and exists (select 1 from users where id = auth.uid() and status in ('suspended', 'deleted')) then
    raise exception 'account_not_active';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function block_inactive_caller() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'booking_requests', 'booking_request_pings', 'bookings',
    'delivery_requests', 'delivery_role_requests', 'delivery_role_pings', 'delivery_bookings',
    'messages', 'reviews', 'wallet_transactions',
    'availability_windows', 'availability_window_regions', 'availability_blocks',
    'delivery_availability_windows', 'cancellation_reports'
  ] loop
    execute format('drop trigger if exists aa_block_inactive_caller on %I', t);
    -- "aa_" ώστε να τρέχει πρώτο: το σωστό σφάλμα, πριν από οποιονδήποτε άλλον έλεγχο.
    execute format('create trigger aa_block_inactive_caller before insert or update or delete on %I
                    for each row execute function block_inactive_caller()', t);
  end loop;
end;
$$;
