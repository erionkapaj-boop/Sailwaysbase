-- ============================================================================
-- Ταχύτητα με πολλά δεδομένα (tests/perf: 22.000 χρήστες, 60.000 αιτήματα,
-- 25.000 κρατήσεις, 300.000 ειδοποιήσεις).
--
-- Τι μέτρησε η εφαρμογή πάνω σε τέτοια βάση και τι αλλάζει εδώ:
--
-- 1. Κάθε σελίδα του admin: 2–5 δευτ. Τα μετρητάκια του μενού
--    (admin_overview) έπαιρναν 2,2 δευτ., κυρίως γιατί η λίστα υποθέσεων
--    αντικατάστασης έψαχνε «ποια κράτηση αντικαθιστά ποια» διαβάζοντας όλες
--    τις κρατήσεις, για κάθε ακυρωμένη. Ευρετήρια → 1.500ms γίνονται 24ms.
--    Και το «πόσοι εγκεκριμένοι δεν φαίνονται στην αναζήτηση» (υπολογισμός
--    διαθεσιμότητας για κάθε επαγγελματία) φεύγει από τα μετρητάκια κάθε
--    σελίδας· ζητιέται μόνο από την Επισκόπηση (admin_invisible_profiles_count).
-- 2. «Κρατήσεις» πελάτη με 300 κρατήσεις: 300 ξεχωριστές κλήσεις για τα
--    στοιχεία της άλλης πλευράς. Τώρα μία (get_booking_counterparts).
-- 3. Ευρετήρια για ό,τι αναζητείται συχνά χωρίς αυτά: κινήσεις ανά
--    αίτημα/κράτηση, λήξεις ανοιχτών αιτημάτων (νυχτερινές/10λεπτες εργασίες),
--    αξιολογήσεις ανά αξιολογούμενο.
-- ============================================================================

create index if not exists bookings_replaces_idx on bookings (replaces_booking_id) where replaces_booking_id is not null;
create index if not exists bookings_request_idx on bookings (booking_request_id);
create index if not exists bookings_skipper_cancelled_idx on bookings (cancelled_at desc) where status = 'cancelled_by_skipper';
create index if not exists booking_requests_replaces_idx on booking_requests (replaces_booking_id, created_at desc)
  where replaces_booking_id is not null;
create index if not exists booking_requests_open_expiry_idx on booking_requests (expires_at) where status = 'open';
create index if not exists wallet_transactions_request_idx on wallet_transactions (related_booking_request_id)
  where related_booking_request_id is not null;
create index if not exists wallet_transactions_booking_idx on wallet_transactions (related_booking_id)
  where related_booking_id is not null;
create index if not exists wallet_transactions_type_idx on wallet_transactions (type, created_at);
create index if not exists reviews_reviewee_idx on reviews (reviewee_id);

-- ---------------------------------------------------------------------------
-- Τα μετρητάκια κάθε σελίδας του admin, χωρίς το profiles_invisible.
-- ---------------------------------------------------------------------------
create or replace function admin_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  with rc as (select stage from admin_replacement_cases(false))
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
    'coverage_needed',    (select count(*) from rc where stage = 'needs_action'),
    'coverage_offered',   (select count(*) from rc where stage in ('awaiting_skippers', 'awaiting_client')),
    'replacement_awaiting_client', (select count(*) from rc where stage = 'awaiting_client'),
    'offers_open',        (select count(*) from booking_requests where origin = 'admin_direct' and status = 'open'),
    'requests_open',      (select count(*) from booking_requests where status = 'open' and origin = 'client'),
    'requests_unclaimed_7d', (select count(*) from booking_requests
                              where status = 'expired_unclaimed' and origin = 'client' and created_at > now() - interval '7 days'),
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
    'pending_verification', (select count(*) from users
                             where phone_verified_at is null and status <> 'deleted' and role <> 'admin'),
    'pending_photos',   (select count(*) from users
                         where photo_url is not null and photo_reviewed_at is null and status <> 'deleted'),
    'suspended_count', (select count(*) from users where status = 'suspended')
  ) end;$$;

create or replace function admin_invisible_profiles_count() returns int
language sql stable security definer set search_path = public as $$
  select case when is_admin() then (
    select count(*)::int from skipper_profiles sp
     where sp.approval_status = 'approved' and sp.deleted_at is null
       and not skipper_is_search_visible(sp.id)
  ) end;
$$;

revoke execute on function admin_invisible_profiles_count() from public, anon;
grant execute on function admin_invisible_profiles_count() to authenticated;

-- ---------------------------------------------------------------------------
-- Τα στοιχεία της άλλης πλευράς για πολλές κρατήσεις μαζί. Ίδιοι κανόνες με
-- το get_booking_counterpart: μόνο όποιος συμμετέχει, μόνο αφού αποκαλυφθούν.
-- Όσες κρατήσεις δεν πληρούν τους κανόνες απλώς λείπουν από το αποτέλεσμα.
-- ---------------------------------------------------------------------------
create or replace function get_booking_counterparts(p_booking_ids uuid[])
returns table (booking_id uuid, user_id uuid, full_name text, phone_number text, photo_url text, crew_role crew_role)
language sql stable security definer set search_path = public as $$
  with mine as (
    select b.id, b.crew_role,
           case when b.client_id = auth.uid() then sp.user_id else b.client_id end as other_id,
           b.client_id = auth.uid() as i_am_client
      from bookings b join skipper_profiles sp on sp.id = b.skipper_id
     where b.id = any(p_booking_ids)
       and b.status in ('confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_skipper')
       and (b.client_id = auth.uid() or sp.user_id = auth.uid())
  )
  select m.id, u.id, coalesce(nullif(btrim(u.full_name), ''), sp2.full_name), u.phone_number, u.photo_url,
         case when m.i_am_client then m.crew_role end
    from mine m
    join users u on u.id = m.other_id
    left join skipper_profiles sp2 on sp2.user_id = u.id;
$$;

revoke execute on function get_booking_counterparts(uuid[]) from public, anon;
grant execute on function get_booking_counterparts(uuid[]) to authenticated;

analyze bookings;
analyze booking_requests;
analyze wallet_transactions;
analyze reviews;
