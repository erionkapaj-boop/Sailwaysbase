-- ============================================================================
-- Η καρτέλα κάθε λογαριασμού, ξαναφτιαγμένη σαν πλήρες Admin Dashboard για
-- ΑΥΤΟΝ τον λογαριασμό: μία κλήση φέρνει ό,τι χρειάζεται η σελίδα (προφίλ,
-- επικοινωνία, κατάσταση, κρατήσεις, αιτήματα, μεταφορές, πορτοφόλι,
-- εκκρεμότητες, αναφορές) και ένα ενιαίο χρονολογικό ιστορικό ενεργειών.
--
--   1. admin_actions.action_type: enum -> text. Το action_type ήταν ήδη
--      πρακτικά ανεπαρκές (μόνο 6 τιμές: approve_skipper, reject_skipper,
--      resolve_dispute, ban_account, edit_booking, confirm_wallet_topup) και
--      κάθε νέο είδος ενέργειας από το 0065 και μετά ξαναχρησιμοποιούσε μία
--      από αυτές με το πραγματικό νόημα μόνο στο notes (βλ. σχόλιο στο
--      0078 — προσθήκη τιμής σε enum δεν μπορεί να χρησιμοποιηθεί στο ίδιο
--      migration που την προσθέτει). Το text αφαιρεί οριστικά αυτόν τον
--      περιορισμό, χωρίς να αλλάζει καμία υπάρχουσα γραμμή.
--   2. admin_actions.notes γίνεται NOT NULL-friendly (default ''): μερικές
--      καταχωρήσεις παρακάτω δεν έχουν πάντα κείμενο.
--   3. admin_verify_user, admin_credit_wallet, admin_set_staff_admin,
--      admin_set_test_account: τώρα καταγράφουν στο admin_actions (πριν δεν
--      άφηναν κανένα ίχνος — «Επαλήθευση» και τα δύο toggle ήταν αόρατα σε
--      οποιοδήποτε ιστορικό). Το p_notes του admin_credit_wallet επίσης
--      αποθηκεύεται πλέον κάπου αντί να πετιέται σιωπηλά.
--   4. admin_update_profile(): διόρθωση βασικών στοιχείων από τον admin
--      (όνομα, email, και για επαγγελματίες τιμή/δίπλωμα/εμπειρία) όταν κάτι
--      έχει γραφτεί λάθος — η ίδια αυτοεξυπηρέτηση που έχει ο χρήστης, αλλά
--      προσβάσιμη και από τον admin. Το τηλέφωνο ΔΕΝ αλλάζει εδώ (χρειάζεται
--      να συγχρονιστεί και το Supabase Auth identity — γίνεται στο δικό του
--      API route, edit-contact, με service role).
--   5. admin_account_detail(): ένα jsonb με ΟΛΟΚΛΗΡΗ την εικόνα ενός
--      λογαριασμού — προφίλ, επικοινωνία, ρόλος-συγκεκριμένα στοιχεία,
--      αιτήματα/κρατήσεις πληρώματος, αιτήματα/κρατήσεις μεταφοράς,
--      πορτοφόλι, εκκρεμότητες (admin_flags, ανοιχτές αναφορές), και ένα
--      ενιαίο χρονολογικό «timeline» φτιαγμένο από κάθε πίνακα που αφορά
--      αυτόν τον λογαριασμό. Η ετικέτα κάθε γεγονότος γράφεται στο client
--      (lib/platform/adminAudit.js), όχι εδώ — ίδιο μοτίβο με το
--      describeNotification: η συνάρτηση φέρνει (kind, at, data ακατέργαστο),
--      το UI αποφασίζει πώς διαβάζεται.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1-2. admin_actions: enum -> text.
-- ----------------------------------------------------------------------------
alter table admin_actions alter column action_type type text using action_type::text;
alter table admin_actions alter column notes set default '';
update admin_actions set notes = '' where notes is null;
alter table admin_actions alter column notes set not null;
drop type if exists admin_action_type;

-- ----------------------------------------------------------------------------
-- 3a. admin_verify_user: καταγράφει την επαλήθευση.
-- ----------------------------------------------------------------------------
create or replace function admin_verify_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update users set phone_verified_at = now() where id = p_user_id and phone_verified_at is null;
  get diagnostics v_count = row_count;
  if v_count = 1 then
    perform notify_user(p_user_id, 'account_verified', '{}'::jsonb, '/platform');
    insert into admin_actions (admin_id, action_type, target_user_id, notes)
      values (auth.uid(), 'verify_user', p_user_id, '');
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3b. admin_credit_wallet: το p_notes πλέον αποθηκεύεται.
-- ----------------------------------------------------------------------------
create or replace function admin_credit_wallet(p_user_id uuid, p_amount numeric, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from users where id = p_user_id) then raise exception 'invalid_role'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_amount where id = p_user_id;
  insert into wallet_transactions (user_id, type, amount) values (p_user_id, 'deposit', p_amount);
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'credit_wallet', p_user_id, coalesce(nullif(btrim(p_notes), ''), '') || ' (+' || p_amount || '€)');
end;
$$;

-- ----------------------------------------------------------------------------
-- 3c. admin_set_staff_admin / admin_set_test_account: καταγράφονται.
-- ----------------------------------------------------------------------------
create or replace function admin_set_staff_admin(p_user_id uuid, p_flag boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_was_admin boolean; v_other_admins int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select (role = 'admin' or is_staff_admin) into v_was_admin from users where id = p_user_id;
  if v_was_admin is null then raise exception 'user_not_found'; end if;

  if not p_flag and v_was_admin then
    select count(*) into v_other_admins
      from users where id <> p_user_id and (role = 'admin' or is_staff_admin);
    if v_other_admins = 0 then raise exception 'cannot_remove_last_admin'; end if;
  end if;

  perform set_config('platform.trusted', 'true', true);
  update users set is_staff_admin = p_flag where id = p_user_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), case when p_flag then 'staff_admin_grant' else 'staff_admin_revoke' end, p_user_id, '');
end;
$$;

create or replace function admin_set_test_account(p_user_id uuid, p_is_test boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set is_test_account = p_is_test where id = p_user_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), case when p_is_test then 'test_account_on' else 'test_account_off' end, p_user_id, '');
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. admin_update_profile: διόρθωση βασικών στοιχείων.
-- ----------------------------------------------------------------------------
create or replace function admin_update_profile(
  p_user_id uuid,
  p_full_name text,
  p_email text default null,
  p_price_per_day numeric default null,
  p_license_number text default null,
  p_license_type text default null,
  p_years_experience int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sp skipper_profiles%rowtype;
  v_old_name text;
  v_old_email text;
  v_found boolean;
  v_changes text[] := '{}';
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if coalesce(btrim(p_full_name), '') = '' then raise exception 'name_required'; end if;

  select true, full_name, email into v_found, v_old_name, v_old_email from users where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;

  perform set_config('platform.trusted', 'true', true);

  if btrim(p_full_name) is distinct from v_old_name then
    v_changes := array_append(v_changes, 'όνομα: «' || coalesce(v_old_name, '—') || '» → «' || btrim(p_full_name) || '»');
  end if;
  if nullif(btrim(coalesce(p_email, '')), '') is distinct from v_old_email then
    v_changes := array_append(v_changes, 'email: «' || coalesce(v_old_email, '—') || '» → «' || coalesce(nullif(btrim(p_email), ''), '—') || '»');
  end if;

  update users set full_name = btrim(p_full_name), email = nullif(btrim(coalesce(p_email, '')), '')
    where id = p_user_id;

  select * into v_sp from skipper_profiles where user_id = p_user_id;
  if found then
    if p_price_per_day is not null and p_price_per_day < 210 then
      raise exception 'price_too_low';
    end if;
    if p_price_per_day is not null and p_price_per_day is distinct from v_sp.price_per_day then
      v_changes := array_append(v_changes, 'τιμή: ' || v_sp.price_per_day || '€ → ' || p_price_per_day || '€');
    end if;
    if nullif(btrim(coalesce(p_license_number, '')), '') is distinct from v_sp.license_number then
      v_changes := array_append(v_changes, 'αριθμός διπλώματος');
    end if;
    if nullif(btrim(coalesce(p_license_type, '')), '') is distinct from v_sp.license_type then
      v_changes := array_append(v_changes, 'τύπος διπλώματος');
    end if;
    if p_years_experience is not null and p_years_experience is distinct from v_sp.years_experience then
      v_changes := array_append(v_changes, 'εμπειρία: ' || v_sp.years_experience || ' → ' || p_years_experience || ' έτη');
    end if;

    update skipper_profiles set
      full_name = btrim(p_full_name),
      price_per_day = coalesce(p_price_per_day, price_per_day),
      license_number = nullif(btrim(coalesce(p_license_number, '')), ''),
      license_type = nullif(btrim(coalesce(p_license_type, '')), ''),
      years_experience = coalesce(p_years_experience, years_experience)
      where id = v_sp.id;
  end if;

  if array_length(v_changes, 1) > 0 then
    insert into admin_actions (admin_id, action_type, target_user_id, notes)
      values (auth.uid(), 'edit_profile', p_user_id, array_to_string(v_changes, ' · '));
  end if;
end;
$$;
grant execute on function admin_update_profile(uuid, text, text, numeric, text, text, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. admin_account_detail: όλη η εικόνα ενός λογαριασμού σε μία κλήση.
-- ----------------------------------------------------------------------------
create or replace function admin_account_detail(p_user_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with u as (
    select * from users where id = p_user_id
  ),
  sp as (
    select * from skipper_profiles where user_id = p_user_id
  ),
  cp as (
    select * from client_profiles where user_id = p_user_id
  ),
  secondary_roles as (
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'role', s.role, 'approval_status', s.approval_status,
      'price_per_day', s.price_per_day, 'license_number', s.license_number,
      'license_type', s.license_type, 'years_experience', s.years_experience,
      'rating_avg', s.rating_avg, 'rating_count', s.rating_count,
      'created_at', s.created_at, 'deleted_at', s.deleted_at
    ) order by s.created_at) as v
    from skipper_secondary_roles s where s.skipper_id = (select id from sp)
  ),
  languages as (
    select jsonb_agg(l.name order by l.name) as v
    from user_languages ul join languages l on l.id = ul.language_id
    where ul.user_id = p_user_id
  ),
  boat_types as (
    select jsonb_agg(b.name order by b.name) as v
    from skipper_boat_types sbt join boat_types b on b.id = sbt.boat_type_id
    where sbt.skipper_id = (select id from sp)
  ),
  availability as (
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'start_date', w.start_date, 'end_date', w.end_date, 'crew_role', w.crew_role,
      'regions', (select jsonb_agg(r.name order by r.name) from availability_window_regions awr
                  join regions r on r.id = awr.region_id where awr.window_id = w.id)
    ) order by w.start_date) as v
    from availability_windows w where w.skipper_id = (select id from sp)
  ),
  requests as (
    select jsonb_agg(jsonb_build_object(
      'id', br.id, 'status', br.status, 'start_date', br.start_date, 'end_date', br.end_date,
      'crew_role', coalesce(br.crew_role, 'skipper'), 'place', booking_place(br.departure_point, br.port_id, br.region_id),
      'fee_amount', br.fee_amount, 'fee_paid_at', br.fee_paid_at, 'expires_at', br.expires_at,
      'origin', br.origin, 'created_at', br.created_at
    ) order by br.created_at desc) as v
    from booking_requests br where br.client_id = p_user_id
  ),
  pings as (
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'status', p.status, 'sent_at', p.sent_at,
      'request', jsonb_build_object(
        'id', br.id, 'status', br.status, 'start_date', br.start_date, 'end_date', br.end_date,
        'crew_role', coalesce(br.crew_role, 'skipper'),
        'place', booking_place(br.departure_point, br.port_id, br.region_id)
      )
    ) order by p.sent_at desc) as v
    from booking_request_pings p join booking_requests br on br.id = p.booking_request_id
    where p.skipper_id = (select id from sp)
  ),
  bookings_client as (
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'status', b.status, 'start_date', b.start_date, 'end_date', b.end_date,
      'crew_role', coalesce(b.crew_role, 'skipper'), 'place', booking_place(b.departure_point, b.port_id, b.region_id),
      'pro_id', sp2.user_id, 'pro_name', coalesce(nullif(btrim(sp2.full_name), ''), pu.full_name),
      'confirmed_at', b.confirmed_at, 'cancelled_at', b.cancelled_at
    ) order by b.created_at desc) as v
    from bookings b
    join skipper_profiles sp2 on sp2.id = b.skipper_id
    join users pu on pu.id = sp2.user_id
    where b.client_id = p_user_id
  ),
  bookings_pro as (
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'status', b.status, 'start_date', b.start_date, 'end_date', b.end_date,
      'crew_role', coalesce(b.crew_role, 'skipper'), 'place', booking_place(b.departure_point, b.port_id, b.region_id),
      'client_id', b.client_id, 'client_name', cu.full_name,
      'confirmed_at', b.confirmed_at, 'cancelled_at', b.cancelled_at
    ) order by b.created_at desc) as v
    from bookings b join users cu on cu.id = b.client_id
    where b.skipper_id = (select id from sp)
  ),
  delivery_requests_out as (
    select jsonb_agg(jsonb_build_object(
      'id', dr.id, 'origin_point', dr.origin_point, 'destination_point', dr.destination_point,
      'distance_miles', dr.distance_miles, 'departure_date', dr.departure_date, 'created_at', dr.created_at,
      'roles', (select jsonb_agg(jsonb_build_object(
                  'id', rr.id, 'crew_role', rr.crew_role, 'status', rr.status,
                  'offered_price', rr.offered_price, 'client_fee', rr.client_fee, 'expires_at', rr.expires_at
                ) order by rr.created_at) from delivery_role_requests rr where rr.delivery_request_id = dr.id)
    ) order by dr.created_at desc) as v
    from delivery_requests dr where dr.client_id = p_user_id
  ),
  delivery_pings as (
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'status', p.status, 'sent_at', p.sent_at,
      'role', rr.crew_role, 'offered_price', rr.offered_price,
      'origin_point', dr.origin_point, 'destination_point', dr.destination_point
    ) order by p.sent_at desc) as v
    from delivery_role_pings p
    join delivery_role_requests rr on rr.id = p.delivery_role_request_id
    join delivery_requests dr on dr.id = rr.delivery_request_id
    where p.skipper_id = (select id from sp)
  ),
  delivery_bookings_client as (
    select jsonb_agg(jsonb_build_object(
      'id', db.id, 'status', db.status, 'crew_role', db.crew_role, 'departure_date', db.departure_date,
      'origin_point', db.origin_point, 'destination_point', db.destination_point, 'offered_price', db.offered_price,
      'pro_id', sp3.user_id, 'pro_name', coalesce(nullif(btrim(sp3.full_name), ''), pu3.full_name),
      'cancelled_at', db.cancelled_at, 'cancelled_by', db.cancelled_by, 'created_at', db.created_at
    ) order by db.created_at desc) as v
    from delivery_bookings db
    join skipper_profiles sp3 on sp3.id = db.skipper_id
    join users pu3 on pu3.id = sp3.user_id
    where db.client_id = p_user_id
  ),
  delivery_bookings_pro as (
    select jsonb_agg(jsonb_build_object(
      'id', db.id, 'status', db.status, 'crew_role', db.crew_role, 'departure_date', db.departure_date,
      'origin_point', db.origin_point, 'destination_point', db.destination_point, 'professional_fee_amount', db.professional_fee_amount,
      'client_id', db.client_id, 'client_name', cu2.full_name,
      'cancelled_at', db.cancelled_at, 'cancelled_by', db.cancelled_by, 'created_at', db.created_at
    ) order by db.created_at desc) as v
    from delivery_bookings db join users cu2 on cu2.id = db.client_id
    where db.skipper_id = (select id from sp)
  ),
  wallet as (
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'type', w.type, 'amount', w.amount, 'created_at', w.created_at
    ) order by w.created_at desc) as v
    from (select * from wallet_transactions where user_id = p_user_id order by created_at desc limit 200) w
  ),
  disputes as (
    select jsonb_agg(jsonb_build_object(
      'id', cr.id, 'booking_id', cr.booking_id, 'at_fault_party', cr.at_fault_party, 'reason', cr.reason,
      'created_at', cr.created_at, 'resolved_at', cr.resolved_at, 'resolution_note', cr.resolution_note,
      'reported_by_self', cr.reported_by = p_user_id,
      'place', booking_place(b.departure_point, b.port_id, b.region_id), 'start_date', b.start_date
    ) order by cr.created_at desc) as v
    from cancellation_reports cr join bookings b on b.id = cr.booking_id
    where cr.reported_by = p_user_id or b.client_id = p_user_id
       or b.skipper_id = (select id from sp)
  ),
  contact_msgs as (
    select jsonb_agg(jsonb_build_object(
      'id', cm.id, 'topic', cm.topic, 'message', cm.message, 'status', cm.status, 'created_at', cm.created_at
    ) order by cm.created_at desc) as v
    from contact_messages cm where cm.user_id = p_user_id
  ),
  flags as (
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'type', f.type, 'detail', f.detail, 'created_at', f.created_at, 'resolved_at', f.resolved_at,
      'related_user_id', f.related_user_id,
      'related_name', ru.full_name
    ) order by f.created_at desc) as v
    from admin_flags f left join users ru on ru.id = f.related_user_id
    where f.user_id = p_user_id or f.related_user_id = p_user_id
  ),
  logins as (
    select jsonb_agg(jsonb_build_object(
      'success', la.success, 'created_at', la.created_at
    ) order by la.created_at desc) as v
    from (select * from login_attempts where phone = (select phone_number from u) order by created_at desc limit 100) la
  ),
  reset_codes as (
    select jsonb_agg(jsonb_build_object(
      'created_at', e.created_at, 'used_at', e.used_at, 'expires_at', e.expires_at
    ) order by e.created_at desc) as v
    from email_reset_codes e where e.user_id = p_user_id
  ),
  actions as (
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'action_type', a.action_type, 'notes', a.notes, 'created_at', a.created_at,
      'actor_id', a.admin_id, 'actor_name', coalesce(nullif(btrim(au.full_name), ''), au.phone_number),
      'self', a.admin_id = p_user_id
    ) order by a.created_at desc) as v
    from (select * from admin_actions where target_user_id = p_user_id order by created_at desc limit 300) a
    join users au on au.id = a.admin_id
  ),
  -- Ενιαίο χρονολογικό ιστορικό — κάθε κλάδος ένα είδος γεγονότος, ίδιο
  -- (kind, at, data) σχήμα με describeNotification. Χωρίς ετικέτες εδώ: το
  -- κείμενο αποφασίζεται στο client (adminAudit.js), για να αλλάζει χωρίς
  -- migration.
  timeline_rows as (
    select 'account_created' as kind, u.created_at as at,
           jsonb_build_object('role', u.role) as data
    from u
    union all
    select case when la.success then 'login_success' else 'login_failed' end, la.created_at, '{}'::jsonb
    from login_attempts la where la.phone = (select phone_number from u)
    union all
    select 'request_sent', br.created_at,
           jsonb_build_object('role', coalesce(br.crew_role, 'skipper'), 'place', booking_place(br.departure_point, br.port_id, br.region_id),
                              'start_date', br.start_date, 'end_date', br.end_date, 'status', br.status, 'fee_amount', br.fee_amount)
    from booking_requests br where br.client_id = p_user_id
    union all
    select 'booking_confirmed', b.confirmed_at,
           jsonb_build_object('side', case when b.client_id = p_user_id then 'client' else 'pro' end,
                              'place', booking_place(b.departure_point, b.port_id, b.region_id),
                              'start_date', b.start_date, 'end_date', b.end_date, 'role', coalesce(b.crew_role, 'skipper'),
                              'counterpart', case when b.client_id = p_user_id
                                then coalesce(nullif(btrim(sp4.full_name), ''), pu4.full_name) else cu3.full_name end)
    from bookings b
    join users cu3 on cu3.id = b.client_id
    join skipper_profiles sp4 on sp4.id = b.skipper_id
    join users pu4 on pu4.id = sp4.user_id
    where (b.client_id = p_user_id or b.skipper_id = (select id from sp)) and b.confirmed_at is not null
    union all
    select 'booking_cancelled', b.cancelled_at,
           jsonb_build_object('side', case when b.client_id = p_user_id then 'client' else 'pro' end,
                              'place', booking_place(b.departure_point, b.port_id, b.region_id),
                              'reason', b.cancellation_reason, 'status', b.status)
    from bookings b
    where (b.client_id = p_user_id or b.skipper_id = (select id from sp)) and b.cancelled_at is not null
    union all
    select 'delivery_request_sent', dr.created_at,
           jsonb_build_object('origin_point', dr.origin_point, 'destination_point', dr.destination_point, 'distance_miles', dr.distance_miles)
    from delivery_requests dr where dr.client_id = p_user_id
    union all
    select 'delivery_confirmed', db.created_at,
           jsonb_build_object('side', case when db.client_id = p_user_id then 'client' else 'pro' end,
                              'origin_point', db.origin_point, 'destination_point', db.destination_point, 'role', db.crew_role)
    from delivery_bookings db where db.client_id = p_user_id or db.skipper_id = (select id from sp)
    union all
    select 'delivery_cancelled', db.cancelled_at,
           jsonb_build_object('side', case when db.client_id = p_user_id then 'client' else 'pro' end,
                              'origin_point', db.origin_point, 'destination_point', db.destination_point,
                              'by', db.cancelled_by, 'reason', db.cancellation_reason)
    from delivery_bookings db
    where (db.client_id = p_user_id or db.skipper_id = (select id from sp)) and db.cancelled_at is not null
    union all
    select 'wallet_txn', w.created_at, jsonb_build_object('type', w.type, 'amount', w.amount)
    from wallet_transactions w where w.user_id = p_user_id
    union all
    select 'dispute_reported', cr.created_at,
           jsonb_build_object('self', cr.reported_by = p_user_id, 'reason', cr.reason,
                              'place', booking_place(b.departure_point, b.port_id, b.region_id))
    from cancellation_reports cr join bookings b on b.id = cr.booking_id
    where cr.reported_by = p_user_id or b.client_id = p_user_id or b.skipper_id = (select id from sp)
    union all
    select 'contact_message', cm.created_at, jsonb_build_object('topic', cm.topic, 'status', cm.status)
    from contact_messages cm where cm.user_id = p_user_id
    union all
    select 'email_reset_requested', e.created_at, jsonb_build_object('used', e.used_at is not null)
    from email_reset_codes e where e.user_id = p_user_id
    union all
    select 'admin_flag', f.created_at, jsonb_build_object('type', f.type, 'resolved', f.resolved_at is not null)
    from admin_flags f where f.user_id = p_user_id or f.related_user_id = p_user_id
    union all
    select 'secondary_role_requested', s.created_at, jsonb_build_object('role', s.role)
    from skipper_secondary_roles s where s.skipper_id = (select id from sp)
    union all
    select 'admin_action', a.created_at,
           jsonb_build_object('action_type', a.action_type, 'notes', a.notes,
                              'actor_name', coalesce(nullif(btrim(au.full_name), ''), au.phone_number),
                              'self', a.admin_id = p_user_id)
    from admin_actions a join users au on au.id = a.admin_id
    where a.target_user_id = p_user_id
  ),
  timeline as (
    select jsonb_agg(jsonb_build_object('kind', kind, 'at', at, 'data', data) order by at desc) as v
    from timeline_rows where at is not null
  )
  select jsonb_build_object(
    'user', (select to_jsonb(u) from u),
    'client_profile', (select to_jsonb(cp) from cp),
    'skipper_profile', (select to_jsonb(sp) from sp),
    'secondary_roles', coalesce((select v from secondary_roles), '[]'::jsonb),
    'languages', coalesce((select v from languages), '[]'::jsonb),
    'boat_types', coalesce((select v from boat_types), '[]'::jsonb),
    'availability', coalesce((select v from availability), '[]'::jsonb),
    'requests', coalesce((select v from requests), '[]'::jsonb),
    'pings', coalesce((select v from pings), '[]'::jsonb),
    'bookings_client', coalesce((select v from bookings_client), '[]'::jsonb),
    'bookings_pro', coalesce((select v from bookings_pro), '[]'::jsonb),
    'delivery_requests', coalesce((select v from delivery_requests_out), '[]'::jsonb),
    'delivery_pings', coalesce((select v from delivery_pings), '[]'::jsonb),
    'delivery_bookings_client', coalesce((select v from delivery_bookings_client), '[]'::jsonb),
    'delivery_bookings_pro', coalesce((select v from delivery_bookings_pro), '[]'::jsonb),
    'wallet', coalesce((select v from wallet), '[]'::jsonb),
    'disputes', coalesce((select v from disputes), '[]'::jsonb),
    'contact_messages', coalesce((select v from contact_msgs), '[]'::jsonb),
    'flags', coalesce((select v from flags), '[]'::jsonb),
    'logins', coalesce((select v from logins), '[]'::jsonb),
    'reset_codes', coalesce((select v from reset_codes), '[]'::jsonb),
    'admin_actions', coalesce((select v from actions), '[]'::jsonb),
    'timeline', coalesce((select v from timeline), '[]'::jsonb)
  )
  from u
  where (select is_admin());
$$;
grant execute on function admin_account_detail(uuid) to authenticated;
