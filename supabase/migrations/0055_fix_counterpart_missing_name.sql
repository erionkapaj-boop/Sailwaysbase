-- ============================================================================
-- Ζητήθηκε: σε επιβεβαιωμένη κράτηση, το όνομα του επαγγελματία εξακολουθεί
-- να μην εμφανίζεται στον πελάτη (φαίνεται μόνο "—"), ενώ το τηλέφωνο και η
-- φωτογραφία εμφανίζονται κανονικά.
--
-- Αιτία: το get_booking_counterpart() διάβαζε το όνομα ΜΟΝΟ από users.full_name.
-- Για επαγγελματίες που δημιουργήθηκαν/ενημερώθηκαν εκτός της κανονικής
-- φόρμας εγγραφής (π.χ. seed/test δεδομένα), το users.full_name μπορεί να
-- έχει μείνει κενό ενώ το πραγματικό, ζωντανό όνομα βρίσκεται στο
-- skipper_profiles.full_name (αυτό που ήδη χρησιμοποιεί η υπόλοιπη
-- εφαρμογή). Ο πελάτης δεν έχει αντίστοιχο δεύτερο πεδίο, οπότε η δική του
-- πλευρά μένει όπως ήταν.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

-- ---- 1. Backfill: ό,τι ήδη λείπει σήμερα διορθώνεται αμέσως. ----
update users u
set full_name = sp.full_name
from skipper_profiles sp
where sp.user_id = u.id
  and (u.full_name is null or btrim(u.full_name) = '')
  and sp.full_name is not null and btrim(sp.full_name) <> '';

-- ---- 2. get_booking_counterpart: coalesce με skipper_profiles.full_name,
-- ώστε το ίδιο κενό να μην μπορεί να ξαναδημιουργηθεί αν κάποιο μελλοντικό
-- seed/import ξαναξεχάσει το users.full_name. Ίδια υπογραφή — απλό
-- create or replace. ----
create or replace function get_booking_counterpart(p_booking_id uuid)
returns table(user_id uuid, full_name text, phone_number text, photo_url text, crew_role crew_role)
language plpgsql stable security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_uid uuid := auth.uid();
  v_counterpart_uid uuid;
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
      u.id,
      coalesce(nullif(btrim(u.full_name), ''), sp2.full_name),
      u.phone_number,
      case
        when v_counterpart_is_client then coalesce(u.photo_url, sp2.photo_url)
        else coalesce(sp2.photo_url, u.photo_url)
      end,
      case when v_counterpart_is_client then null else sp2.role end
    from users u
    left join skipper_profiles sp2 on sp2.user_id = u.id
    where u.id = v_counterpart_uid;
end;
$$;

grant execute on function get_booking_counterpart(uuid) to authenticated;
