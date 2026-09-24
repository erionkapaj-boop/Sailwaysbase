-- ============================================================================
-- Ακύρωση από επαγγελματία → αντικατάσταση από την πλατφόρμα, όπως τη ζει ο
-- πελάτης, και σύνδεσμοι στην «Πρόσφατη δραστηριότητα» του admin.
--
--   1. Ειδοποιήσεις κράτησης/αιτήματος: ο τόπος έβγαινε μόνο από το λιμάνι,
--      άρα κενός για κάθε κράτηση με περιοχή + σημείο αναχώρησης (όλες μετά
--      το 0049). Τώρα: σημείο αναχώρησης → λιμάνι → περιοχή.
--   2. Ακύρωση από επαγγελματία: η ειδοποίηση του πελάτη ξέρει ποιος ακύρωσε
--      και ότι το τέλος του επιστράφηκε· η ειδοποίηση «χρειάζεται κάλυψη»
--      φτάνει σε όλους τους διαχειριστές (και στους staff admins).
--   3. Νέα κράτηση που αντικαθιστά μια ακυρωμένη: η ειδοποίηση του πελάτη
--      το λέει και φέρνει το όνομα του νέου επαγγελματία.
--   4. admin_recent_activity: + href για κάθε γραμμή, και ονόματα αντί για
--      σκέτο λιμάνι στις κρατήσεις.
-- ============================================================================

create or replace function booking_place(p_departure text, p_port uuid, p_region uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(btrim(p_departure), ''),
    (select name from ports where id = p_port),
    (select name from regions where id = p_region)
  );
$$;

create or replace function notify_request_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_req booking_requests%rowtype; v_fee numeric;
begin
  select user_id into v_uid from skipper_profiles where id = new.skipper_id;
  select * into v_req from booking_requests where id = new.booking_request_id;
  v_fee := coalesce(v_req.claim_fee_amount, (select value from platform_settings where key = 'skipper_claim_fee'));
  perform notify_user(
    v_uid,
    case when v_req.origin = 'client' then 'request_received' else 'offer_received' end,
    jsonb_build_object(
      'port', booking_place(v_req.departure_point, v_req.port_id, v_req.region_id),
      'start', v_req.start_date, 'end', v_req.end_date,
      'origin', v_req.origin, 'fee', v_fee, 'note', v_req.note, 'role', v_req.crew_role
    ),
    '/platform/requests'
  );
  return null;
end;
$$;

create or replace function notify_booking_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_pro_name text; v_payload jsonb;
begin
  select sp.user_id, coalesce(nullif(btrim(sp.full_name), ''), u.full_name)
    into v_skipper_uid, v_pro_name
    from skipper_profiles sp join users u on u.id = sp.user_id
    where sp.id = new.skipper_id;
  v_payload := jsonb_build_object(
    'port', booking_place(new.departure_point, new.port_id, new.region_id),
    'start', new.start_date, 'end', new.end_date, 'role', new.crew_role,
    'replacement', new.replaces_booking_id is not null
  );

  perform notify_user(
    new.client_id, 'booking_confirmed',
    case when new.replaces_booking_id is not null
      then v_payload || jsonb_build_object('pro_name', v_pro_name)
      else v_payload end,
    '/platform/bookings?focus=' || new.id
  );
  perform notify_user(v_skipper_uid, 'booking_confirmed', v_payload, '/platform/bookings?focus=' || new.id);
  return null;
end;
$$;

create or replace function notify_booking_cancelled() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_skipper_uid uuid; v_payload jsonb; v_refund numeric;
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
  else
    -- Ίδιος κανόνας με το cancel_booking (0089): μια αντικατάσταση δεν
    -- ξαναεπιστρέφει το τέλος της αρχικής κράτησης.
    select case when new.replaces_booking_id is null then coalesce(fee_amount, 0) else 0 end
      into v_refund from booking_requests where id = new.booking_request_id;
    perform notify_user(
      new.client_id, 'booking_cancelled',
      v_payload || jsonb_build_object('by', 'professional', 'refund', coalesce(v_refund, 0)),
      '/platform/bookings?focus=' || new.id
    );
    perform notify_admins('coverage_needed', v_payload, '/platform/admin/coverage');
  end if;
  return null;
end;
$$;

drop function if exists admin_recent_activity(int);
create function admin_recent_activity(p_limit int default 20)
returns table(kind text, at timestamptz, label text, detail text, href text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'booking'::text, b.created_at,
           coalesce(cu.full_name, 'Πελάτης') || ' ↔ ' || coalesce(nullif(btrim(sp.full_name), ''), pu.full_name, 'Επαγγελματίας'),
           concat_ws(' · ',
             booking_place(b.departure_point, b.port_id, b.region_id),
             to_char(b.start_date, 'DD/MM'),
             case when b.replaces_booking_id is not null then 'αντικατάσταση' end),
           '/platform/admin/user/' || b.client_id
    from bookings b
    left join users cu on cu.id = b.client_id
    left join skipper_profiles sp on sp.id = b.skipper_id
    left join users pu on pu.id = sp.user_id
    where is_admin()
    union all
    select 'signup', u.created_at, coalesce(u.full_name, u.phone_number),
           case when u.role = 'skipper' then 'επαγγελματίας' else 'πελάτης' end,
           '/platform/admin/user/' || u.id
    from users u where is_admin() and u.role <> 'admin'
    union all
    select 'dispute', cr.created_at, coalesce(ru.full_name, 'Αναφορά ακύρωσης'),
           concat_ws(' · ',
             booking_place(b.departure_point, b.port_id, b.region_id),
             to_char(b.start_date, 'DD/MM')),
           '/platform/admin/disputes'
    from cancellation_reports cr
    left join bookings b on b.id = cr.booking_id
    left join users ru on ru.id = cr.reported_by
    where is_admin()
  ) t(kind, at, label, detail, href)
  order by at desc
  limit p_limit;
$$;
grant execute on function admin_recent_activity(int) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Κάθε ακύρωση γράφει αυτόματα μια αναφορά (cancel_booking). Όταν ακυρώνει
--    ο επαγγελματίας, ο admin ειδοποιείται ήδη με «χρειάζεται κάλυψη» — η
--    δεύτερη ειδοποίηση «νέα αναφορά» για το ίδιο γεγονός ήταν θόρυβος.
-- ----------------------------------------------------------------------------
create or replace function notify_admins_dispute_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_place text; v_start date;
begin
  if new.at_fault_party = 'skipper' then return null; end if;
  select booking_place(b.departure_point, b.port_id, b.region_id), b.start_date
    into v_place, v_start
    from bookings b where b.id = new.booking_id;
  perform notify_admins(
    'admin_dispute_new',
    jsonb_build_object('port', v_place, 'start', v_start),
    '/platform/admin/disputes'
  );
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. admin_coverage_needed: ο τόπος έβγαινε κενός για κρατήσεις με περιοχή +
--    σημείο αναχώρησης, και η ιδιότητα ερχόταν από την κύρια ιδιότητα του
--    επαγγελματία αντί για την κράτηση (λάθος για επιπλέον ιδιότητες).
-- ----------------------------------------------------------------------------
create or replace function admin_coverage_needed()
returns table(
  booking_id uuid,
  client_id uuid,
  client_name text,
  client_phone text,
  port_id uuid,
  port_name text,
  start_date date,
  end_date date,
  crew_role crew_role,
  cancelled_at timestamptz,
  cancellation_reason text,
  offer_request_id uuid,
  offer_pending int
)
language sql stable security definer set search_path = public as $$
  select
    b.id, b.client_id, u.full_name, u.phone_number,
    b.port_id, booking_place(b.departure_point, b.port_id, b.region_id), b.start_date, b.end_date,
    coalesce(b.crew_role, sp.role, 'skipper'::crew_role),
    b.cancelled_at, b.cancellation_reason,
    o.id,
    coalesce((select count(*)::int from booking_request_pings x
              where x.booking_request_id = o.id and x.status = 'pending'), 0)
  from bookings b
  join users u on u.id = b.client_id
  left join skipper_profiles sp on sp.id = b.skipper_id
  left join lateral (
    select br.id from booking_requests br
    where br.replaces_booking_id = b.id and br.status = 'open'
    limit 1
  ) o on true
  where is_admin()
    and b.status = 'cancelled_by_skipper'
    and b.end_date >= current_date
    and not exists (
      select 1 from bookings r
      where r.replaces_booking_id = b.id
        and r.status in ('confirmed', 'completed')
    )
  order by b.start_date;
$$;
grant execute on function admin_coverage_needed() to authenticated;
