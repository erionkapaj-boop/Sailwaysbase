-- ============================================================================
-- Φόρμα επικοινωνίας: τα μηνύματα καταλήγουν στον χώρο του διαχειριστή.
--
-- Η φόρμα είναι δημόσια (ένας επισκέπτης χωρίς λογαριασμό πρέπει να μπορεί να
-- ρωτήσει κάτι, και ο ΓΚΠΔ απαιτεί δίοδο επικοινωνίας ακόμη και για κάποιον
-- που έχασε την πρόσβαση στον λογαριασμό του). Γι' αυτό η υποβολή γίνεται
-- μέσω security definer συνάρτησης με έλεγχο εγκυρότητας, και ΟΧΙ με απευθείας
-- insert policy — έτσι κανείς δεν μπορεί να γράψει αυθαίρετα πεδία
-- (π.χ. status, handled_by) ούτε να διαβάσει τον πίνακα.
-- ============================================================================

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  -- Συμπληρώνεται μόνο όταν ο αποστολέας είναι συνδεδεμένος. Σε διαγραφή
  -- λογαριασμού το μήνυμα μένει αλλά αποσυνδέεται από το πρόσωπο.
  user_id uuid references users(id) on delete set null,
  name text not null,
  contact text not null,
  topic text not null,
  message text not null,
  status text not null default 'new',
  admin_note text,
  handled_by uuid references users(id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contact_messages_status_chk check (status in ('new', 'handled')),
  constraint contact_messages_topic_chk
    check (topic in ('general', 'booking', 'payment', 'report', 'privacy', 'other')),
  constraint contact_messages_len_chk check (
    char_length(name) between 2 and 120
    and char_length(contact) between 3 and 160
    and char_length(message) between 10 and 4000
  )
);

create index if not exists contact_messages_status_idx
  on contact_messages (status, created_at desc);

alter table contact_messages enable row level security;

-- Κανένα policy για anon/authenticated: ο πίνακας διαβάζεται μόνο από
-- διαχειριστές, μέσω της admin_list_contact_messages παρακάτω.
drop policy if exists "admin reads contact messages" on contact_messages;
create policy "admin reads contact messages" on contact_messages
  for select using (is_admin());

-- ----------------------------------------------------------------------------
-- Υποβολή. Καλείται και από μη συνδεδεμένο επισκέπτη.
-- ----------------------------------------------------------------------------
create or replace function submit_contact_message(
  p_name text,
  p_contact text,
  p_topic text,
  p_message text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_recent int;
  v_admin record;
begin
  p_name := btrim(coalesce(p_name, ''));
  p_contact := btrim(coalesce(p_contact, ''));
  p_message := btrim(coalesce(p_message, ''));
  p_topic := coalesce(nullif(btrim(p_topic), ''), 'general');

  if char_length(p_name) < 2 or char_length(p_name) > 120 then
    raise exception 'invalid_name';
  end if;
  if char_length(p_contact) < 3 or char_length(p_contact) > 160 then
    raise exception 'invalid_contact';
  end if;
  if char_length(p_message) < 10 or char_length(p_message) > 4000 then
    raise exception 'invalid_message';
  end if;
  if p_topic not in ('general', 'booking', 'payment', 'report', 'privacy', 'other') then
    raise exception 'invalid_topic';
  end if;

  -- Φραγή πλημμύρας για συνδεδεμένους. Για ανώνυμους δεν υπάρχει ταυτότητα να
  -- μετρηθεί εδώ — εκεί προστατεύουν τα όρια μήκους και ο έλεγχος στη φόρμα.
  if v_uid is not null then
    select count(*) into v_recent
      from contact_messages
      where user_id = v_uid and created_at > now() - interval '1 hour';
    if v_recent >= 5 then
      raise exception 'too_many_messages';
    end if;
  end if;

  insert into contact_messages (user_id, name, contact, topic, message)
    values (v_uid, p_name, p_contact, p_topic, p_message);

  -- Ο διαχειριστής το βλέπει σαν κάθε άλλη ειδοποίηση, χωρίς να χρειάζεται να
  -- ανοίγει τη σελίδα για να ελέγξει αν ήρθε κάτι.
  for v_admin in select id from users where role = 'admin' or is_staff_admin loop
    perform notify_user(
      v_admin.id,
      'contact_message',
      jsonb_build_object('topic', p_topic, 'name', p_name),
      '/platform/admin/messages'
    );
  end loop;
end;
$$;
grant execute on function submit_contact_message(text, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Ανάγνωση και διαχείριση από τον admin.
-- ----------------------------------------------------------------------------
create or replace function admin_list_contact_messages(p_status text default null)
returns setof contact_messages
language sql stable security definer set search_path = public as $$
  select * from contact_messages
  where is_admin()
    and (p_status is null or status = p_status)
  order by case when status = 'new' then 0 else 1 end, created_at desc
  limit 300;
$$;
grant execute on function admin_list_contact_messages(text) to authenticated;

create or replace function admin_set_contact_message_status(
  p_id uuid,
  p_status text,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('new', 'handled') then raise exception 'invalid_status'; end if;

  update contact_messages set
    status = p_status,
    admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note),
    handled_by = case when p_status = 'handled' then auth.uid() else null end,
    handled_at = case when p_status = 'handled' then now() else null end
  where id = p_id;
end;
$$;
grant execute on function admin_set_contact_message_status(uuid, text, text) to authenticated;

-- Ο μετρητής μπαίνει στην επισκόπηση, ώστε το μενού του admin να δείχνει
-- σήμα όταν υπάρχει αναπάντητο μήνυμα — ίδιο μοτίβο με εγκρίσεις/διαφορές.
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
                             and not skipper_is_search_visible(sp.id))
  ) end;
$$;
