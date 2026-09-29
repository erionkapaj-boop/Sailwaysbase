-- ============================================================================
-- Υγεία εφαρμογής (Φάση 1).
--
-- Η εφαρμογή εντοπίζει μόνη της ό,τι δεν κυλάει και το φέρνει μπροστά στον
-- ιδιοκτήτη, χωρίς να το ζητήσει κανείς:
--
--  1. Έλεγχοι δεδομένων, κάθε ώρα (pg_cron): καταστάσεις που δεν θα έπρεπε να
--     υπάρχουν — πληρωμένο αίτημα που δεν έφτασε σε κανέναν, κράτηση που
--     τελείωσε και δεν έκλεισε, υπόλοιπο που δεν ταιριάζει με τις κινήσεις.
--     Όταν η κατάσταση διορθωθεί, το θέμα κλείνει μόνο του.
--  2. Σφάλματα που είδαν χρήστες: ό,τι δεν έχει γνωστό μήνυμα (απρόβλεπτο) ή
--     έσπασε τη σελίδα, στέλνεται από τον browser χωρίς προσωπικά στοιχεία.
--
-- Όλα ομαδοποιούνται σε «θέματα» (health_issues), ένα ανά είδος και σημείο,
-- με πόσες φορές, πόσους χρήστες, από πότε. Κάθε θέμα έχει κωδικό
-- (fingerprint) για αναπαραγωγή και διόρθωση. Τα γεγονότα κρατιούνται 90 μέρες.
--
-- Φτιαγμένο ώστε να «κουμπώσει» αργότερα ανάλυση AI πάνω στις συνόψεις
-- (Φάση 4), όχι πάνω στα γεγονότα.
-- ============================================================================

create table if not exists health_issues (
  fingerprint text primary key,
  source text not null check (source in ('data', 'app')),
  code text not null,
  title text not null,
  area text,
  occurrences int not null default 0,
  affected_users int not null default 0,
  sample jsonb,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  reopened_count int not null default 0,
  notified_at timestamptz
);
create index if not exists health_issues_status on health_issues (status, last_seen desc);

create table if not exists health_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  fingerprint text not null,
  user_id uuid references users(id) on delete set null,
  page text,
  detail text
);
create index if not exists health_events_created on health_events (created_at);
create index if not exists health_events_user on health_events (user_id, created_at);
create index if not exists health_events_fp on health_events (fingerprint, created_at);

alter table health_issues enable row level security;
alter table health_events enable row level security;
revoke all on health_issues from public, anon, authenticated;
revoke all on health_events from public, anon, authenticated;
-- Μόνο ανάγνωση, μόνο για τον ιδιοκτήτη· κάθε εγγραφή από ελεγμένη συνάρτηση.
grant select on health_issues to authenticated;
drop policy if exists "health issues owner read" on health_issues;
create policy "health issues owner read" on health_issues for select using (is_owner_admin());

-- ---------------------------------------------------------------------------
-- Άνοιγμα / ενημέρωση ενός θέματος. Νέο θέμα (ή θέμα που ξαναφάνηκε αφού
-- σημειώθηκε λυμένο) ειδοποιεί τον ιδιοκτήτη, έως 5 φορές το 24ωρο.
-- ---------------------------------------------------------------------------
create or replace function health_touch(
  p_fingerprint text, p_source text, p_code text, p_title text, p_area text,
  p_occurrences int, p_affected int, p_sample jsonb, p_add boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old health_issues%rowtype;
  v_new_or_back boolean;
begin
  select * into v_old from health_issues where fingerprint = p_fingerprint for update;
  v_new_or_back := not found or v_old.status = 'resolved';

  if not found then
    insert into health_issues (fingerprint, source, code, title, area, occurrences, affected_users, sample)
      values (p_fingerprint, p_source, p_code, p_title, p_area, p_occurrences, p_affected, p_sample);
  else
    update health_issues set
      title = p_title,
      area = p_area,
      occurrences = case when p_add then occurrences + p_occurrences else p_occurrences end,
      affected_users = p_affected,
      sample = p_sample,
      last_seen = now(),
      status = 'open',
      resolved_at = null,
      resolved_by = null,
      reopened_count = reopened_count + case when v_old.status = 'resolved' then 1 else 0 end
    where fingerprint = p_fingerprint;
  end if;

  if v_new_or_back
     and (select count(*) from health_issues where notified_at > now() - interval '24 hours') < 5 then
    update health_issues set notified_at = now() where fingerprint = p_fingerprint;
    perform notify_owners('admin_health_issue',
      jsonb_build_object('title', p_title, 'area', p_area, 'again', v_old.fingerprint is not null),
      '/platform/admin/health');
  end if;
end;
$$;
revoke execute on function health_touch(text, text, text, text, text, int, int, jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Σφάλμα που είδε ένας χρήστης. Καλείται από τον browser, και ανώνυμα
-- (η εγγραφή και η σύνδεση γίνονται χωρίς λογαριασμό). Κρατά μόνο κωδικό,
-- σελίδα (χωρίς ids) και ένα σύντομο τεχνικό μήνυμα χωρίς αριθμούς/email.
-- ---------------------------------------------------------------------------
create or replace function report_app_issue(p_kind text, p_code text, p_page text, p_detail text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_kind text := case when p_kind in ('error', 'crash') then p_kind else 'error' end;
  v_code text := nullif(left(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9_.:-]', '', 'g'), 80), '');
  v_page text;
  v_detail text;
  v_fp text;
  v_title text;
begin
  v_code := coalesce(v_code, 'unexpected');
  v_page := regexp_replace(coalesce(p_page, ''), '\?.*$', '');
  v_page := regexp_replace(v_page, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g');
  v_page := nullif(left(regexp_replace(v_page, '[^A-Za-z0-9/_:.-]', '', 'g'), 120), '');
  v_detail := left(coalesce(p_detail, ''), 300);
  v_detail := regexp_replace(v_detail, '[^[:space:]@]+@[^[:space:]@]+', '[email]', 'g');
  v_detail := regexp_replace(v_detail, '\+?[0-9][0-9 ]{5,}[0-9]', '[αριθμός]', 'g');
  v_fp := 'app:' || v_kind || ':' || v_code || '@' || coalesce(v_page, '-');

  -- Όρια: ένας χρήστης δεν γεμίζει τον πίνακα, ούτε οι ανώνυμοι συνολικά.
  if v_uid is not null then
    if (select count(*) from health_events where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then return; end if;
    if exists (select 1 from health_events where user_id = v_uid and fingerprint = v_fp
                and created_at > now() - interval '1 minute') then return; end if;
  else
    if (select count(*) from health_events where user_id is null and created_at > now() - interval '1 hour') >= 300 then return; end if;
  end if;

  insert into health_events (fingerprint, user_id, page, detail) values (v_fp, v_uid, v_page, nullif(v_detail, ''));

  v_title := case v_kind when 'crash' then 'Η σελίδα έσπασε' else 'Απρόβλεπτο σφάλμα' end;
  perform health_touch(v_fp, 'app', v_code, v_title, v_page, 1,
    (select count(distinct user_id)::int from health_events where fingerprint = v_fp and created_at > now() - interval '90 days'),
    jsonb_build_object('detail', nullif(v_detail, '')), true);
end;
$$;
revoke execute on function report_app_issue(text, text, text, text) from public;
grant execute on function report_app_issue(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Έλεγχοι δεδομένων. Κάθε έλεγχος: πόσα, πόσοι χρήστες, έως 5 δείγματα.
-- Μηδέν = το θέμα κλείνει μόνο του. Λογαριασμοί δοκιμών δεν μετράνε.
-- ---------------------------------------------------------------------------
create or replace function run_health_checks() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_count int;
  v_users int;
  v_sample jsonb;
  v_open int := 0;
  v_fp text;
begin
  perform set_config('platform.trusted', 'true', true);

  for c in select * from (values
    ('wallet_mismatch', 'Υπόλοιπο που δεν ταιριάζει με τις κινήσεις', 'Πορτοφόλι', $q$
      select u.id as ref, u.id as uid from users u
       where not in_test_world(u.id)
         and u.wallet_balance <> coalesce((select sum(amount) from wallet_transactions t
                                            where t.user_id = u.id and t.unit = 'credit'), 0)$q$),
    ('negative_wallet', 'Αρνητικό υπόλοιπο', 'Πορτοφόλι', $q$
      select id as ref, id as uid from users where wallet_balance < 0 and not in_test_world(id)$q$),
    ('paid_request_no_pings', 'Πληρωμένο αίτημα που δεν έφτασε σε κανέναν επαγγελματία', 'Αιτήματα', $q$
      select r.id as ref, r.client_id as uid from booking_requests r
       where r.status = 'open' and r.fee_paid_at is not null
         and not exists (select 1 from booking_request_pings p where p.booking_request_id = r.id)
         and not in_test_world(r.client_id)$q$),
    ('request_not_expired', 'Αίτημα που έπρεπε να έχει λήξει και είναι ακόμα ανοιχτό', 'Αιτήματα', $q$
      select id as ref, client_id as uid from booking_requests
       where status = 'open' and expires_at < now() - interval '1 hour' and not in_test_world(client_id)$q$),
    ('booking_not_completed', 'Κράτηση που τελείωσε αλλά δεν έκλεισε', 'Κρατήσεις', $q$
      select id as ref, client_id as uid from bookings
       where status = 'confirmed' and end_date < current_date - 1 and not in_test_world(client_id)$q$),
    ('replacement_stuck', 'Ακύρωση επαγγελματία χωρίς αντικατάσταση ή πρόταση για πάνω από 24 ώρες', 'Αντικαταστάσεις', $q$
      select b.id as ref, b.client_id as uid from bookings b
       where b.status = 'cancelled_by_skipper' and b.start_date >= current_date
         and b.replacement_closed_at is null
         and coalesce(b.cancelled_at, b.created_at) < now() - interval '24 hours'
         and not exists (select 1 from bookings r where r.trip_root_id = b.trip_root_id and r.status in ('confirmed', 'completed'))
         and not exists (select 1 from bookings r where r.replaces_booking_id = b.id)
         and not exists (select 1 from booking_requests o where o.replaces_booking_id = b.id and o.status = 'open')
         and not in_test_world(b.client_id)$q$),
    ('delivery_not_expired', 'Αίτημα μεταφοράς που έπρεπε να έχει λήξει', 'Μεταφορές', $q$
      select rr.id as ref, d.client_id as uid from delivery_role_requests rr
        join delivery_requests d on d.id = rr.delivery_request_id
       where rr.status = 'open' and rr.expires_at < now() - interval '1 hour' and not in_test_world(d.client_id)$q$),
    ('purchase_waiting', 'Αίτημα αγοράς credits σε αναμονή πάνω από 2 μέρες', 'Credits', $q$
      select id as ref, user_id as uid from credit_purchase_requests
       where status = 'pending' and created_at < now() - interval '48 hours' and not in_test_world(user_id)$q$),
    ('approval_waiting', 'Επαγγελματίας σε αναμονή έγκρισης πάνω από 3 μέρες', 'Εγκρίσεις', $q$
      select sp.id as ref, sp.user_id as uid from skipper_profiles sp join users u on u.id = sp.user_id
       where sp.approval_status = 'pending' and sp.deleted_at is null and u.status <> 'deleted'
         and sp.created_at < now() - interval '3 days' and not in_test_world(sp.user_id)
      union all
      select r.id, sp.user_id from skipper_secondary_roles r join skipper_profiles sp on sp.id = r.skipper_id
       where r.approval_status = 'pending' and r.deleted_at is null
         and r.created_at < now() - interval '3 days' and not in_test_world(sp.user_id)$q$),
    ('unverified_account', 'Λογαριασμός χωρίς επιβεβαίωση πάνω από 3 μέρες', 'Εγκρίσεις', $q$
      select id as ref, id as uid from users
       where phone_verified_at is null and status = 'active' and role <> 'admin'
         and created_at < now() - interval '3 days' and not in_test_world(id)$q$),
    ('email_failed', 'Email ειδοποίησης που δεν στάλθηκε (7 ημέρες)', 'Email', $q$
      select id as ref, user_id as uid from notifications
       where (email_status = 'failed' and created_at > now() - interval '7 days')
          or (email_status = 'sending' and created_at < now() - interval '2 hours')$q$)
  ) v(code, title, area, q) loop
    execute format('select count(*)::int, count(distinct uid)::int,
                           (select jsonb_agg(ref) from (select ref from (%s) s2 limit 5) s3)
                      from (%s) s', c.q, c.q)
      into v_count, v_users, v_sample;
    v_fp := 'data:' || c.code;
    if v_count > 0 then
      perform health_touch(v_fp, 'data', c.code, c.title, c.area, v_count, v_users, jsonb_build_object('ids', v_sample), false);
      v_open := v_open + 1;
    else
      update health_issues set status = 'resolved', resolved_at = now(), resolved_by = null,
                               occurrences = 0, affected_users = 0
       where fingerprint = v_fp and status = 'open';
    end if;
  end loop;

  -- Καθαριότητα: γεγονότα 90 ημερών· θέματα εφαρμογής λυμένα και σιωπηλά 90 μέρες.
  delete from health_events where created_at < now() - interval '90 days';
  delete from health_issues where source = 'app' and status = 'resolved' and last_seen < now() - interval '90 days';

  return jsonb_build_object('data_issues_open', v_open, 'checked_at', now());
end;
$$;
revoke execute on function run_health_checks() from public, anon, authenticated;
grant execute on function run_health_checks() to service_role;

-- ---------------------------------------------------------------------------
-- Για τον ιδιοκτήτη.
-- ---------------------------------------------------------------------------
create or replace function admin_health_issues(p_include_resolved boolean default false)
returns setof health_issues
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  return query
    select * from health_issues
     where p_include_resolved or status = 'open'
     order by (status = 'open') desc, (source = 'data') desc, last_seen desc
     limit 200;
end;
$$;
revoke execute on function admin_health_issues(boolean) from public, anon;
grant execute on function admin_health_issues(boolean) to authenticated;

-- «Λύθηκε»: αν ξαναφανεί (έλεγχος ή σφάλμα), ανοίγει ξανά και ειδοποιεί.
create or replace function admin_resolve_health_issue(p_fingerprint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  update health_issues set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
   where fingerprint = p_fingerprint and status = 'open';
  if not found then raise exception 'issue_not_open'; end if;
end;
$$;
revoke execute on function admin_resolve_health_issue(text) from public, anon;
grant execute on function admin_resolve_health_issue(text) to authenticated;

create or replace function admin_run_health_checks() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  return run_health_checks();
end;
$$;
revoke execute on function admin_run_health_checks() from public, anon;
grant execute on function admin_run_health_checks() to authenticated;

-- Κάθε ώρα, μέσα στη βάση (όπως οι προθεσμίες, 0100).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or current_setting('cron.database_name', true) is distinct from current_database() then
    raise notice 'pg_cron not available in this database — health checks not scheduled';
    return;
  end if;
  create extension if not exists pg_cron;
  perform cron.schedule('platform-health-checks', '17 * * * *', 'select public.run_health_checks()');
end;
$$;

-- Μετρητής για το μενού της διαχείρισης.
CREATE OR REPLACE FUNCTION public.admin_overview()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                           where unit = 'credit' and type in ('request_fee','claim_fee') and created_at > now() - interval '30 days'),
    'fees_all_time',      (select coalesce(-sum(amount), 0) from wallet_transactions
                           where unit = 'credit' and type in ('request_fee','claim_fee')),
    'refunds_30d',        (select coalesce(sum(amount), 0) from wallet_transactions
                           where unit = 'credit' and type = 'refund_credit' and created_at > now() - interval '30 days'),
    'sales_eur_30d',      (select coalesce(sum(price_eur), 0) from wallet_transactions
                           where type = 'purchase' and created_at > now() - interval '30 days'),
    'sales_eur_all_time', (select coalesce(sum(price_eur), 0) from wallet_transactions where type = 'purchase'),
    'credit_purchases_pending', (select count(*) from credit_purchase_requests where status = 'pending'),
    'credits_sold_30d',   (select coalesce(sum(amount), 0) from wallet_transactions
                           where type = 'purchase' and created_at > now() - interval '30 days'),
    'pending_verification', (select count(*) from users
                             where phone_verified_at is null and status <> 'deleted' and role <> 'admin'),
    'pending_photos',   (select count(*) from users
                         where photo_url is not null and photo_reviewed_at is null and status <> 'deleted'),
    'suspended_count', (select count(*) from users where status = 'suspended'),
    'health_open', (select count(*) from health_issues where status = 'open')
  ) end;$function$;
