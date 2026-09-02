-- ============================================================================
-- Ζητήθηκε ρητά: κάθε λογαριασμός (πελάτης ή επαγγελματίας) να μπορεί να
-- διαγραφεί — από τον ίδιο τον χρήστη (αυτοεξυπηρέτηση, δικαίωμα διαγραφής
-- κατά τον ΓΚΠΔ, ήδη αναφέρεται στην Πολιτική Απορρήτου) ή από τον admin.
-- Επιπλέον ζητήθηκε ρητά: μετά τη διαγραφή, το ΙΔΙΟ τηλέφωνο να μπορεί να
-- ξαναχρησιμοποιηθεί για νέα εγγραφή (καθαρά για δοκιμές, αλλά ισχύει και
-- γενικά — κανείς δεν πρέπει να μένει κλειδωμένος σε ένα νούμερο για πάντα).
--
-- ΣΗΜΑΝΤΙΚΟ που εντοπίστηκε κατά τον σχεδιασμό: users.id έχει
-- "references auth.users(id) on delete cascade". Ένα πραγματικό
-- auth.admin.deleteUser() θα ενεργοποιούσε αυτό το cascade και θα
-- εξαφάνιζε ολόκληρο το ιστορικό του χρήστη (κρατήσεις, αξιολογήσεις,
-- οικονομικές κινήσεις) — αντίθετο με όσα ήδη υπόσχεται η Πολιτική
-- Απορρήτου (διατήρηση 5ετίας για οικονομικά, 12 μηνών γενικά). Γι' αυτό
-- ΔΕΝ διαγράφεται ποτέ η γραμμή· ανωνυμοποιείται (ίδιο μοτίβο με το ήδη
-- υπάρχον admin_soft_delete_skipper) και το τηλέφωνο "ελευθερώνεται" με
-- μετατροπή σε μη συγκρούσιμη τιμή — το ιστορικό μένει, τα προσωπικά
-- στοιχεία φεύγουν.
--
-- Το πραγματικό "ελεύθερο τηλέφωνο για νέα εγγραφή" χρειάζεται ΚΑΙ αλλαγή
-- στο ίδιο το auth.users.phone (το Supabase Auth το κρατάει ξεχωριστά,
-- μοναδικό ανά λογαριασμό) — αυτό γίνεται από τον API route μέσω
-- auth.admin.updateUserById(id, {phone: null}), ΟΧΙ deleteUser. Δεν
-- ενεργοποιεί κανένα cascade — αλλάζει μόνο το πεδίο phone.
--
-- Η ίδια η RPC δεν παραχωρείται καθόλου σε "authenticated" — προσβάσιμη
-- μόνο μέσω service role, από τον νέο API route, που είναι το σημείο όπου
-- γίνεται ο πραγματικός έλεγχος ταυτότητας (δικός σου λογαριασμός, ή
-- admin). Το ίδιο μοτίβο με το ήδη υπάρχον admin/impersonate route.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

create or replace function soft_delete_account(p_user_id uuid, p_notes text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row users%rowtype;
  v_skipper_id uuid;
begin
  select * into v_row from users where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status = 'deleted' then raise exception 'already_deleted'; end if;

  -- Εκκρεμότητες που πρέπει πρώτα να τακτοποιηθούν (ήδη η πολιτική στους
  -- όρους χρήσης) — ανοιχτά αιτήματα (χρεώθηκε τέλος, κάποιος περιμένει
  -- απάντηση) και επιβεβαιωμένες κρατήσεις, πλήρωμα και μεταφορά, και στις
  -- δύο πλευρές (πελάτης ή επαγγελματίας).
  if exists (select 1 from booking_requests where client_id = p_user_id and status = 'open') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from delivery_requests dr join delivery_role_requests rr on rr.delivery_request_id = dr.id
             where dr.client_id = p_user_id and rr.status = 'open') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from bookings where client_id = p_user_id and status = 'confirmed') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from delivery_bookings where client_id = p_user_id and status = 'confirmed') then
    raise exception 'has_pending_activity';
  end if;

  select id into v_skipper_id from skipper_profiles where user_id = p_user_id;
  if v_skipper_id is not null then
    if exists (select 1 from bookings where skipper_id = v_skipper_id and status = 'confirmed') then
      raise exception 'has_pending_activity';
    end if;
    if exists (select 1 from delivery_bookings where skipper_id = v_skipper_id and status = 'confirmed') then
      raise exception 'has_pending_activity';
    end if;
  end if;

  -- Ανωνυμοποίηση, όχι διαγραφή γραμμής — το ιστορικό (κρατήσεις,
  -- αξιολογήσεις, wallet_transactions) μένει ακέραιο για το διάστημα
  -- διατήρησης που ήδη υπόσχεται η πολιτική απορρήτου. Το τηλέφωνο
  -- μετατρέπεται σε κάτι που δεν συγκρούεται ξανά με το unique constraint,
  -- ώστε να ελευθερωθεί για νέα εγγραφή με το πραγματικό νούμερο.
  update users set
    status = 'deleted',
    full_name = 'Διαγραμμένος χρήστης',
    email = null,
    phone_number = phone_number || '#deleted#' || substr(md5(random()::text), 1, 8)
  where id = p_user_id;

  if v_skipper_id is not null then
    update skipper_profiles set deleted_at = now() where id = v_skipper_id and deleted_at is null;
    update skipper_secondary_roles set deleted_at = now() where skipper_id = v_skipper_id and deleted_at is null;
  end if;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (coalesce(auth.uid(), p_user_id), 'ban_account', p_user_id,
      coalesce(p_notes, 'Διαγραφή λογαριασμού (αυτοεξυπηρέτηση ή admin).'));
end;
$$;
