-- ============================================================================
-- Ειδοποίηση στο καμπανάκι τη στιγμή που ο admin εγκρίνει έναν λογαριασμό.
--
-- Μέχρι τώρα ο νέος χρήστης δεν μάθαινε πουθενά ότι εγκρίθηκε — έπρεπε να
-- ξανανοίξει την εφαρμογή στην τύχη. Μπαίνει μέσα στο admin_verify_user
-- και όχι σε γενικό trigger στο users.phone_verified_at: το ίδιο πεδίο
-- γράφεται και από την επανεγγραφή διαγραμμένου λογαριασμού (0074/0075/0077),
-- όπου ένα «ο λογαριασμός σου εγκρίθηκε» θα ήταν λάθος.
--
-- Ειδοποίηση μόνο όταν η έγκριση όντως άλλαξε κάτι (row_count = 1): ένα
-- διπλό κλικ στο admin σε ήδη εγκεκριμένο λογαριασμό δεν στέλνει δεύτερη.
-- Το κείμενο ζει στο UI (describeNotification, kind 'account_verified').
-- ============================================================================

create or replace function admin_verify_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update users set phone_verified_at = now() where id = p_user_id and phone_verified_at is null;
  get diagnostics v_count = row_count;
  if v_count = 1 then
    perform notify_user(p_user_id, 'account_verified', '{}'::jsonb, '/platform');
  end if;
end;
$$;
grant execute on function admin_verify_user(uuid) to authenticated;
