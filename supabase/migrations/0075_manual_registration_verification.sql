-- ============================================================================
-- Δύο τρόποι επιβεβαίωσης εγγραφής, ζητήθηκε ρητά:
-- 1. Αυτόματο, μέσω SMS OTP (ήδη υπάρχει — sendOtp/verifyOtp).
-- 2. Χειροκίνητο, από τον admin — καινούριο εδώ, γιατί το SMS δεν είναι
--    ακόμα ενεργό στο production.
--
-- Δεν προστίθεται νέα κατάσταση (enum value) για "σε αναμονή" — ήδη υπάρχει
-- η στήλη phone_verified_at στο users (γεμίζει σήμερα μόνο από το πραγματικό
-- verifyOtp). Μια εγγραφή χωρίς αυτήν είναι η ίδια η κατάσταση αναμονής:
-- ο λογαριασμός υπάρχει κανονικά (ίδιο users row, ίδιο client_profiles/
-- skipper_profiles όπως πάντα) αλλά είναι μπλοκαρισμένος στην εφαρμογή
-- (VerificationGate στο PlatformShell.js) μέχρι να γίνει true — είτε μέσω
-- πραγματικού SMS OTP (όταν ενεργοποιηθεί) είτε μέσω admin_verify_user εδώ.
-- Και οι δύο τρόποι γράφουν ακριβώς το ίδιο πράγμα (phone_verified_at =
-- now()), οπότε συνυπάρχουν χωρίς σύγκρουση όποτε ενεργοποιηθεί το SMS.
--
-- platform_settings.otp_enabled (0 σήμερα) είναι ο διακόπτης που διαβάζει η
-- σελίδα εγγραφής (lib/platform/db.js) για να αποφασίσει ποια ροή να
-- ακολουθήσει· δεν μπλοκάρει τίποτα από μόνος του στη βάση.
-- ============================================================================

insert into platform_settings (key, value)
  values ('otp_enabled', 0)
  on conflict (key) do nothing;

drop function if exists complete_registration(text, text, text, crew_role);

create function complete_registration(
  p_full_name text, p_email text, p_phone text, p_crew_role crew_role default null,
  p_phone_verified boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_pro boolean := p_crew_role is not null;
  v_role user_role := case when v_is_pro then 'skipper' else 'client' end;
  v_status user_status := case when v_is_pro then 'draft' else 'active' end;
  v_verified_at timestamptz := case when p_phone_verified then now() else null end;
  v_existing_user users%rowtype;
  v_existing_sp skipper_profiles%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(btrim(p_full_name), '') = '' then raise exception 'name_required'; end if;

  perform set_config('platform.trusted', 'true', true);

  select * into v_existing_user from users where id = v_uid;

  if not found then
    insert into users (id, role, full_name, email, phone_number, phone_verified_at, status)
      values (v_uid, v_role, btrim(p_full_name), nullif(btrim(p_email), ''), p_phone, v_verified_at, v_status);
  elsif v_existing_user.status = 'deleted' then
    -- Αναβίωση: ίδια γραμμή, ίδιο id — καμία στήλη ιστορικού/αξιολόγησης
    -- δεν ζει στο users, οπότε δεν υπάρχει τίποτα εδώ να διατηρηθεί ρητά.
    -- Δεν ξαναπερνάει από το trigger του δώρου εγγραφής (μόνο on insert).
    update users set role = v_role, full_name = btrim(p_full_name),
      email = nullif(btrim(p_email), ''), phone_verified_at = v_verified_at, status = v_status
      where id = v_uid;
  end if;
  -- else: υπάρχει ήδη ζωντανός λογαριασμός — τίποτα να γίνει (ίδια
  -- συμπεριφορά με το παλιό "silent on conflict" για διπλό κλικ).

  if not v_is_pro then
    insert into client_profiles (user_id) values (v_uid) on conflict do nothing;
    return;
  end if;

  if p_crew_role in ('skipper', 'hostess', 'cook', 'deckhand') then
    select * into v_existing_sp from skipper_profiles where user_id = v_uid;
    if not found then
      insert into skipper_profiles (user_id, role, full_name, price_per_day)
        values (v_uid, p_crew_role, btrim(p_full_name), 210);
    elsif v_existing_sp.deleted_at is not null then
      update skipper_profiles set deleted_at = null, role = p_crew_role,
        full_name = btrim(p_full_name), approval_status = 'pending',
        approved_by = null, approved_at = null
        where id = v_existing_sp.id;
    end if;
  end if;
end;
$$;
grant execute on function complete_registration(text, text, text, crew_role, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Η χειροκίνητη επιβεβαίωση του admin — γράφει ακριβώς ό,τι θα έγραφε ένα
-- πραγματικό verifyOtp. Idempotent: σε ήδη επιβεβαιωμένο λογαριασμό δεν κάνει
-- τίποτα αντί να πετάξει σφάλμα, ώστε ένα διπλό κλικ στο admin να μην σκάει.
-- ----------------------------------------------------------------------------
create or replace function admin_verify_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update users set phone_verified_at = now() where id = p_user_id and phone_verified_at is null;
end;
$$;
grant execute on function admin_verify_user(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_overview: μετρητής των σε-αναμονή εγγραφών, ίδιο μοτίβο με τα άλλα
-- "χρειάζονται ενέργεια" (coverage_needed, pending_approvals, open_disputes).
-- Ίδιο signature (χωρίς ορίσματα) — ασφαλές το create or replace, χωρίς το
-- ζήτημα διπλού overload των συναρτήσεων με ορίσματα.
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
                             where phone_verified_at is null and status <> 'deleted' and role <> 'admin')
  ) end;
$$;

-- ----------------------------------------------------------------------------
-- admin_list_accounts: νέο p_pending_verification_only, ίδιο μοτίβο με
-- p_deleted_only/p_invisible_only — ξεχωριστή, φιλτραρισμένη προβολή αντί
-- για ανακάτεμα με τους ήδη επιβεβαιωμένους. Drop πρώτα, αλλάζει ο αριθμός
-- ορισμάτων.
-- ----------------------------------------------------------------------------
drop function if exists admin_list_accounts(user_role, crew_role, text, text, int, boolean, boolean);

create function admin_list_accounts(
  p_role user_role default null,
  p_crew_role crew_role default null,
  p_search text default '',
  p_sort text default 'recent',
  p_limit int default 200,
  p_invisible_only boolean default false,
  p_deleted_only boolean default false,
  p_pending_verification_only boolean default false
)
returns table(
  id uuid, role user_role, crew_role crew_role, full_name text, phone_number text, email text,
  status user_status, approval_status skipper_approval_status, created_at timestamptz,
  last_seen_at timestamptz, date_of_birth date, rating_avg numeric, rating_count int,
  reliability_percentage numeric, completed_bookings_count int, tier skipper_tier,
  is_test_account boolean, photo_url text, phone_verified_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    u.id, u.role, sp.role,
    coalesce(nullif(sp.full_name, ''), u.full_name),
    u.phone_number, u.email, u.status, sp.approval_status,
    u.created_at, u.last_seen_at, sp.date_of_birth,
    coalesce(sp.rating_avg, cp.rating_avg),
    coalesce(sp.rating_count, cp.rating_count),
    coalesce(sp.reliability_percentage, cp.reliability_percentage),
    coalesce(sp.completed_bookings_count, cp.completed_bookings_count),
    sp.tier,
    u.is_test_account,
    coalesce(sp.photo_url, u.photo_url),
    u.phone_verified_at
  from users u
  left join skipper_profiles sp on sp.user_id = u.id and sp.deleted_at is null
  left join client_profiles cp on cp.user_id = u.id
  where is_admin()
    and (case when p_deleted_only then u.status = 'deleted' else u.status <> 'deleted' end)
    and (not p_pending_verification_only or (u.phone_verified_at is null and u.role <> 'admin'))
    and (p_role is null or u.role = p_role)
    and (p_crew_role is null or sp.role = p_crew_role)
    and (
      coalesce(p_search, '') = ''
      or u.phone_number ilike '%' || p_search || '%'
      or u.full_name ilike '%' || p_search || '%'
      or sp.full_name ilike '%' || p_search || '%'
      or u.email ilike '%' || p_search || '%'
    )
    and (
      not p_invisible_only
      or (sp.id is not null and sp.approval_status = 'approved' and not skipper_is_search_visible(sp.id))
    )
  order by
    case when p_sort = 'name' then coalesce(nullif(sp.full_name, ''), u.full_name) end asc nulls last,
    case when p_sort = 'active' then u.last_seen_at end desc nulls last,
    case when p_sort = 'rating' then
      bayesian_rating(coalesce(sp.rating_avg, cp.rating_avg), coalesce(sp.rating_count, cp.rating_count))
    end desc nulls last,
    case when p_sort = 'bookings' then coalesce(sp.completed_bookings_count, cp.completed_bookings_count) end desc nulls last,
    case when p_sort = 'age' then sp.date_of_birth end asc nulls last,
    u.created_at desc
  limit p_limit;
$$;
grant execute on function admin_list_accounts(user_role, crew_role, text, text, int, boolean, boolean, boolean) to authenticated;
