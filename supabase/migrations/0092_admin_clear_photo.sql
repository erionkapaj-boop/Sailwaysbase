-- ============================================================================
-- Αφαίρεση προβληματικής φωτογραφίας από τον admin.
--
-- Ζητήθηκε ρητά η δυνατότητα να διαχειριστεί ο admin μια φωτογραφία που
-- μπορεί να παρακάμπτει την πλατφόρμα (τηλέφωνο/email/site/social πάνω στη
-- φωτογραφία), ΧΩΡΙΣ να χτιστεί αυτόματο moderation που δεν υπήρχε ήδη ως
-- υποδομή. Αυτό είναι η ελάχιστη, χειροκίνητη ενέργεια: καθαρίζει
-- users.photo_url (η μία, κοινή φωτογραφία κάθε λογαριασμού, ενοποιημένη στο
-- 0081 — ίδιο πεδίο για πελάτη και επαγγελματία) και το καταγράφει στο
-- admin_actions με τον λόγο, ώστε να μείνει ίχνος γιατί έφυγε. Ο χρήστης
-- μπορεί να ανεβάσει νέα οποτεδήποτε.
-- ============================================================================
create or replace function admin_clear_photo(p_user_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_had_photo boolean;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select photo_url is not null into v_had_photo from users where id = p_user_id;
  if v_had_photo is null then raise exception 'user_not_found'; end if;
  if not v_had_photo then raise exception 'no_photo'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set photo_url = null where id = p_user_id;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'clear_photo', p_user_id, coalesce(nullif(btrim(p_reason), ''), ''));
end;
$$;
grant execute on function admin_clear_photo(uuid, text) to authenticated;
