-- ============================================================================
-- Διορθώσεις από τον επανέλεγχο της σελίδας λογαριασμού (0091/0092).
--
--   1. admin_update_profile: license_number/license_type είναι NOT NULL (και
--      το πρώτο unique) στο skipper_profiles. Ένα άδειο πεδίο στη φόρμα
--      γινόταν null -> ωμό σφάλμα Postgres. Άδειο πλέον σημαίνει «μένει ως
--      έχει», και διπλό δίπλωμα δίνει καθαρό 'license_taken'.
--   2. admin_account_detail: το ιστορικό έδειχνε ψεύτικες «Συνδέσεις» του
--      χρήστη (βλ. σχόλιο στον κλάδο login) και δεν είχε άνω όριο.
--   3. admin_resolve_flag: οι σημαίες (admin_flags) εμφανίζονται πλέον ως
--      πρόβλημα στη σελίδα, αλλά δεν υπήρχε ΚΑΝΕΝΑΣ τρόπος να κλείσουν —
--      θα έμεναν «ανοιχτές» για πάντα.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. admin_update_profile
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
  v_license text := nullif(btrim(coalesce(p_license_number, '')), '');
  v_license_type text := nullif(btrim(coalesce(p_license_type, '')), '');
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
    if v_license is not null and v_license is distinct from v_sp.license_number
       and exists (select 1 from skipper_profiles where license_number = v_license and id <> v_sp.id) then
      raise exception 'license_taken';
    end if;

    if p_price_per_day is not null and p_price_per_day is distinct from v_sp.price_per_day then
      v_changes := array_append(v_changes, 'τιμή: ' || v_sp.price_per_day || '€ → ' || p_price_per_day || '€');
    end if;
    if v_license is not null and v_license is distinct from v_sp.license_number then
      v_changes := array_append(v_changes, 'αριθμός διπλώματος: «' || v_sp.license_number || '» → «' || v_license || '»');
    end if;
    if v_license_type is not null and v_license_type is distinct from v_sp.license_type then
      v_changes := array_append(v_changes, 'τύπος διπλώματος: «' || v_sp.license_type || '» → «' || v_license_type || '»');
    end if;
    if p_years_experience is not null and p_years_experience is distinct from v_sp.years_experience then
      v_changes := array_append(v_changes, 'εμπειρία: ' || v_sp.years_experience || ' → ' || p_years_experience || ' έτη');
    end if;

    update skipper_profiles set
      full_name = btrim(p_full_name),
      price_per_day = coalesce(p_price_per_day, price_per_day),
      license_number = coalesce(v_license, license_number),
      license_type = coalesce(v_license_type, license_type),
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
-- 2. admin_account_detail (ίδιο με το 0091, εκτός από login κλάδο + όριο)
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
    -- Χωρίς τις «επιτυχημένες συνδέσεις» που δεν έκανε ο ίδιος ο χρήστης: το
    -- reset-pin γράφει μια γραμμή success για να ξεκλειδώσει τον λογαριασμό,
    -- και η «Σύνδεση ως» μπαίνει με το τηλέφωνό του. Και οι δύο φαίνονται ήδη
    -- ως ενέργεια admin — ως «Σύνδεση» του χρήστη θα ήταν ψέμα στο ιστορικό.
    select case when la.success then 'login_success' else 'login_failed' end, la.created_at, '{}'::jsonb
    from login_attempts la
    where la.phone = (select phone_number from u)
      and not (la.success and exists (
        select 1 from admin_actions a
        where a.target_user_id = p_user_id
          and ((a.action_type = 'reset_pin'
                and la.created_at between a.created_at - interval '5 seconds' and a.created_at + interval '1 second')
            or (a.action_type = 'impersonate_start'
                and la.created_at between a.created_at - interval '5 seconds' and a.created_at + interval '60 seconds'))
      ))
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
  -- Όριο στα 500 πιο πρόσφατα: συνδέσεις και κινήσεις πορτοφολιού δεν έχουν
  -- άνω όριο, και ένας παλιός, ενεργός λογαριασμός θα φόρτωνε χιλιάδες γραμμές.
  timeline as (
    select jsonb_agg(jsonb_build_object('kind', kind, 'at', at, 'data', data) order by at desc) as v
    from (select * from timeline_rows where at is not null order by at desc limit 500) t
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

-- ----------------------------------------------------------------------------
-- 3. admin_resolve_flag
-- ----------------------------------------------------------------------------
create or replace function admin_resolve_flag(p_flag_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update admin_flags set resolved_at = now()
    where id = p_flag_id and resolved_at is null
    returning user_id into v_user;
  if v_user is null then raise exception 'flag_not_found'; end if;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'resolve_flag', v_user, '');
end;
$$;
grant execute on function admin_resolve_flag(uuid) to authenticated;
