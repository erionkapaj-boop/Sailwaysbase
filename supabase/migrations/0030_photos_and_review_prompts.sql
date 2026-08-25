-- ============================================================================
-- Δύο ζητούμενα: φωτογραφίες και στις δύο κατευθύνσεις της αποκάλυψης, και
-- ενεργή υπενθύμιση αξιολόγησης μόλις ολοκληρωθεί ο ναύλος.
--
-- ---------------------------------------------------------------------------
-- Φωτογραφίες.
--
-- Ο επαγγελματίας έχει ήδη photo_url στο skipper_profiles — η φωτογραφία που
-- επιλέγει ο ίδιος για να παρουσιαστεί σε αναζητήσεις. Ο πελάτης δεν είχε
-- πουθενά να βάλει φωτογραφία: ούτε στήλη, ούτε σελίδα. Προστίθεται
-- users.photo_url ως η προσωπική φωτογραφία κάθε λογαριασμού — καθολική,
-- όπως το full_name, όχι δεμένη με τον επαγγελματικό ρόλο.
--
-- Το bucket αποθήκευσης (crew-photos, 0012) ήδη επιτρέπει σε ΚΑΘΕ
-- συνδεδεμένο λογαριασμό να ανεβάσει στον δικό του φάκελο — το όνομα
-- "crew-photos" είναι απλώς ιστορικό, η πολιτική ποτέ δεν απαιτούσε ρόλο
-- skipper. Ό,τι έλειπε ήταν στήλη να αποθηκευτεί το αποτέλεσμα και σελίδα
-- να το ανεβάσει· και τα δύο έρχονται στο ίδιο commit με αυτό το migration.
--
-- get_booking_counterpart() μαθαίνει να διαλέγει τη σωστή φωτογραφία ανά
-- κατεύθυνση: όταν φαίνεσαι ως ΕΠΑΓΓΕΛΜΑΤΙΑΣ προτεραιότητα στο
-- skipper_profiles.photo_url (αυτή που ο ίδιος έχει διαλέξει να δείχνει σε
-- πελάτες)· όταν φαίνεσαι ως ΠΕΛΑΤΗΣ, το users.photo_url. Κάθε κατεύθυνση
-- πέφτει στην άλλη σαν εφεδρική, αντί να μείνει κενή όταν υπάρχει ήδη μια
-- πραγματική φωτογραφία του ίδιου προσώπου να δειχτεί.
-- ============================================================================

alter table users add column if not exists photo_url text;

drop function if exists get_booking_counterpart(uuid);
create or replace function get_booking_counterpart(p_booking_id uuid)
returns table(user_id uuid, full_name text, phone_number text, photo_url text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_uid uuid := auth.uid();
  v_counterpart_uid uuid;
  -- true όταν ο απέναντι φαίνεται στην ιδιότητα του ΠΕΛΑΤΗ (δηλαδή εσύ είσαι
  -- το πλήρωμα) — αποφασίζει ποια φωτογραφία προηγείται παρακάτω.
  v_counterpart_is_client boolean;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found'; end if;

  if v_booking.status not in ('confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_skipper') then
    raise exception 'not_revealed';
  end if;

  if v_uid = v_booking.client_id then
    select sp.user_id into v_counterpart_uid from skipper_profiles sp where sp.id = v_booking.skipper_id;
    v_counterpart_is_client := false;
  elsif exists (select 1 from skipper_profiles sp where sp.id = v_booking.skipper_id and sp.user_id = v_uid) then
    v_counterpart_uid := v_booking.client_id;
    v_counterpart_is_client := true;
  else
    raise exception 'not_participant';
  end if;

  return query
    select
      u.id, u.full_name, u.phone_number,
      case
        when v_counterpart_is_client then coalesce(u.photo_url, sp2.photo_url)
        else coalesce(sp2.photo_url, u.photo_url)
      end
    from users u
    left join skipper_profiles sp2 on sp2.user_id = u.id
    where u.id = v_counterpart_uid;
end;
$$;
grant execute on function get_booking_counterpart(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Υπενθύμιση αξιολόγησης μόλις ολοκληρωθεί ο ναύλος.
--
-- mark_bookings_completed() (0002, τρέχει κάθε βράδυ μέσω cron) είναι το
-- σημείο που μια κράτηση περνάει σε 'completed'. Μέχρι τώρα τίποτα δεν
-- ειδοποιούσε κανέναν όταν συνέβαινε αυτό — η πρόσκληση για αξιολόγηση ήταν
-- θαμμένη μέσα σε μια κλειστή γραμμή που έπρεπε να ανοίξει κανείς μόνος του
-- για να τη βρει, σε καμία ειδοποίηση, σε κανένα καμπανάκι.
-- ---------------------------------------------------------------------------
create or replace function notify_booking_completed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_port text; v_payload jsonb;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return null;
  end if;

  select user_id into v_skipper_uid from skipper_profiles where id = new.skipper_id;
  select name into v_port from ports where id = new.port_id;
  v_payload := jsonb_build_object('port', v_port, 'start', new.start_date, 'end', new.end_date);

  perform notify_user(new.client_id, 'review_prompt', v_payload, '/platform/client');
  perform notify_user(v_skipper_uid, 'review_prompt', v_payload, '/platform/skipper');
  return null;
end;
$$;

drop trigger if exists trg_notify_booking_completed on bookings;
create trigger trg_notify_booking_completed
  after update of status on bookings
  for each row execute function notify_booking_completed();

-- ---------------------------------------------------------------------------
-- Πόσες ολοκληρωμένες κρατήσεις περιμένουν τη ΔΙΚΗ ΣΟΥ αξιολόγηση — για ένα
-- banner στην κορυφή του πίνακα, όχι μόνο μια ειδοποίηση που σβήνει μόλις
-- διαβαστεί. Παραμετροποιημένη όπως my_notification_counts/my_standing, ώστε
-- η «Προβολή ως» να δείχνει το σωστό νούμερο για τον χρήστη που εξετάζεις.
-- ---------------------------------------------------------------------------
create or replace function my_pending_review_count(p_user_id uuid default null)
returns int
language sql stable security definer set search_path = public as $$
  with me as (
    select acting_user(p_user_id) as uid, skipper_profile_id_of(acting_user(p_user_id)) as sid
  )
  select count(*)::int
  from bookings b
  where b.status = 'completed'
    and (b.client_id = (select uid from me) or b.skipper_id = (select sid from me))
    and not exists (
      select 1 from reviews r where r.booking_id = b.id and r.reviewer_id = (select uid from me)
    );
$$;
grant execute on function my_pending_review_count(uuid) to authenticated;
