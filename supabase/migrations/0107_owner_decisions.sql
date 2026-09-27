-- ============================================================================
-- Οι αποφάσεις του ιδιοκτήτη πάνω στον έλεγχο (docs/AUDIT.md).
--
-- #1 #2  Το κλείδωμα μετά από λάθος PIN στη σελίδα σύνδεσης καταργείται: όποιος
--        ήθελε μπορούσε να κλειδώσει έξω οποιονδήποτε. Φρένο μένει το όριο
--        προσπαθειών του Supabase. Οι αποτυχίες γράφονται πια μόνο από τον
--        server (αλλαγή τηλεφώνου/email, διαγραφή: εκεί ο καλών είναι ήδη
--        συνδεδεμένος).
-- #3     Το «υπάρχει λογαριασμός με αυτό το τηλέφωνο;» δεν απαντιέται πια σε
--        ανώνυμους· ο έλεγχος γίνεται μόνο στον server.
-- #13 #14 Αλλαγή διπλώματος ή ονόματος → ξανά σε έλεγχο.
-- #43    Αναστολή/διαγραφή επαγγελματία → οι μελλοντικές κρατήσεις του γίνονται
--        υποθέσεις αντικατάστασης και ο πελάτης ειδοποιείται.
-- #52    Από την ημέρα έναρξης δεν ακυρώνεται τίποτα: η υπόθεση θεωρείται κλεισμένη.
--        Η επικοινωνία γίνεται μέσα στην πλατφόρμα (είναι και η απόδειξη): με
--        την επιβεβαίωση φεύγει αυτόματο πρώτο μήνυμα, και αν ο επαγγελματίας
--        δεν απαντήσει μέσα στο προθεσμία (pro_response_hours), ο πελάτης
--        μπορεί να ακυρώσει χωρίς δική του επιβάρυνση και να ψάξει ξανά ο ίδιος
--        (νέα αναζήτηση, νέο τέλος).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- #1 #2
-- ---------------------------------------------------------------------------
drop policy if exists "login attempts insert only" on login_attempts;
revoke insert on login_attempts from anon, authenticated;
revoke execute on function check_login_rate_limit(text) from public, anon, authenticated;
grant execute on function check_login_rate_limit(text) to service_role;

-- #3
revoke execute on function phone_registration_status(text) from public, anon, authenticated;
grant execute on function phone_registration_status(text) to service_role;

-- ---------------------------------------------------------------------------
-- #43 Οι μελλοντικές κρατήσεις ενός επαγγελματία που φεύγει από την
-- πλατφόρμα. Κρουαζιέρες: υπόθεση αντικατάστασης, όπως όταν ακυρώνει ο ίδιος
-- (χωρίς βάρος στην αξιοπιστία του — η απόφαση ήταν της πλατφόρμας).
-- Μεταφορές: ακύρωση με επιστροφή του τέλους στον πελάτη. Ό,τι έχει ήδη
-- ξεκινήσει μένει όπως είναι.
-- ---------------------------------------------------------------------------
create or replace function release_professional_bookings(p_user_id uuid, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_sp uuid;
  v_n int := 0;
  v_b record;
  v_fee numeric;
begin
  select id into v_sp from skipper_profiles where user_id = p_user_id;
  if v_sp is null then return 0; end if;

  perform set_config('platform.trusted', 'true', true);
  perform set_config('platform.cancel_why', 'removed', true);
  update bookings
     set status = 'cancelled_by_skipper', cancelled_at = now(), cancellation_reason = p_reason,
         cancellation_lead_days = cancellation_lead_days_for(now(), start_date), cancellation_weight = 0
   where skipper_id = v_sp and status = 'confirmed' and start_date > current_date;
  get diagnostics v_n = row_count;
  perform set_config('platform.cancel_why', '', true);

  for v_b in
    select * from delivery_bookings
     where skipper_id = v_sp and status = 'confirmed' and departure_date > current_date
     for update
  loop
    update delivery_bookings
       set status = 'cancelled', cancelled_at = now(), cancelled_by = 'professional', cancellation_reason = p_reason
     where id = v_b.id;
    select client_fee into v_fee from delivery_role_requests where id = v_b.delivery_role_request_id;
    if coalesce(v_fee, 0) > 0 then
      update users set wallet_balance = wallet_balance + v_fee where id = v_b.client_id;
      insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id, related_delivery_booking_id)
        values (v_b.client_id, 'refund_credit', v_fee, v_b.delivery_role_request_id, v_b.id);
    end if;
    perform notify_user(
      v_b.client_id, 'delivery_cancelled',
      jsonb_build_object('origin', v_b.origin_point, 'destination', v_b.destination_point,
                         'role', v_b.crew_role, 'by', 'professional', 'refund', coalesce(v_fee, 0)),
      '/platform/delivery/requests');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function release_professional_bookings(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- #52 Επικοινωνία μέσα στην πλατφόρμα και προθεσμία απάντησης
-- ---------------------------------------------------------------------------
insert into platform_settings (key, value) values ('pro_response_hours', 24)
  on conflict (key) do nothing;

drop policy if exists "settings public keys readable" on platform_settings;
create policy "settings public keys readable" on platform_settings for select using (
  is_admin() or key in (
    'client_request_fee', 'skipper_claim_fee', 'otp_enabled', 'unclaimed_expiry_hours', 'delivery_expiry_hours',
    'delivery_min_fee', 'delivery_platform_fee_pct', 'delivery_skipper_rate_per_mile',
    'delivery_hostess_rate_per_mile', 'delivery_cook_rate_per_mile', 'delivery_deckhand_rate_per_mile',
    'pro_response_hours')
);

-- Μηνύματα που έστειλε η πλατφόρμα για λογαριασμό κάποιου.
alter table messages add column if not exists auto boolean not null default false;

-- Με κάθε επιβεβαίωση, πρώτο μήνυμα από τον πελάτη προς τον επαγγελματία.
-- Από εκεί μετράει η προθεσμία απάντησης.
create or replace function send_booking_greeting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'confirmed' then return null; end if;
  insert into messages (booking_id, sender_id, content, auto)
    values (new.id, new.client_id,
            'Γεια σας! Η κράτηση επιβεβαιώθηκε. Απαντήστε μου εδώ, παρακαλώ, για να κανονίσουμε τις λεπτομέρειες '
            || 'και να ανταλλάξουμε τηλέφωνα.',
            true);
  return null;
end;
$$;
drop trigger if exists zz_send_booking_greeting on bookings;
create trigger zz_send_booking_greeting after insert on bookings
  for each row execute function send_booking_greeting();

create or replace function professional_responded(p_booking_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from messages m
      join bookings b on b.id = m.booking_id
      join skipper_profiles sp on sp.id = b.skipper_id
     where m.booking_id = p_booking_id and m.sender_id = sp.user_id and not m.auto)
$$;
revoke execute on function professional_responded(uuid) from public, anon, authenticated;

-- Για τη σελίδα της κράτησης: μέχρι πότε πρέπει να απαντήσει ο επαγγελματίας,
-- αν απάντησε, και αν ο πελάτης μπορεί τώρα να ακυρώσει λόγω μη απάντησης.
create or replace function booking_response_state(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_b bookings%rowtype;
  v_deadline timestamptz;
  v_responded boolean;
begin
  select * into v_b from bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found'; end if;
  if not (is_admin() or v_b.client_id = auth.uid()
          or exists (select 1 from skipper_profiles where id = v_b.skipper_id and user_id = auth.uid())) then
    raise exception 'not_participant';
  end if;
  v_deadline := coalesce(v_b.confirmed_at, v_b.created_at)
                + coalesce((select value from platform_settings where key = 'pro_response_hours'), 24) * interval '1 hour';
  v_responded := professional_responded(p_booking_id);
  return jsonb_build_object(
    'deadline', v_deadline,
    'responded', v_responded,
    'trip_started', v_b.start_date <= current_date,
    'can_cancel_no_response', v_b.status = 'confirmed' and not v_responded
                              and now() >= v_deadline and v_b.start_date > current_date);
end;
$$;

-- Ο πελάτης ακυρώνει επειδή ο επαγγελματίας δεν απάντησε μέσα στην προθεσμία.
-- Βαραίνει τον επαγγελματία, όχι τον πελάτη. Η πλατφόρμα έκανε τη δουλειά της
-- (τους έφερε σε επαφή): δεν ανοίγει υπόθεση αντικατάστασης και δεν
-- επιστρέφεται κανένα τέλος — ο πελάτης ψάχνει ξανά ο ίδιος.
create or replace function cancel_booking_no_response(p_booking_id uuid) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_b bookings%rowtype;
  v_state jsonb;
begin
  select * into v_b from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_b.client_id is distinct from auth.uid() then raise exception 'not_participant'; end if;
  if v_b.status <> 'confirmed' then raise exception 'not_cancellable'; end if;
  if v_b.start_date <= current_date then raise exception 'trip_started'; end if;
  v_state := booking_response_state(p_booking_id);
  if (v_state ->> 'responded')::boolean then raise exception 'professional_responded'; end if;
  if now() < (v_state ->> 'deadline')::timestamptz then raise exception 'response_time_not_over'; end if;

  perform set_config('platform.trusted', 'true', true);
  update bookings
     set status = 'cancelled_by_skipper', cancelled_at = now(),
         cancellation_reason = 'Ο επαγγελματίας δεν απάντησε στα μηνύματα της πλατφόρμας',
         cancellation_lead_days = cancellation_lead_days_for(now(), start_date),
         cancellation_weight = cancellation_weight_for(now(), start_date),
         replacement_closed_at = now(), replacement_closed_by = auth.uid(),
         replacement_closed_reason = 'Ο επαγγελματίας δεν απάντησε. Ο πελάτης κάνει νέα αναζήτηση.'
   where id = p_booking_id
   returning * into v_b;
  insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
    values (p_booking_id, auth.uid(), 'skipper', 'Δεν απάντησε στα μηνύματα της πλατφόρμας');
  return v_b;
end;
$$;

-- Ειδοποιήσεις ακύρωσης: και οι δύο νέες περιπτώσεις.
create or replace function notify_booking_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_payload jsonb;
begin
  if new.status not in ('cancelled_by_client', 'cancelled_by_skipper')
     or old.status = new.status then
    return null;
  end if;

  select user_id into v_skipper_uid from skipper_profiles where id = new.skipper_id;
  v_payload := jsonb_build_object(
    'port', booking_place(new.departure_point, new.port_id, new.region_id),
    'start', new.start_date, 'end', new.end_date, 'role', new.crew_role
  );

  if new.status = 'cancelled_by_client' then
    perform notify_user(
      v_skipper_uid, 'booking_cancelled',
      v_payload || jsonb_build_object('by', 'client', 'refund', coalesce(new.skipper_claim_fee_amount, 0)),
      '/platform/bookings'
    );
  elsif new.replacement_closed_at is not null then
    -- ο πελάτης ακύρωσε γιατί δεν πήρε απάντηση
    perform notify_user(
      v_skipper_uid, 'booking_cancelled',
      v_payload || jsonb_build_object('by', 'no_response', 'refund', 0),
      '/platform/bookings'
    );
  else
    perform notify_user(
      new.client_id, 'booking_cancelled',
      v_payload || jsonb_build_object('by', 'professional', 'refund', 0, 'searching', true,
                                      'removed', coalesce(current_setting('platform.cancel_why', true), '') = 'removed'),
      '/platform/bookings?focus=' || new.id
    );
    perform notify_admins('coverage_needed', v_payload || jsonb_build_object('reason', 'skipper_cancelled'),
                          '/platform/admin/replacements');
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Συναρτήσεις που αλλάζουν (#13 #14 #43 #52, και ο βοηθός διαχειριστή δεν
-- διαγράφει πια άλλον βοηθό)
-- ---------------------------------------------------------------------------
-- Το guard των δεύτερων ιδιοτήτων στέλνει πλέον ειδοποιήσεις (notify_user δεν
-- ανοίγει στον χρήστη), οπότε τρέχει με τα δικαιώματα της βάσης.
alter function guard_secondary_role() security definer set search_path = public;
-- Διόρθωση του 0106: ο έλεγχος ορίων επαγγελματία έσπαγε σε κάθε αλλαγή
-- δεύτερης ιδιότητας (διάβαζε ημερομηνία γέννησης που εκεί δεν υπάρχει).
create or replace function validate_professional_fields()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT' or new.price_per_day is distinct from old.price_per_day)
     and new.price_per_day > 5000 then
    raise exception 'price_too_high';
  end if;
  if (tg_op = 'INSERT' or new.years_experience is distinct from old.years_experience)
     and (new.years_experience < 0 or new.years_experience > 70) then
    raise exception 'invalid_years_experience';
  end if;
  -- Μόνο το skipper_profiles έχει ημερομηνία γέννησης· ξεχωριστό if, γιατί το
  -- plpgsql διαβάζει όλη την έκφραση και θα έσπαγε στις δεύτερες ιδιότητες.
  if tg_table_name = 'skipper_profiles' then
    if (tg_op = 'INSERT' or new.date_of_birth is distinct from old.date_of_birth)
       and new.date_of_birth is not null
       and (new.date_of_birth > (current_date - interval '18 years')::date
            or new.date_of_birth < (current_date - interval '100 years')::date) then
      raise exception 'invalid_date_of_birth';
    end if;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid, p_reason text)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking bookings%rowtype;
  v_uid uuid := auth.uid();
  v_is_client boolean;
  v_lead int;
  v_weight numeric;
  v_skipper_user_id uuid;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_booking.status <> 'confirmed' then raise exception 'not_cancellable'; end if;
  -- Από την ημέρα έναρξης η υπόθεση θεωρείται κλεισμένη (0107).
  if v_booking.start_date <= current_date then raise exception 'trip_started'; end if;

  if v_uid = v_booking.client_id then
    v_is_client := true;
  elsif exists (select 1 from skipper_profiles where id = v_booking.skipper_id and user_id = v_uid) then
    v_is_client := false;
  else
    raise exception 'not_participant';
  end if;

  if not v_is_client and btrim(coalesce(p_reason, '')) = '' then
    raise exception 'reason_required';
  end if;

  v_lead := cancellation_lead_days_for(now(), v_booking.start_date);
  v_weight := cancellation_weight_for(now(), v_booking.start_date);

  select user_id into v_skipper_user_id from skipper_profiles where id = v_booking.skipper_id;
  perform set_config('platform.trusted', 'true', true);

  if v_is_client then
    update bookings set status = 'cancelled_by_client', cancelled_at = now(), cancellation_reason = p_reason,
                        cancellation_lead_days = v_lead, cancellation_weight = v_weight
      where id = p_booking_id;
    if coalesce(v_booking.skipper_claim_fee_amount, 0) > 0 then
      update users set wallet_balance = wallet_balance + v_booking.skipper_claim_fee_amount
        where id = v_skipper_user_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_id)
        values (v_skipper_user_id, 'refund_credit', v_booking.skipper_claim_fee_amount, p_booking_id);
    end if;
    insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
      values (p_booking_id, v_uid, 'client', p_reason);
  else
    update bookings set status = 'cancelled_by_skipper', cancelled_at = now(), cancellation_reason = p_reason,
                        cancellation_lead_days = v_lead, cancellation_weight = v_weight
      where id = p_booking_id;
    insert into cancellation_reports (booking_id, reported_by, at_fault_party, reason)
      values (p_booking_id, v_uid, 'skipper', p_reason);
  end if;

  select * into v_booking from bookings where id = p_booking_id;
  return v_booking;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_delivery_booking(p_delivery_booking_id uuid, p_reason text)
 RETURNS delivery_bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_b delivery_bookings%rowtype;
  v_uid uuid := auth.uid();
  v_is_client boolean;
  v_pro_user uuid;
  v_client_fee numeric;
begin
  select * into v_b from delivery_bookings where id = p_delivery_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_b.status <> 'confirmed' then raise exception 'not_cancellable'; end if;
  if v_b.departure_date <= current_date then raise exception 'trip_started'; end if;

  select user_id into v_pro_user from skipper_profiles where id = v_b.skipper_id;
  if v_uid = v_b.client_id then
    v_is_client := true;
  elsif v_uid = v_pro_user then
    v_is_client := false;
  else
    raise exception 'not_participant';
  end if;

  perform set_config('platform.trusted', 'true', true);
  update delivery_bookings
    set status = 'cancelled', cancelled_at = now(),
        cancelled_by = case when v_is_client then 'client' else 'professional' end,
        cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = p_delivery_booking_id;

  if v_is_client then
    if v_b.professional_fee_amount > 0 then
      update users set wallet_balance = wallet_balance + v_b.professional_fee_amount where id = v_pro_user;
      insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id, related_delivery_booking_id)
        values (v_pro_user, 'refund_credit', v_b.professional_fee_amount, v_b.delivery_role_request_id, v_b.id);
    end if;
    perform notify_user(
      v_pro_user, 'delivery_cancelled',
      jsonb_build_object('origin', v_b.origin_point, 'destination', v_b.destination_point,
                         'role', v_b.crew_role, 'by', 'client', 'refund', v_b.professional_fee_amount),
      '/platform/bookings'
    );
  else
    select client_fee into v_client_fee from delivery_role_requests where id = v_b.delivery_role_request_id;
    if coalesce(v_client_fee, 0) > 0 then
      update users set wallet_balance = wallet_balance + v_client_fee where id = v_b.client_id;
      insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id, related_delivery_booking_id)
        values (v_b.client_id, 'refund_credit', v_client_fee, v_b.delivery_role_request_id, v_b.id);
    end if;
    perform notify_user(
      v_b.client_id, 'delivery_cancelled',
      jsonb_build_object('origin', v_b.origin_point, 'destination', v_b.destination_point,
                         'role', v_b.crew_role, 'by', 'professional', 'refund', coalesce(v_client_fee, 0)),
      '/platform/delivery/requests'
    );
    perform notify_admins(
      'admin_delivery_cancelled',
      jsonb_build_object('origin', v_b.origin_point, 'destination', v_b.destination_point, 'role', v_b.crew_role),
      '/platform/admin/deliveries'
    );
  end if;

  select * into v_b from delivery_bookings where id = p_delivery_booking_id;
  return v_b;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_suspend_account(p_user_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row users%rowtype;
  v_skipper_id uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  select * into v_row from users where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.role = 'admin' or v_row.is_staff_admin then raise exception 'cannot_suspend_admin'; end if;
  if v_row.status = 'deleted' then raise exception 'already_deleted'; end if;
  if v_row.status = 'suspended' then raise exception 'already_suspended'; end if;

  perform set_config('platform.trusted', 'true', true);

  update users set status = 'suspended', suspension_reason = btrim(p_reason) where id = p_user_id;
  -- Οι μελλοντικές κρατήσεις του γίνονται υποθέσεις αντικατάστασης (0107).
  perform release_professional_bookings(p_user_id, 'Ο λογαριασμός του επαγγελματία ανεστάλη');

  select id into v_skipper_id from skipper_profiles where user_id = p_user_id;
  if v_skipper_id is not null then
    update skipper_profiles set deleted_at = now() where id = v_skipper_id and deleted_at is null;
  end if;

  -- Ξαναχρησιμοποιεί το ήδη υπάρχον 'ban_account' (ίδιο action_type με τη
  -- διαγραφή) αντί να προσθέσει νέα τιμή enum — προσθήκη νέας τιμής σε
  -- admin_action_type δεν θα μπορούσε να χρησιμοποιηθεί μέσα στο ίδιο
  -- migration/transaction (βλ. σημείωση στο 0011 για το ίδιο ζήτημα με το
  -- user_status). Το notes κείμενο κάνει ξεκάθαρη τη διάκριση.
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'ban_account', p_user_id, 'Αναστολή: ' || btrim(p_reason));
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_account(p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row users%rowtype;
  v_skipper_id uuid;
  v_req record;
  v_rr record;
  v_cancelled int := 0;
  v_refunded numeric := 0;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select * into v_row from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status = 'deleted' then raise exception 'already_deleted'; end if;
  if v_row.role = 'admin' then raise exception 'cannot_delete_admin'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_delete_self'; end if;
  if not can_manage_account(p_user_id) then raise exception 'cannot_edit_admin'; end if;

  perform set_config('platform.trusted', 'true', true);

  -- Ανοιχτά αιτήματα πληρώματος του χρήστη → ακύρωση + επιστροφή τέλους.
  for v_req in
    select id, fee_paid_at, fee_amount from booking_requests
    where client_id = p_user_id and status = 'open' for update
  loop
    update booking_requests set status = 'cancelled' where id = v_req.id;
    delete from booking_request_pings where booking_request_id = v_req.id and status = 'pending';
    if v_req.fee_paid_at is not null and v_req.fee_amount > 0 then
      update users set wallet_balance = wallet_balance + v_req.fee_amount where id = p_user_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
        values (p_user_id, 'refund_credit', v_req.fee_amount, v_req.id);
      v_refunded := v_refunded + v_req.fee_amount;
    end if;
    v_cancelled := v_cancelled + 1;
  end loop;

  -- Ανοιχτές θέσεις σε αιτήματα μεταφοράς του χρήστη → ακύρωση + επιστροφή.
  for v_rr in
    select rr.id, rr.fee_paid_at, rr.client_fee
    from delivery_role_requests rr join delivery_requests dr on dr.id = rr.delivery_request_id
    where dr.client_id = p_user_id and rr.status = 'open' for update of rr
  loop
    update delivery_role_requests set status = 'cancelled' where id = v_rr.id;
    delete from delivery_role_pings where delivery_role_request_id = v_rr.id and status = 'pending';
    if v_rr.fee_paid_at is not null and v_rr.client_fee > 0 then
      update users set wallet_balance = wallet_balance + v_rr.client_fee where id = p_user_id;
      insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id)
        values (p_user_id, 'refund_credit', v_rr.client_fee, v_rr.id);
      v_refunded := v_refunded + v_rr.client_fee;
    end if;
    v_cancelled := v_cancelled + 1;
  end loop;

  -- Επαγγελματίας: κρύβεται από αναζητήσεις, και φεύγει από όσα αιτήματα
  -- δεν έχει απαντήσει ακόμα.
  select id into v_skipper_id from skipper_profiles where user_id = p_user_id;
  if v_skipper_id is not null then
    perform release_professional_bookings(p_user_id, 'Ο λογαριασμός του επαγγελματία διαγράφηκε');
    delete from booking_request_pings where skipper_id = v_skipper_id and status = 'pending';
    delete from delivery_role_pings where skipper_id = v_skipper_id and status = 'pending';
    update skipper_profiles set deleted_at = now() where id = v_skipper_id and deleted_at is null;
    update skipper_secondary_roles set deleted_at = now() where skipper_id = v_skipper_id and deleted_at is null;
  end if;

  -- Τα δικαιώματα διαχειριστή δεν επιστρέφουν αυτόματα με μια επαναφορά.
  update users
    set status = 'deleted',
        deletion_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        is_staff_admin = false
    where id = p_user_id;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'ban_account', p_user_id,
      'Διαγραφή από admin' || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '') || '.');

  return jsonb_build_object('cancelled_requests', v_cancelled, 'refunded', v_refunded);
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_skipper_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.approval_status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
    new.tier := 'medium';
    new.rating_avg := null;
    new.rating_count := 0;
    new.rating_avg_safety := null; new.rating_avg_seamanship := null;
    new.rating_avg_professionalism := null; new.rating_avg_cleanliness := null;
    new.rating_avg_communication := null; new.rating_avg_hospitality := null;
    new.rating_avg_cooking := null; new.rating_avg_service := null;
    new.rating_avg_taste := null; new.rating_avg_variety := null;
    new.rating_avg_presentation := null; new.rating_avg_adaptability := null;
    new.rating_avg_organization := null; new.rating_avg_maintenance := null;
    new.rating_avg_teamwork := null; new.rating_avg_diligence := null;
    new.completed_bookings_count := 0;
    new.cancellation_flag_count := 0;
    new.deleted_at := null;
    return new;
  end if;
  new.role := old.role;
  new.approval_status := old.approval_status;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.tier := old.tier;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.rating_avg_safety := old.rating_avg_safety;
  new.rating_avg_seamanship := old.rating_avg_seamanship;
  new.rating_avg_professionalism := old.rating_avg_professionalism;
  new.rating_avg_cleanliness := old.rating_avg_cleanliness;
  new.rating_avg_communication := old.rating_avg_communication;
  new.rating_avg_hospitality := old.rating_avg_hospitality;
  new.rating_avg_cooking := old.rating_avg_cooking;
  new.rating_avg_service := old.rating_avg_service;
  new.rating_avg_taste := old.rating_avg_taste;
  new.rating_avg_variety := old.rating_avg_variety;
  new.rating_avg_presentation := old.rating_avg_presentation;
  new.rating_avg_adaptability := old.rating_avg_adaptability;
  new.rating_avg_organization := old.rating_avg_organization;
  new.rating_avg_maintenance := old.rating_avg_maintenance;
  new.rating_avg_teamwork := old.rating_avg_teamwork;
  new.rating_avg_diligence := old.rating_avg_diligence;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  new.user_id := old.user_id;
  new.deleted_at := old.deleted_at;
  -- Εγκεκριμένος επαγγελματίας που αλλάζει δίπλωμα ή όνομα ξαναπερνά από
  -- έλεγχο (0107).
  if old.approval_status = 'approved'
     and (new.license_number is distinct from old.license_number
          or new.license_type is distinct from old.license_type
          or btrim(coalesce(new.full_name, '')) is distinct from btrim(coalesce(old.full_name, ''))) then
    new.approval_status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
    perform notify_user(new.user_id, 'profile_rereview', jsonb_build_object('role', new.role), '/platform/profile');
    -- (το trigger ειδοποίησης κοιτά μόνο αλλαγές που έστειλε ο ίδιος ο χρήστης)
    perform notify_admins('admin_pro_pending', jsonb_build_object('name', new.full_name, 'role', new.role),
                          '/platform/admin/approvals');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_secondary_role()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_primary_role crew_role;
  v_trusted boolean := coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin();
begin
  if TG_OP = 'INSERT' then
    select role into v_primary_role from skipper_profiles where id = new.skipper_id;
    if v_primary_role is not null and v_primary_role = new.role then
      raise exception 'role_already_primary';
    end if;
    if not v_trusted then
      new.approval_status := 'pending';
      new.approved_by := null;
      new.approved_at := null;
      new.rating_avg := null;
      new.rating_count := 0;
    end if;
    return new;
  end if;

  if v_trusted then
    return new;
  end if;
  new.skipper_id := old.skipper_id;
  new.role := old.role;
  new.approval_status := old.approval_status;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.deleted_at := old.deleted_at;
  new.rating_avg_safety := old.rating_avg_safety; new.rating_avg_seamanship := old.rating_avg_seamanship;
  new.rating_avg_professionalism := old.rating_avg_professionalism; new.rating_avg_cleanliness := old.rating_avg_cleanliness;
  new.rating_avg_communication := old.rating_avg_communication; new.rating_avg_hospitality := old.rating_avg_hospitality;
  new.rating_avg_cooking := old.rating_avg_cooking; new.rating_avg_service := old.rating_avg_service;
  new.rating_avg_taste := old.rating_avg_taste; new.rating_avg_variety := old.rating_avg_variety;
  new.rating_avg_presentation := old.rating_avg_presentation; new.rating_avg_adaptability := old.rating_avg_adaptability;
  new.rating_avg_organization := old.rating_avg_organization; new.rating_avg_maintenance := old.rating_avg_maintenance;
  new.rating_avg_teamwork := old.rating_avg_teamwork; new.rating_avg_diligence := old.rating_avg_diligence;
  if old.approval_status = 'approved'
     and (new.license_number is distinct from old.license_number
          or new.license_type is distinct from old.license_type) then
    new.approval_status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
    perform notify_user((select user_id from skipper_profiles where id = new.skipper_id), 'profile_rereview',
                        jsonb_build_object('role', new.role), '/platform/profile');
    perform notify_admins('admin_role_pending',
                          jsonb_build_object('name', (select full_name from skipper_profiles where id = new.skipper_id), 'role', new.role),
                          '/platform/admin/approvals');
  end if;
  return new;
end;
$function$;
