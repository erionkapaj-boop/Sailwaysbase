-- ============================================================================
-- Αναστολή λογαριασμού: ζητήθηκε ρητά — ένα ενδιάμεσο βήμα ανάμεσα σε
-- "τίποτα" και "Οριστική διαγραφή", για λογαριασμούς που πρέπει να
-- σταματήσουν να λειτουργούν επ' αόριστον (κάτι εκκρεμεί προς έλεγχο, κακή
-- συμπεριφορά υπό διερεύνηση, κ.λπ.) αλλά ο admin θέλει να μπορεί να τους
-- επαναφέρει αργότερα με ένα κλικ — χωρίς την τελετουργία μιας νέας
-- εγγραφής (όπως η αναβίωση διαγραμμένου λογαριασμού) και χωρίς να χαθεί
-- τίποτα (ιστορικό, αξιολογήσεις, wallet — όλα μένουν ως έχουν).
--
-- Το user_status enum έχει ήδη 'suspended' από την πρώτη μέρα (0001) — και
-- το admin/ui.js έχει ήδη ετικέτα "Σε αναστολή" γι' αυτό — αλλά καμία
-- migration ποτέ δεν το χρησιμοποίησε πραγματικά. Αυτό το γεμίζει.
--
-- Ο λόγος αποθηκεύεται σε δική του στήλη (όχι μόνο στο admin_actions log)
-- ώστε να είναι αμέσως ορατός στο προφίλ του χρήστη — ζητήθηκε ρητά η
-- δυνατότητα να θυμάται ο admin ΓΙΑΤΙ τον σταμάτησε.
-- ============================================================================

alter table users add column if not exists suspension_reason text;

-- ----------------------------------------------------------------------------
-- Αναστολή. Ίδιο μοτίβο ασφαλείας με το soft_delete_account: ποτέ πάνω σε
-- admin. Αν ο λογαριασμός έχει skipper_profiles, κρύβεται από την αναζήτηση
-- όσο διαρκεί η αναστολή (ίδιος μηχανισμός deleted_at με τη διαγραφή) —
-- διαφορετικά ένας "σταματημένος" επαγγελματίας θα συνέχιζε κανονικά να
-- εμφανίζεται και να δέχεται αιτήματα.
-- ----------------------------------------------------------------------------
create or replace function admin_suspend_account(p_user_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
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
$$;
grant execute on function admin_suspend_account(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Επαναφορά. Ένα κλικ, καμία τελετουργία — αυτό είναι το σημείο της
-- αναστολής σε αντίθεση με τη διαγραφή. Γυρίζει σε 'draft' αντί για 'active'
-- αν ο επαγγελματίας δεν είχε προλάβει να εγκριθεί πριν την αναστολή (ίδιο
-- κανόνα με τη νέα εγγραφή) — αλλιώς σε 'active' κανονικά.
-- ----------------------------------------------------------------------------
create or replace function admin_reactivate_account(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row users%rowtype;
  v_skipper_id uuid;
  v_new_status user_status;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select * into v_row from users where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status <> 'suspended' then raise exception 'not_suspended'; end if;

  select id into v_skipper_id from skipper_profiles where user_id = p_user_id;

  v_new_status := case
    when v_skipper_id is not null and exists (
      select 1 from skipper_profiles where id = v_skipper_id and approval_status <> 'approved'
    ) then 'draft'
    else 'active'
  end;

  perform set_config('platform.trusted', 'true', true);

  update users set status = v_new_status, suspension_reason = null where id = p_user_id;

  if v_skipper_id is not null then
    update skipper_profiles set deleted_at = null where id = v_skipper_id;
  end if;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'ban_account', p_user_id, 'Επαναφορά από αναστολή.');
end;
$$;
grant execute on function admin_reactivate_account(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_list_accounts: νέο φίλτρο p_suspended_only, ίδιο μοτίβο με
-- p_deleted_only/p_pending_verification_only — και suspension_reason στην
-- έξοδο, ώστε να φαίνεται αμέσως ο λόγος στη λίστα, όχι μόνο στο Στοιχεία.
-- ----------------------------------------------------------------------------
drop function if exists admin_list_accounts(user_role, crew_role, text, text, int, boolean, boolean, boolean);

create function admin_list_accounts(
  p_role user_role default null,
  p_crew_role crew_role default null,
  p_search text default '',
  p_sort text default 'recent',
  p_limit int default 200,
  p_invisible_only boolean default false,
  p_deleted_only boolean default false,
  p_pending_verification_only boolean default false,
  p_suspended_only boolean default false
)
returns table(
  id uuid, role user_role, crew_role crew_role, full_name text, phone_number text, email text,
  status user_status, approval_status skipper_approval_status, created_at timestamptz,
  last_seen_at timestamptz, date_of_birth date, rating_avg numeric, rating_count int,
  reliability_percentage numeric, completed_bookings_count int, tier skipper_tier,
  is_test_account boolean, photo_url text, phone_verified_at timestamptz, suspension_reason text
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
    u.phone_verified_at,
    u.suspension_reason
  from users u
  left join skipper_profiles sp on sp.user_id = u.id and sp.deleted_at is null
  left join client_profiles cp on cp.user_id = u.id
  where is_admin()
    and (case when p_deleted_only then u.status = 'deleted' else u.status <> 'deleted' end)
    and (not p_pending_verification_only or (u.phone_verified_at is null and u.role <> 'admin'))
    and (not p_suspended_only or u.status = 'suspended')
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
grant execute on function admin_list_accounts(
  user_role, crew_role, text, text, int, boolean, boolean, boolean, boolean
) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_overview: μετρητής, ίδιο μοτίβο με pending_verification — ώστε να
-- μην ξεχνιούνται οι αναστολές, ακριβώς αυτό που ζητήθηκε.
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
                             where phone_verified_at is null and status <> 'deleted' and role <> 'admin'),
    'suspended_count', (select count(*) from users where status = 'suspended')
  ) end;
$$;
