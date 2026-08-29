-- Κρατήσεις μεταφέρθηκαν σε δικές τους σελίδες (/platform/client/bookings,
-- /platform/skipper/bookings) — οι ειδοποιήσεις που έδειχναν σε μία
-- συγκεκριμένη κράτηση πρέπει να οδηγούν εκεί, όχι στον πίνακα που πια δεν
-- τη δείχνει.

create or replace function notify_booking_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_port text; v_payload jsonb;
begin
  select user_id into v_skipper_uid from skipper_profiles where id = new.skipper_id;
  select name into v_port from ports where id = new.port_id;
  v_payload := jsonb_build_object('port', v_port, 'start', new.start_date, 'end', new.end_date);

  perform notify_user(new.client_id, 'booking_confirmed', v_payload,
                      '/platform/client/bookings?focus=' || new.id);
  perform notify_user(v_skipper_uid, 'booking_confirmed', v_payload,
                      '/platform/skipper/bookings?focus=' || new.id);
  return null;
end;
$$;

create or replace function notify_booking_cancelled() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_port text; v_payload jsonb; v_admin record;
begin
  if new.status not in ('cancelled_by_client', 'cancelled_by_skipper')
     or old.status = new.status then
    return null;
  end if;

  select user_id into v_skipper_uid from skipper_profiles where id = new.skipper_id;
  select name into v_port from ports where id = new.port_id;
  v_payload := jsonb_build_object('port', v_port, 'start', new.start_date, 'end', new.end_date);

  if new.status = 'cancelled_by_client' then
    perform notify_user(v_skipper_uid, 'booking_cancelled', v_payload, '/platform/skipper/bookings');
  else
    perform notify_user(new.client_id, 'booking_cancelled', v_payload, '/platform/client/bookings');
    -- Only this direction leaves someone stranded, so only this direction
    -- needs an operator.
    for v_admin in select id from users where role = 'admin' loop
      perform notify_user(v_admin.id, 'coverage_needed', v_payload, '/platform/admin/coverage');
    end loop;
  end if;
  return null;
end;
$$;
