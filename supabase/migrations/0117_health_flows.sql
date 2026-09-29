-- ============================================================================
-- Υγεία εφαρμογής, Φάση 2: λούπες και εγκαταλείψεις.
--
--  - «Κολλάει»: ο ίδιος χρήστης πέφτει στην ίδια αποτυχία ξανά και ξανά,
--    πηγαινοέρχεται ανάμεσα σε δύο σελίδες χωρίς πρόοδο, ή ξαναφορτώνει τη
--    σελίδα συνεχώς. Το εντοπίζει ο browser και το στέλνει ως θέμα (kind
--    'stuck'), όπως τα σφάλματα της Φάσης 1.
--  - Ροές: οι βασικές διαδρομές (αίτημα, αγορά credits, εγγραφή,
--    διαθεσιμότητα, μεταφορά) καταγράφουν σε ποιο βήμα έφτασε κάθε
--    επίσκεψη. Όταν οι περισσότεροι σταματούν πριν το τέλος, ανοίγει θέμα με
--    το βήμα όπου σταματούν. Μόνο βήματα, χωρίς περιεχόμενο.
-- ============================================================================

alter table health_issues drop constraint if exists health_issues_source_check;
alter table health_issues add constraint health_issues_source_check check (source in ('data', 'app', 'flow'));

create table if not exists flow_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  session_id text not null,
  user_id uuid references users(id) on delete set null,
  flow text not null,
  step text not null
);
create index if not exists flow_events_created on flow_events (created_at);
create index if not exists flow_events_session on flow_events (session_id, flow);
alter table flow_events enable row level security;
revoke all on flow_events from public, anon, authenticated;

-- Οι ροές και τα βήματά τους, με τη σειρά. Νέα ροή = νέες γραμμές εδώ.
create or replace function flow_steps()
returns table (flow text, flow_label text, step text, step_label text, ord int)
language sql immutable as $$
  values
    ('request',      'Αποστολή αιτήματος',      'picked',    'διάλεξε επαγγελματίες', 1),
    ('request',      'Αποστολή αιτήματος',      'send',      'πάτησε αποστολή',        2),
    ('request',      'Αποστολή αιτήματος',      'done',      'στάλθηκε',               3),
    ('topup',        'Αγορά credits',           'open',      'άνοιξε την αγορά',       1),
    ('topup',        'Αγορά credits',           'done',      'έστειλε αίτημα αγοράς',  2),
    ('register',     'Εγγραφή',                 'open',      'άνοιξε την εγγραφή',     1),
    ('register',     'Εγγραφή',                 'submitted', 'έστειλε τα στοιχεία',    2),
    ('register',     'Εγγραφή',                 'done',      'λογαριασμός έτοιμος',    3),
    ('availability', 'Δήλωση διαθεσιμότητας',   'open',      'άνοιξε το παράθυρο',     1),
    ('availability', 'Δήλωση διαθεσιμότητας',   'done',      'αποθήκευσε',             2),
    ('delivery',     'Αίτημα μεταφοράς σκάφους', 'open',     'άνοιξε τη φόρμα',        1),
    ('delivery',     'Αίτημα μεταφοράς σκάφους', 'done',     'στάλθηκε',               2)
$$;
revoke execute on function flow_steps() from public, anon, authenticated;

-- Από τον browser, και ανώνυμα (εγγραφή). Μόνο γνωστά βήματα.
create or replace function track_flow(p_flow text, p_step text, p_session text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session text := left(regexp_replace(coalesce(p_session, ''), '[^A-Za-z0-9-]', '', 'g'), 40);
begin
  if length(v_session) < 8 then return; end if;
  if not exists (select 1 from flow_steps() f where f.flow = p_flow and f.step = p_step) then return; end if;
  if (select count(*) from flow_events where session_id = v_session and created_at > now() - interval '1 hour') >= 200 then return; end if;
  if v_uid is null and (select count(*) from flow_events where user_id is null and created_at > now() - interval '1 hour') >= 2000 then return; end if;
  -- Το ίδιο βήμα στην ίδια επίσκεψη μετρά μία φορά.
  if exists (select 1 from flow_events where session_id = v_session and flow = p_flow and step = p_step
              and created_at > now() - interval '1 day') then return; end if;
  insert into flow_events (session_id, user_id, flow, step) values (v_session, v_uid, p_flow, p_step);
end;
$$;
revoke execute on function track_flow(text, text, text) from public;
grant execute on function track_flow(text, text, text) to anon, authenticated;

-- Ανά ροή: πόσες επισκέψεις ξεκίνησαν, πόσες έφτασαν στο τέλος, και σε ποιο
-- βήμα σταματούν συνήθως όσες δεν έφτασαν.
create or replace function flow_stats(p_days int default 7)
returns table (flow text, flow_label text, started int, completed int, stop_step text)
language sql stable security definer set search_path = public as $$
  with steps as (select * from flow_steps()),
  last_ord as (select s.flow, max(s.ord) as final from steps s group by s.flow),
  reached as (
    select e.flow, e.session_id, max(s.ord) as ord
      from flow_events e join steps s on s.flow = e.flow and s.step = e.step
     where e.created_at > now() - make_interval(days => p_days)
     group by e.flow, e.session_id
  ),
  started as (
    select r.* from reached r
     where exists (select 1 from flow_events e join steps s on s.flow = e.flow and s.step = e.step
                    where e.session_id = r.session_id and e.flow = r.flow and s.ord = 1
                      and e.created_at > now() - make_interval(days => p_days))
  ),
  stops as (
    select st.flow, s.step_label, count(*) as n,
           row_number() over (partition by st.flow order by count(*) desc) as rk
      from started st join last_ord l on l.flow = st.flow
      join steps s on s.flow = st.flow and s.ord = st.ord
     where st.ord < l.final
     group by st.flow, s.step_label
  )
  select f.flow, f.flow_label,
         coalesce((select count(*) from started st where st.flow = f.flow), 0)::int,
         coalesce((select count(*) from started st join last_ord l on l.flow = st.flow
                    where st.flow = f.flow and st.ord = l.final), 0)::int,
         (select sp.step_label from stops sp where sp.flow = f.flow and sp.rk = 1)
    from (select distinct s.flow, s.flow_label from steps s) f
   order by f.flow;
$$;
revoke execute on function flow_stats(int) from public, anon, authenticated;

create or replace function admin_flow_stats(p_days int default 7)
returns table (flow text, flow_label text, started int, completed int, stop_step text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  return query select * from flow_stats(least(greatest(coalesce(p_days, 7), 1), 90));
end;
$$;
revoke execute on function admin_flow_stats(int) from public, anon;
grant execute on function admin_flow_stats(int) to authenticated;

-- Σφάλματα από τον browser: και «κολλάει» (0117).
create or replace function report_app_issue(p_kind text, p_code text, p_page text, p_detail text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_kind text := case when p_kind in ('error', 'crash', 'stuck') then p_kind else 'error' end;
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

  v_title := case
    when v_kind = 'crash' then 'Η σελίδα έσπασε'
    when v_kind = 'stuck' and v_code = 'pingpong' then 'Χρήστες πηγαινοέρχονται ανάμεσα σε δύο σελίδες'
    when v_kind = 'stuck' and v_code = 'reload_loop' then 'Χρήστες ξαναφορτώνουν τη σελίδα ξανά και ξανά'
    when v_kind = 'stuck' then 'Χρήστες κολλάνε: ίδια αποτυχία ξανά και ξανά'
    else 'Απρόβλεπτο σφάλμα' end;
  perform health_touch(v_fp, 'app', v_code, v_title, v_page, 1,
    (select count(distinct user_id)::int from health_events where fingerprint = v_fp and created_at > now() - interval '90 days'),
    jsonb_build_object('detail', nullif(v_detail, '')), true);
end;
$$;

revoke execute on function report_app_issue(text, text, text, text) from public;
grant execute on function report_app_issue(text, text, text, text) to anon, authenticated;

-- Έλεγχοι: και οι ροές (0117).
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

  -- Ροές (0117): πολλοί ξεκινούν και λίγοι ολοκληρώνουν, τις τελευταίες 7 μέρες.
  for c in select * from flow_stats(7) loop
    v_fp := 'flow:' || c.flow;
    if c.started >= 5 and c.completed::numeric / c.started < 0.5 then
      perform health_touch(v_fp, 'flow', c.flow, 'Πολλοί σταματούν: ' || c.flow_label, c.flow_label,
        c.started - c.completed, c.started - c.completed,
        jsonb_build_object('started', c.started, 'completed', c.completed, 'stop_step', c.stop_step), false);
      v_open := v_open + 1;
    else
      update health_issues set status = 'resolved', resolved_at = now(), resolved_by = null,
                               occurrences = 0, affected_users = 0
       where fingerprint = v_fp and status = 'open';
    end if;
  end loop;

  -- Καθαριότητα: γεγονότα 90 ημερών· θέματα εφαρμογής λυμένα και σιωπηλά 90 μέρες.
  delete from health_events where created_at < now() - interval '90 days';
  delete from flow_events where created_at < now() - interval '90 days';
  delete from health_issues where source = 'app' and status = 'resolved' and last_seen < now() - interval '90 days';

  return jsonb_build_object('data_issues_open', v_open, 'checked_at', now());
end;
$$;

revoke execute on function run_health_checks() from public, anon, authenticated;
grant execute on function run_health_checks() to service_role;
