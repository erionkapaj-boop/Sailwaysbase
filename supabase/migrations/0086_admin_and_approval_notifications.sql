-- ============================================================================
-- «Να μην ξεχνιέται τίποτα»: ειδοποιήσεις στο καμπανάκι για ό,τι περιμένει
-- τον admin, και για τον επαγγελματία όταν κριθεί το προφίλ του.
--
-- Μέχρι τώρα ο admin ειδοποιούνταν μόνο για κράτηση που έμεινε χωρίς
-- επαγγελματία (0024) και για νέο μήνυμα επικοινωνίας (0063). Νέες εγγραφές
-- προς επαλήθευση, επαγγελματίες προς έγκριση και αναφορές ακύρωσης
-- φαίνονταν μόνο αν άνοιγε ο ίδιος τη σωστή σελίδα — μετά από δύο εβδομάδες
-- μακριά, τίποτα δεν τον θύμιζε ότι κάποιος περιμένει.
--
-- Όπως σε όλο το feed (0020): κάθε ειδοποίηση γράφεται από trigger πάνω στο
-- ίδιο το γεγονός, και το ελληνικό κείμενο ζει στο UI (describeNotification).
-- ============================================================================

-- Σε όλους όσους έχουν πρόσβαση στη διαχείριση (κύριος admin + staff admins).
create or replace function notify_admins(p_kind text, p_data jsonb, p_link text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_admin record;
begin
  for v_admin in
    select id from users
    where (role = 'admin' or is_staff_admin) and status not in ('deleted', 'suspended')
  loop
    perform notify_user(v_admin.id, p_kind, p_data, p_link);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Νέος πελάτης περιμένει επαλήθευση (εγγραφή χωρίς SMS, 0075).
--    Μόνο για πελάτες: ο επαγγελματίας φέρνει τη δική του ειδοποίηση (2)
--    μόλις δημιουργηθεί το προφίλ του — μία ειδοποίηση ανά άτομο, όχι δύο.
--    Πιάνει και την επανεγγραφή διαγραμμένου λογαριασμού (update, 0074).
-- ----------------------------------------------------------------------------
create or replace function notify_admins_signup_pending() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_verified_at is not null or new.role <> 'client' or new.status = 'deleted' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.phone_verified_at is null and old.status <> 'deleted' then
    return null; -- ήταν ήδη σε αναμονή, έχει ήδη ειδοποιηθεί
  end if;
  perform notify_admins(
    'admin_signup_pending',
    jsonb_build_object('name', new.full_name),
    '/platform/admin/approvals'
  );
  return null;
end;
$$;
drop trigger if exists trg_notify_admins_signup_pending on users;
create trigger trg_notify_admins_signup_pending
  after insert or update of phone_verified_at on users
  for each row execute function notify_admins_signup_pending();

-- ----------------------------------------------------------------------------
-- 2. Επαγγελματίας: νέο προφίλ προς έγκριση (admin) / απόφαση για το προφίλ
--    του (ο ίδιος ο επαγγελματίας).
-- ----------------------------------------------------------------------------
create or replace function notify_skipper_approval_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(btrim(new.full_name), ''), (select full_name from users where id = new.user_id));
  -- Ένας επαγγελματίας που επιστρέφει εγκρίνεται «ζωντανεύοντας» το παλιό
  -- του προφίλ (0037: deleted_at → null, approval_status ήδη 'approved',
  -- νέο approved_at) — μετράει κι αυτό ως απόφαση. Η επαναφορά από αναστολή
  -- ή διαγραφή ζωντανεύει επίσης το προφίλ αλλά δεν αγγίζει το approved_at,
  -- και δεν είναι νέα έγκριση.
  v_revived boolean := tg_op = 'UPDATE' and old.deleted_at is not null
                       and new.approved_at is distinct from old.approved_at;
begin
  if new.deleted_at is not null then return null; end if;

  if new.approval_status = 'pending'
     and (tg_op = 'INSERT' or old.approval_status is distinct from 'pending' or old.deleted_at is not null) then
    perform notify_admins(
      'admin_pro_pending',
      jsonb_build_object('name', v_name, 'role', new.role),
      '/platform/admin/approvals'
    );
  end if;

  if tg_op = 'UPDATE' and (new.approval_status is distinct from old.approval_status or v_revived) then
    if new.approval_status = 'approved' then
      perform notify_user(new.user_id, 'profile_approved', jsonb_build_object('role', new.role), '/platform/requests');
    elsif new.approval_status = 'rejected' then
      perform notify_user(
        new.user_id, 'profile_rejected',
        jsonb_build_object('role', new.role, 'revoked', old.approval_status = 'approved' and not v_revived),
        '/platform/requests'
      );
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_notify_skipper_approval_change on skipper_profiles;
create trigger trg_notify_skipper_approval_change
  after insert or update of approval_status, deleted_at on skipper_profiles
  for each row execute function notify_skipper_approval_change();

-- ----------------------------------------------------------------------------
-- 3. Επιπλέον ιδιότητα (0065): αίτηση προς έγκριση / απόφαση.
-- ----------------------------------------------------------------------------
create or replace function notify_secondary_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_name text;
begin
  if new.deleted_at is not null then return null; end if;
  select sp.user_id, coalesce(nullif(btrim(sp.full_name), ''), u.full_name) into v_user, v_name
    from skipper_profiles sp join users u on u.id = sp.user_id
    where sp.id = new.skipper_id;

  if new.approval_status = 'pending'
     and (tg_op = 'INSERT' or old.approval_status is distinct from 'pending' or old.deleted_at is not null) then
    perform notify_admins(
      'admin_role_pending',
      jsonb_build_object('name', v_name, 'role', new.role),
      '/platform/admin/approvals'
    );
  end if;

  if tg_op = 'UPDATE' and new.approval_status is distinct from old.approval_status then
    if new.approval_status = 'approved' then
      perform notify_user(v_user, 'role_approved', jsonb_build_object('role', new.role), '/platform/profile');
    elsif new.approval_status = 'rejected' then
      perform notify_user(v_user, 'role_rejected', jsonb_build_object('role', new.role), '/platform/profile');
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_notify_secondary_role_change on skipper_secondary_roles;
create trigger trg_notify_secondary_role_change
  after insert or update of approval_status, deleted_at on skipper_secondary_roles
  for each row execute function notify_secondary_role_change();

-- ----------------------------------------------------------------------------
-- 4. Νέα αναφορά ακύρωσης.
-- ----------------------------------------------------------------------------
create or replace function notify_admins_dispute_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_place text; v_start date;
begin
  select coalesce(nullif(b.departure_point, ''), p.name), b.start_date
    into v_place, v_start
    from bookings b left join ports p on p.id = b.port_id
    where b.id = new.booking_id;
  perform notify_admins(
    'admin_dispute_new',
    jsonb_build_object('port', v_place, 'start', v_start),
    '/platform/admin/disputes'
  );
  return null;
end;
$$;
drop trigger if exists trg_notify_admins_dispute_new on cancellation_reports;
create trigger trg_notify_admins_dispute_new
  after insert on cancellation_reports
  for each row execute function notify_admins_dispute_new();

-- ----------------------------------------------------------------------------
-- 5. admin_overview: + pending_secondary_roles, ώστε ο μετρητής
--    «Εκκρεμότητες» στο μενού να μετρά ό,τι δείχνει και η σελίδα.
--    Κατά τα άλλα αυτούσιο από το 0078.
-- ----------------------------------------------------------------------------
create or replace function admin_overview()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_admin() then null else jsonb_build_object(
    'users_total',        (select count(*) from users where role <> 'admin'),
    'users_new_7d',       (select count(*) from users where role <> 'admin' and created_at > now() - interval '7 days'),
    'clients_total',      (select count(*) from users where role = 'client'),
    'pros_total',         (select count(*) from users where role = 'skipper'),
    'pending_approvals',  (select count(*) from skipper_profiles where approval_status = 'pending' and deleted_at is null),
    'pending_secondary_roles', (select count(*) from skipper_secondary_roles
                                where approval_status = 'pending' and deleted_at is null),
    'open_disputes',      (select count(*) from cancellation_reports where resolved_at is null),
    'contact_new',        (select count(*) from contact_messages where status = 'new'),
    'coverage_needed',    (select count(*) from admin_coverage_needed() where offer_request_id is null),
    'coverage_offered',   (select count(*) from admin_coverage_needed() where offer_request_id is not null),
    'offers_open',        (select count(*) from booking_requests where origin <> 'client' and status = 'open'),
    'requests_open',      (select count(*) from booking_requests where status = 'open' and origin = 'client'),
    'requests_unclaimed_7d', (select count(*) from booking_requests
                              where status = 'expired_unclaimed' and created_at > now() - interval '7 days'),
    'bookings_confirmed', (select count(*) from bookings where status = 'confirmed'),
    'bookings_upcoming',  (select count(*) from bookings where status = 'confirmed' and start_date >= current_date),
    'bookings_completed', (select count(*) from bookings where status = 'completed'),
    'bookings_cancelled_30d', (select count(*) from bookings
                               where status in ('cancelled_by_client','cancelled_by_skipper')
                                 and created_at > now() - interval '30 days'),
    'wallet_total',       (select coalesce(sum(wallet_balance), 0) from users),
    'fees_30d',           (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee') and created_at > now() - interval '30 days'),
    'fees_all_time',      (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee')),
    'refunds_30d',        (select coalesce(sum(amount), 0) from wallet_transactions
                           where type = 'refund_credit' and created_at > now() - interval '30 days'),
    'profiles_invisible', (select count(*) from skipper_profiles sp
                           where sp.approval_status = 'approved' and sp.deleted_at is null
                             and not skipper_is_search_visible(sp.id)),
    'pending_verification', (select count(*) from users
                             where phone_verified_at is null and status <> 'deleted' and role <> 'admin'),
    'suspended_count', (select count(*) from users where status = 'suspended')
  ) end;
$$;
