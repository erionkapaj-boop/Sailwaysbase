-- ============================================================================
-- Διορθώνει τρία πραγματικά προβλήματα στη διαγραφή λογαριασμού (0073),
-- όλα εντοπισμένα από πραγματική δοκιμή στο production:
--
-- 1. Η διαγραφή έσβηνε το email/όνομα και καθάριζε εντελώς το τηλέφωνο από
--    το Supabase Auth. Αποτέλεσμα: μια νέα εγγραφή με το ΙΔΙΟ τηλέφωνο
--    έφτιαχνε ΚΑΙΝΟΥΡΙΑ, ξεχωριστή ταυτότητα — η παλιά γραμμή (με όποια
--    αξιολόγηση/ιστορικό είχε) έμενε πίσω, ξεχασμένη, και ο νέος λογαριασμός
--    ξεκινούσε καθαρός. Αυτό είναι ακριβώς αντίθετο από τον λόγο που η
--    διαγραφή είναι ανωνυμοποίηση κι όχι πραγματικό delete: ζητήθηκε ρητά
--    ώστε κάποιος με χαμηλή αξιολόγηση να ΜΗΝ μπορεί να τη "ξεπλύνει"
--    διαγράφοντας και ξαναγγράφοντας με το ίδιο νούμερο.
--
--    Διόρθωση: η διαγραφή πλέον ΔΕΝ αγγίζει καθόλου το τηλέφωνο (ούτε στο
--    Supabase Auth ούτε στη στήλη phone_number) ούτε το όνομα/email — μόνο
--    σημειώνει status='deleted' (και skipper_profiles.deleted_at, όπως
--    πριν). Μια νέα εγγραφή με το ίδιο πραγματικό τηλέφωνο αναγνωρίζεται
--    από το Supabase Auth ως η ΙΔΙΑ ταυτότητα (ίδιο auth.users.id), οπότε η
--    νέα RPC complete_registration() παρακάτω ΑΝΑΒΙΩΝΕΙ την ίδια γραμμή
--    αντί να φτιάξει καινούρια — ίδιο id, ίδια rating_avg/rating_count/
--    reliability_percentage/completed_bookings_count, ίδιο ιστορικό
--    κρατήσεων/αξιολογήσεων (τίποτα από αυτά δεν ζει καν σε αυτή τη
--    συνάρτηση, οπότε δεν υπάρχει τίποτα να "ξαναφτιαχτεί").
--
--    Παρενέργεια που διορθώνεται δωρεάν: υπάρχει trigger (0066) που πιστώνει
--    δώρο εγγραφής (100€ επαγγελματίας/50€ πελάτης) σε κάθε INSERT στο
--    users. Με το παλιό bug, κάθε διαγραφή+επανεγγραφή έφτιαχνε νέο INSERT
--    → νέο δώρο, επ' άπειρον. Η αναβίωση παρακάτω κάνει UPDATE, όχι INSERT,
--    άρα το trigger δεν ξαναπυροδοτεί — κλείνει και αυτό το κενό.
--
-- 2. admin_list_accounts δεν φιλτράριζε καθόλου το status, οπότε διαγραμμένοι
--    λογαριασμοί έμεναν ανακατεμένοι με ενεργούς στη λίστα "Χρήστες" του
--    admin. Διόρθωση: προεπιλογή αποκλείει status='deleted'· νέα παράμετρος
--    p_deleted_only για ξεχωριστή προβολή τους.
--
-- 3. Ένας διαγραμμένος λογαριασμός μπορούσε ακόμα να συνδεθεί κανονικά με
--    το παλιό του PIN — η διαγραφή δεν άγγιζε καθόλου το password στο
--    Supabase Auth, μόνο το δικό μας status. Διορθώνεται στο lib/platform/
--    db.js (signInWithPin), όχι εδώ — μετά από επιτυχή signInWithPassword,
--    ελέγχει το status και αποσυνδέει αν είναι 'deleted'.
--
-- Επιπλέον, άμυνα σε βάθος: soft_delete_account τώρα αρνείται να διαγράψει
-- λογαριασμό με role='admin' — πριν αυτό εμποδιζόταν μόνο στο UI.
-- ============================================================================

create or replace function soft_delete_account(p_user_id uuid, p_notes text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row users%rowtype;
  v_skipper_id uuid;
begin
  select * into v_row from users where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status = 'deleted' then raise exception 'already_deleted'; end if;
  if v_row.role = 'admin' then raise exception 'cannot_delete_admin'; end if;

  if exists (select 1 from booking_requests where client_id = p_user_id and status = 'open') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from delivery_requests dr join delivery_role_requests rr on rr.delivery_request_id = dr.id
             where dr.client_id = p_user_id and rr.status = 'open') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from bookings where client_id = p_user_id and status = 'confirmed') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from delivery_bookings where client_id = p_user_id and status = 'confirmed') then
    raise exception 'has_pending_activity';
  end if;

  select id into v_skipper_id from skipper_profiles where user_id = p_user_id;
  if v_skipper_id is not null then
    if exists (select 1 from bookings where skipper_id = v_skipper_id and status = 'confirmed') then
      raise exception 'has_pending_activity';
    end if;
    if exists (select 1 from delivery_bookings where skipper_id = v_skipper_id and status = 'confirmed') then
      raise exception 'has_pending_activity';
    end if;
  end if;

  -- Μόνο το status αλλάζει· τηλέφωνο/όνομα/email μένουν ακριβώς όπως ήταν,
  -- ώστε μια μελλοντική επανεγγραφή με το ίδιο νούμερο να ξαναβρεί την ίδια
  -- γραμμή (βλ. complete_registration παρακάτω).
  update users set status = 'deleted' where id = p_user_id;

  if v_skipper_id is not null then
    update skipper_profiles set deleted_at = now() where id = v_skipper_id and deleted_at is null;
    update skipper_secondary_roles set deleted_at = now() where skipper_id = v_skipper_id and deleted_at is null;
  end if;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (coalesce(auth.uid(), p_user_id), 'ban_account', p_user_id,
      coalesce(p_notes, 'Διαγραφή λογαριασμού (αυτοεξυπηρέτηση ή admin).'));
end;
$$;

-- ----------------------------------------------------------------------------
-- complete_registration() — αντικαθιστά τα απευθείας INSERT του
-- createUserDraft() στο db.js. Χρειάζεται SECURITY DEFINER + platform.trusted
-- γιατί αλλάζει users.status/role και skipper_profiles.deleted_at/
-- approval_status όταν αναβιώνει έναν διαγραμμένο λογαριασμό — προνομιακές
-- στήλες, κλειδωμένες από τα trigger guards του 0006/0007 όταν καλούνται
-- απευθείας από τον ίδιο τον (μη-admin) χρήστη.
-- ----------------------------------------------------------------------------
create or replace function complete_registration(
  p_full_name text, p_email text, p_phone text, p_crew_role crew_role default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_pro boolean := p_crew_role is not null;
  v_role user_role := case when v_is_pro then 'skipper' else 'client' end;
  v_status user_status := case when v_is_pro then 'draft' else 'active' end;
  v_existing_user users%rowtype;
  v_existing_sp skipper_profiles%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(btrim(p_full_name), '') = '' then raise exception 'name_required'; end if;

  perform set_config('platform.trusted', 'true', true);

  select * into v_existing_user from users where id = v_uid;

  if not found then
    insert into users (id, role, full_name, email, phone_number, phone_verified_at, status)
      values (v_uid, v_role, btrim(p_full_name), nullif(btrim(p_email), ''), p_phone, now(), v_status);
  elsif v_existing_user.status = 'deleted' then
    -- Αναβίωση: ίδια γραμμή, ίδιο id — καμία στήλη ιστορικού/αξιολόγησης
    -- δεν ζει στο users, οπότε δεν υπάρχει τίποτα εδώ να διατηρηθεί ρητά.
    -- Δεν ξαναπερνάει από το trigger του δώρου εγγραφής (μόνο on insert).
    update users set role = v_role, full_name = btrim(p_full_name),
      email = nullif(btrim(p_email), ''), phone_verified_at = now(), status = v_status
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
      -- Αναβίωση του παλιού επαγγελματικού προφίλ: επιστρέφει σε
      -- εκκρεμότητα έγκρισης (λογικό μετά από διαγραφή/απουσία), αλλά
      -- rating_avg/rating_count/reliability_percentage/tier/price_per_day/
      -- wallet_balance/completed_bookings_count/cancellation_flag_count
      -- ΔΕΝ αγγίζονται — αυτό είναι το ιστορικό που έπρεπε να μείνει.
      update skipper_profiles set deleted_at = null, role = p_crew_role,
        full_name = btrim(p_full_name), approval_status = 'pending',
        approved_by = null, approved_at = null
        where id = v_existing_sp.id;
    end if;
  end if;
end;
$$;
grant execute on function complete_registration(text, text, text, crew_role) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_list_accounts: απόκρυψη διαγραμμένων από την προεπιλεγμένη λίστα,
-- νέα p_deleted_only για ξεχωριστή προβολή τους (admin/users.js, νέα καρτέλα
-- "Διαγραμμένοι"). Πρέπει να γίνει drop πρώτα — αλλάζει ο αριθμός ορισμάτων
-- (βλ. σημείωση σε προηγούμενα migrations για το ίδιο ζήτημα: το CREATE OR
-- REPLACE δεν αντικαθιστά διαφορετικό signature, αφήνει πίσω ασαφές overload).
-- ----------------------------------------------------------------------------
drop function if exists admin_list_accounts(user_role, crew_role, text, text, int, boolean);

create function admin_list_accounts(
  p_role user_role default null,
  p_crew_role crew_role default null,
  p_search text default '',
  p_sort text default 'recent',
  p_limit int default 200,
  p_invisible_only boolean default false,
  p_deleted_only boolean default false
)
returns table(
  id uuid,
  role user_role,
  crew_role crew_role,
  full_name text,
  phone_number text,
  email text,
  status user_status,
  approval_status skipper_approval_status,
  created_at timestamptz,
  last_seen_at timestamptz,
  date_of_birth date,
  rating_avg numeric,
  rating_count int,
  reliability_percentage numeric,
  completed_bookings_count int,
  tier skipper_tier,
  is_test_account boolean,
  photo_url text
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
    coalesce(sp.photo_url, u.photo_url)
  from users u
  left join skipper_profiles sp on sp.user_id = u.id and sp.deleted_at is null
  left join client_profiles cp on cp.user_id = u.id
  where is_admin()
    and (case when p_deleted_only then u.status = 'deleted' else u.status <> 'deleted' end)
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
grant execute on function admin_list_accounts(user_role, crew_role, text, text, int, boolean, boolean) to authenticated;
