-- ============================================================================
-- Μέχρι τώρα ένας πελάτης δεν είχε κανέναν τρόπο να αγγίξει ένα ανοιχτό
-- αίτημα μετά την αποστολή του: ούτε να αφαιρέσει έναν συγκεκριμένο
-- επαγγελματία από τη λίστα πριν απαντήσει, ούτε να ακυρώσει ολόκληρο το
-- αίτημα αν βρήκε πλήρωμα αλλού. Οι δύο αυτές λειτουργίες προστίθενται εδώ.
--
-- Και οι δύο δουλεύουν μόνο πάνω σε αίτημα με status = 'open' — μόλις κάποιος
-- διεκδικήσει (matched) ή λήξει (expired_unclaimed) ή ήδη ακυρωθεί, δεν έχει
-- νόημα καμία από τις δύο ενέργειες.
-- ============================================================================

-- Αφαίρεση ενός μόνο επαγγελματία από ένα ανοιχτό αίτημα: η πρόσκληση απλώς
-- διαγράφεται (δεν υπάρχει "withdrawn" status στο ping_status enum, και δεν
-- χρειάζεται — μια αποσυρμένη πρόσκληση δεν έχει νόημα να κρατηθεί ως
-- ιστορικό, σε αντίθεση με μια που κάποιος αρνήθηκε ενεργά).
create or replace function client_withdraw_ping(p_request_id uuid, p_ping_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_status booking_request_status;
  v_ping_status ping_status;
begin
  select client_id, status into v_client_id, v_status
    from booking_requests where id = p_request_id for update;
  if v_client_id is null then
    raise exception 'request_not_found';
  end if;
  if v_client_id <> auth.uid() then
    raise exception 'not_owner';
  end if;
  if v_status <> 'open' then
    raise exception 'request_not_open';
  end if;

  select status into v_ping_status
    from booking_request_pings
    where id = p_ping_id and booking_request_id = p_request_id
    for update;
  if v_ping_status is null then
    raise exception 'ping_not_found';
  end if;
  if v_ping_status <> 'pending' then
    raise exception 'already_resolved';
  end if;

  delete from booking_request_pings where id = p_ping_id;
end;
$$;

grant execute on function client_withdraw_ping(uuid, uuid) to authenticated;

-- Ακύρωση ολόκληρου ανοιχτού αιτήματος: κλείνει το αίτημα, αφαιρεί όσες
-- προσκλήσεις έμειναν σε αναμονή (κανείς δεν πρόλαβε να απαντήσει), και
-- επιστρέφει το τέλος αιτήματος στο wallet του πελάτη αν είχε πληρωθεί —
-- ίδια λογική επιστροφής με το expire_stale_booking_requests() για το άκαρπο
-- αίτημα, απλώς ενεργοποιημένη από τον ίδιο τον πελάτη αντί να περιμένει τη
-- λήξη.
create or replace function cancel_booking_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_status booking_request_status;
  v_fee_paid_at timestamptz;
  v_fee_amount numeric;
begin
  select client_id, status, fee_paid_at, fee_amount
    into v_client_id, v_status, v_fee_paid_at, v_fee_amount
    from booking_requests where id = p_request_id for update;
  if v_client_id is null then
    raise exception 'request_not_found';
  end if;
  if v_client_id <> auth.uid() then
    raise exception 'not_owner';
  end if;
  if v_status <> 'open' then
    raise exception 'request_not_open';
  end if;

  update booking_requests set status = 'cancelled' where id = p_request_id;
  delete from booking_request_pings
    where booking_request_id = p_request_id and status = 'pending';

  if v_fee_paid_at is not null and v_fee_amount > 0 then
    -- wallet_balance is a guarded column (trg_guard_client_profile) — without
    -- this, the update below silently no-ops and the refund never happens.
    perform set_config('platform.trusted', 'true', true);
    update client_profiles set wallet_balance = wallet_balance + v_fee_amount
      where user_id = v_client_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
      values (v_client_id, 'refund_credit', v_fee_amount, p_request_id);
  end if;
end;
$$;

grant execute on function cancel_booking_request(uuid) to authenticated;
