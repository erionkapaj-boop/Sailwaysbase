-- ============================================================================
-- Η ειδοποίηση «Το ταξίδι ολοκληρώθηκε. Πώς πήγε;» άνοιγε σελίδα που δεν
-- υπάρχει πια (/platform/client, /platform/skipper → 404). Πηγαίνει τώρα στην
-- ίδια την κράτηση, όπου είναι και η φόρμα αξιολόγησης. Δείχνει επίσης το
-- μέρος και για κρατήσεις με περιοχή/σημείο (όχι μόνο με λιμάνι).
-- Οι ειδοποιήσεις που έχουν ήδη σταλεί με παλιούς συνδέσμους διορθώνονται.
-- ============================================================================
create or replace function notify_booking_completed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_payload jsonb; v_link text;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return null;
  end if;

  select user_id into v_skipper_uid from skipper_profiles where id = new.skipper_id;
  v_payload := jsonb_build_object(
    'port', booking_place(new.departure_point, new.port_id, new.region_id),
    'start', new.start_date, 'end', new.end_date);
  v_link := '/platform/bookings?focus=' || new.id;

  perform notify_user(new.client_id, 'review_prompt', v_payload, v_link);
  perform notify_user(v_skipper_uid, 'review_prompt', v_payload, v_link);
  return null;
end;
$$;

-- Παλιοί σύνδεσμοι σελίδων που καταργήθηκαν.
update notifications set link = '/platform/bookings'
 where link in ('/platform/client', '/platform/skipper', '/platform/client/bookings', '/platform/skipper/bookings');
update notifications set link = '/platform/wallet' where link = '/platform/skipper/wallet';
update notifications set link = '/platform/admin/replacements' where link = '/platform/admin/coverage';
