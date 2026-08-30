-- ============================================================================
-- Οι σελίδες ξαναοργανώθηκαν σε ένα ενιαίο μενού (Αιτήματα/Κρατήσεις/
-- Διαθεσιμότητα/Προφίλ/Πορτοφόλι, ίδιο για κάθε λογαριασμό) — δεν υπάρχουν
-- πια χωριστές διαδρομές /platform/client/... και /platform/skipper/... Οι
-- συναρτήσεις που έγραφαν το link μιας ειδοποίησης ενημερώνονται να δείχνουν
-- στις νέες, ενιαίες διαδρομές. Πολλές απλοποιούνται: αφού μία σελίδα δείχνει
-- και τις δύο πλευρές (π.χ. το πορτοφόλι, οι κρατήσεις), δεν χρειάζεται πια
-- να διαλέγουν ανάμεσα σε δύο hrefs.
-- ============================================================================

create or replace function notify_request_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_req booking_requests%rowtype; v_port text; v_fee numeric;
begin
  select user_id into v_uid from skipper_profiles where id = new.skipper_id;
  select * into v_req from booking_requests where id = new.booking_request_id;
  select name into v_port from ports where id = v_req.port_id;
  v_fee := coalesce(v_req.claim_fee_amount, (select value from platform_settings where key = 'skipper_claim_fee'));
  perform notify_user(
    v_uid,
    case when v_req.origin = 'client' then 'request_received' else 'offer_received' end,
    jsonb_build_object(
      'port', v_port, 'start', v_req.start_date, 'end', v_req.end_date,
      'origin', v_req.origin, 'fee', v_fee, 'note', v_req.note
    ),
    '/platform/requests'
  );
  return null;
end;
$$;

create or replace function notify_booking_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_port text; v_payload jsonb;
begin
  select user_id into v_skipper_uid from skipper_profiles where id = new.skipper_id;
  select name into v_port from ports where id = new.port_id;
  v_payload := jsonb_build_object('port', v_port, 'start', new.start_date, 'end', new.end_date);

  perform notify_user(new.client_id, 'booking_confirmed', v_payload,
                      '/platform/bookings?focus=' || new.id);
  perform notify_user(v_skipper_uid, 'booking_confirmed', v_payload,
                      '/platform/bookings?focus=' || new.id);
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
    perform notify_user(v_skipper_uid, 'booking_cancelled', v_payload, '/platform/bookings');
  else
    perform notify_user(new.client_id, 'booking_cancelled', v_payload, '/platform/bookings');
    -- Only this direction leaves someone stranded, so only this direction
    -- needs an operator.
    for v_admin in select id from users where role = 'admin' loop
      perform notify_user(v_admin.id, 'coverage_needed', v_payload, '/platform/admin/coverage');
    end loop;
  end if;
  return null;
end;
$$;

-- Δεν χρειάζεται πια να ρωτήσει ποια πλευρά της κράτησης αξιολογήθηκε — και
-- οι δύο πλευρές δείχνουν τη βαθμολογία τους στην ίδια σελίδα πια.
create or replace function notify_review_received() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_user(
    new.reviewee_id, 'review_received',
    jsonb_build_object('rating', new.rating),
    '/platform/wallet'
  );
  return null;
end;
$$;

-- Ένα πορτοφόλι, μία σελίδα — καμία κίνηση δεν χρειάζεται πια να διαλέξει
-- ανάμεσα σε δύο hrefs.
create or replace function notify_wallet_movement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_user(
    new.user_id, 'wallet',
    jsonb_build_object('amount', new.amount, 'txn_type', new.type),
    '/platform/wallet'
  );
  return null;
end;
$$;
