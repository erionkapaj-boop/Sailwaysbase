-- ============================================================================
-- Ειδοποιήσεις στο κινητό (push).
--
-- Η εφαρμογή εγκαθίσταται από τον browser (PWA) και ο χρήστης επιτρέπει
-- ειδοποιήσεις. Κάθε συσκευή αποθηκεύεται στο push_subscriptions. Ό,τι θέλει
-- δράση φτάνει στο κινητό σαν μήνυμα: με σβηστή οθόνη, με ήχο και δόνηση.
--
-- Δύο πηγές γεμίζουν την ουρά push_outbox:
--   - κάθε νέα ειδοποίηση (πίνακας notifications), με δικό της κείμενο·
--   - κάθε νέο μήνυμα μέσα σε κράτηση (πίνακας messages), προς τον άλλο
--     συμμετέχοντα. Το περιεχόμενο του μηνύματος ΔΕΝ μπαίνει στην ουρά
--     (φαίνεται στην οθόνη κλειδώματος).
--
-- Η αποστολή γίνεται από το /api/platform/push. Η βάση το καλεί αμέσως όταν
-- υπάρχουν οι ρυθμίσεις push_config (url + secret, pg_net)· αλλιώς, ή αν
-- χαθεί η κλήση, το παίρνει ο cron κάθε λεπτό από την ουρά.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Συσκευές. Ένας χρήστης μπορεί να έχει πολλές· μία συσκευή ανήκει σε έναν.
-- ---------------------------------------------------------------------------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;
revoke all on push_subscriptions from anon, authenticated;

-- Ο χρήστης ενεργοποιεί τη συσκευή του. Αν η ίδια συσκευή ήταν συνδεδεμένη με
-- άλλο λογαριασμό (κοινό κινητό), περνά στον τωρινό: οι ειδοποιήσεις του
-- προηγούμενου δεν πρέπει να εμφανίζονται σε κάποιον άλλον.
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(coalesce(p_endpoint, '')) not between 20 and 1000
     or char_length(coalesce(p_p256dh, '')) not between 20 and 200
     or char_length(coalesce(p_auth, '')) not between 8 and 100 then
    raise exception 'invalid_value';
  end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
    on conflict (endpoint) do update
      set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
          user_agent = excluded.user_agent, created_at = now();
end;
$$;
revoke execute on function save_push_subscription(text, text, text, text) from public, anon;
grant execute on function save_push_subscription(text, text, text, text) to authenticated;

create or replace function remove_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;
revoke execute on function remove_push_subscription(text) from public, anon;
grant execute on function remove_push_subscription(text) to authenticated;

-- Είναι η συσκευή αυτή ενεργή για τον τωρινό χρήστη;
create or replace function push_subscription_active(p_endpoint text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid());
$$;
revoke execute on function push_subscription_active(text) from public, anon;
grant execute on function push_subscription_active(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Η ουρά.
-- ---------------------------------------------------------------------------
create table if not exists push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  link text,
  notification_id uuid references notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  status text,           -- null = περιμένει · sending · sent · και οι λόγοι που δεν στάλθηκε
  claimed_at timestamptz,
  attempts int not null default 0
);
create index if not exists push_outbox_queue_idx on push_outbox (created_at)
  where status is null or status = 'sending';
alter table push_outbox enable row level security;
revoke all on push_outbox from anon, authenticated;

-- Νέα ειδοποίηση → ουρά.
create or replace function enqueue_push_from_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into push_outbox (user_id, kind, data, link, notification_id)
    values (new.user_id, new.kind, new.data, new.link, new.id);
  return null;
end;
$$;
drop trigger if exists trg_push_from_notification on notifications;
create trigger trg_push_from_notification
  after insert on notifications
  for each row execute function enqueue_push_from_notification();

-- Νέο μήνυμα σε κράτηση → ουρά, για τον άλλο συμμετέχοντα.
create or replace function enqueue_push_from_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_client uuid; v_pro uuid; v_to uuid;
begin
  select b.client_id, sp.user_id into v_client, v_pro
    from bookings b join skipper_profiles sp on sp.id = b.skipper_id
   where b.id = new.booking_id;
  v_to := case when new.sender_id = v_client then v_pro when new.sender_id = v_pro then v_client end;
  if v_to is null then return null; end if;
  insert into push_outbox (user_id, kind, data, link)
    values (v_to, 'message_received', jsonb_build_object('booking_id', new.booking_id),
            '/platform/bookings?focus=' || new.booking_id::text);
  return null;
end;
$$;
drop trigger if exists trg_push_from_message on messages;
create trigger trg_push_from_message
  after insert on messages
  for each row execute function enqueue_push_from_message();

-- Δοκιμαστική ειδοποίηση προς τις δικές μου συσκευές (κουμπί στο προφίλ).
create or replace function send_test_push() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from push_subscriptions where user_id = auth.uid()) then raise exception 'no_device'; end if;
  if exists (select 1 from push_outbox where user_id = auth.uid() and kind = 'push_test' and created_at > now() - interval '20 seconds') then
    raise exception 'too_soon';
  end if;
  insert into push_outbox (user_id, kind, link) values (auth.uid(), 'push_test', '/platform/profile');
end;
$$;
revoke execute on function send_test_push() from public, anon;
grant execute on function send_test_push() to authenticated;

-- ---------------------------------------------------------------------------
-- Ρυθμίσεις της άμεσης κλήσης (τις βάζει ο ιδιοκτήτης με SQL, δεν φαίνονται σε
-- κανέναν άλλον): 'url' = https://το-domain/api/platform/push, 'secret' = CRON_SECRET.
-- ---------------------------------------------------------------------------
create table if not exists push_config (key text primary key, value text not null);
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;

-- Μόλις μπει μια γραμμή στην ουρά, ξυπνά η αποστολή. Αν δεν υπάρχει pg_net ή
-- ρυθμίσεις, δεν γίνεται τίποτα (το παίρνει ο cron). Ποτέ δεν χαλά την εγγραφή.
create or replace function wake_push_sender() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  begin
    select value into v_url from push_config where key = 'url';
    select value into v_secret from push_config where key = 'secret';
    if v_url is not null and v_secret is not null and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
        body := '{}'::jsonb);
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;
drop trigger if exists trg_wake_push_sender on push_outbox;
create trigger trg_wake_push_sender
  after insert on push_outbox
  for each statement execute function wake_push_sender();

-- ---------------------------------------------------------------------------
-- Παίρνει όσα περιμένουν (skip locked: δύο ταυτόχρονες εκτελέσεις δεν στέλνουν
-- το ίδιο). Αποφασίζει ανά γραμμή:
--   read_in_app — η ειδοποίηση διαβάστηκε ήδη στην εφαρμογή
--   inactive    — ο λογαριασμός δεν είναι ενεργός
--   no_device   — ο χρήστης δεν έχει ενεργή συσκευή
--   too_old     — πάνω από 1 μέρα
--   sending     — επιστρέφεται για αποστολή· αν δεν επιβεβαιωθεί σε 5 λεπτά,
--                 ξαναδοκιμάζεται (έως 3 φορές)
-- ---------------------------------------------------------------------------
create or replace function claim_push_outbox(p_limit int default 200)
returns table (id uuid, user_id uuid, kind text, data jsonb, link text, created_at timestamptz, locale text, unread int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with candidates as (
    select o.id from push_outbox o
     where (o.status is null or (o.status = 'sending' and o.claimed_at < now() - interval '5 minutes'))
     order by o.created_at
     limit p_limit
     for update of o skip locked
  ),
  decided as (
    update push_outbox o set
      claimed_at = now(),
      attempts = o.attempts + 1,
      status = case
        when o.attempts >= 3 then 'failed'
        when o.created_at < now() - interval '1 day' then 'too_old'
        when o.notification_id is not null and exists (select 1 from notifications n where n.id = o.notification_id and n.read_at is not null) then 'read_in_app'
        when u.status <> 'active' then 'inactive'
        when not exists (select 1 from push_subscriptions s where s.user_id = o.user_id) then 'no_device'
        else 'sending' end
      from candidates c, users u
     where o.id = c.id and u.id = o.user_id
    returning o.id, o.user_id, o.status, o.kind, o.data, o.link, o.created_at
  )
  select d.id, d.user_id, d.kind, d.data, d.link, d.created_at, u.locale,
         (select count(*)::int from notifications n where n.user_id = d.user_id and n.read_at is null)
    from decided d join users u on u.id = d.user_id
   where d.status = 'sending';
end;
$$;
revoke execute on function claim_push_outbox(int) from public, anon, authenticated;
grant execute on function claim_push_outbox(int) to service_role;

-- Η αποστολή ανακοινώνει το αποτέλεσμα: 'sent', ή 'retry' (ξαναδοκιμάζεται), ή λόγο.
create or replace function finish_push_outbox(p_ids uuid[], p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update push_outbox set status = case when p_status = 'retry' then null else left(p_status, 40) end
   where id = any(p_ids) and status = 'sending';
end;
$$;
revoke execute on function finish_push_outbox(uuid[], text) from public, anon, authenticated;
grant execute on function finish_push_outbox(uuid[], text) to service_role;

-- Ό,τι δεν χρειάζεται πια (πάνω από 7 μέρες) σβήνεται, για να μη μεγαλώνει ο πίνακας.
create or replace function purge_push_outbox() returns int
language sql security definer set search_path = public as $$
  with d as (delete from push_outbox where created_at < now() - interval '7 days' returning 1) select count(*)::int from d;
$$;
revoke execute on function purge_push_outbox() from public, anon, authenticated;
grant execute on function purge_push_outbox() to service_role;
