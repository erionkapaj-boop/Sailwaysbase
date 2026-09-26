-- ============================================================================
-- Ειδοποιήσεις και με email.
--
-- Μέχρι τώρα κάθε ειδοποίηση ζούσε μόνο μέσα στην εφαρμογή: ένας skipper
-- μάθαινε για νέο αίτημα, ή ένας πελάτης ότι έχει 24 ώρες να διαλέξει
-- αντικαταστάτη, μόνο αν άνοιγε ο ίδιος την εφαρμογή.
--
-- Πώς δουλεύει:
--   - Κάθε λίγα λεπτά το /api/platform/notify-email ζητά από τη βάση τις
--     ειδοποιήσεις που περιμένουν email (claim_notification_emails). Όσες ο
--     χρήστης έχει ήδη δει στην εφαρμογή δεν στέλνονται. Όσες είναι για τον
--     ίδιο άνθρωπο φεύγουν μαζί σε ένα email.
--   - Το κείμενο είναι το ίδιο με της εφαρμογής (lib/platform/notifications.js).
--   - Κάθε χρήστης μπορεί να τα κλείσει από το προφίλ του (email_notifications).
--
-- Και: το email λειτουργεί πλέον και ως τρόπος επαναφοράς κωδικού, οπότε
-- δεν αλλάζει πια με απευθείας εγγραφή — μόνο από το προφίλ, με τον κωδικό
-- (/api/platform/account/change-email → apply_email_change).
-- ============================================================================

alter table users add column if not exists email_notifications boolean not null default true;

alter table notifications add column if not exists email_status text;
alter table notifications add column if not exists emailed_at timestamptz;

-- Ό,τι υπήρχε πριν από αυτό το migration δεν στέλνεται ποτέ.
update notifications set email_status = 'before_email' where email_status is null;

create index if not exists notifications_email_queue_idx on notifications (created_at)
  where email_status is null or email_status = 'sending';

-- ---------------------------------------------------------------------------
-- Η ουρά. Παίρνει μια φορά κάθε ειδοποίηση (skip locked: δύο ταυτόχρονες
-- εκτελέσεις δεν στέλνουν το ίδιο email) και αποφασίζει:
--   read_in_app — την είδε ήδη στην εφαρμογή
--   not_emailed — είδος που δεν στέλνεται με email (p_kinds)
--   no_email / opted_out / inactive — δεν έχει email, τα έκλεισε, ή ο
--                 λογαριασμός δεν είναι ενεργός
--   too_old     — πάνω από 2 μέρες (π.χ. αν η αποστολή ήταν κλειστή καιρό)
--   sending     — επιστρέφεται για αποστολή· αν δεν επιβεβαιωθεί σε 30 λεπτά
--                 ξαναδοκιμάζεται
-- ---------------------------------------------------------------------------
create or replace function claim_notification_emails(
  p_kinds text[], p_min_age interval default interval '2 minutes', p_limit int default 300)
returns table (id uuid, user_id uuid, email text, full_name text, kind text, data jsonb, link text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with candidates as (
    select n.id from notifications n
     where (n.email_status is null
            or (n.email_status = 'sending' and n.emailed_at < now() - interval '30 minutes'))
       and n.created_at < now() - p_min_age
     order by n.created_at
     limit p_limit
     for update of n skip locked
  ),
  decided as (
    update notifications n set
      emailed_at = now(),
      email_status = case
        when n.read_at is not null then 'read_in_app'
        when not (n.kind = any(p_kinds)) then 'not_emailed'
        when n.created_at < now() - interval '2 days' then 'too_old'
        when u.status <> 'active' then 'inactive'
        when not u.email_notifications then 'opted_out'
        when coalesce(btrim(u.email), '') = '' then 'no_email'
        else 'sending' end
      from candidates c, users u
     where n.id = c.id and u.id = n.user_id
    returning n.id, n.user_id, n.email_status, n.kind, n.data, n.link, n.created_at
  )
  select d.id, d.user_id, btrim(u.email), u.full_name, d.kind, d.data, d.link, d.created_at
    from decided d join users u on u.id = d.user_id
   where d.email_status = 'sending'
   order by d.user_id, d.created_at;
end;
$$;

create or replace function mark_notification_emails(p_ids uuid[], p_status text) returns void
language sql security definer set search_path = public as $$
  update notifications set email_status = p_status, emailed_at = now()
   where id = any(p_ids) and email_status = 'sending';
$$;

revoke execute on function claim_notification_emails(text[], interval, int) from public, anon, authenticated;
revoke execute on function mark_notification_emails(uuid[], text) from public, anon, authenticated;
grant execute on function claim_notification_emails(text[], interval, int) to service_role;
grant execute on function mark_notification_emails(uuid[], text) to service_role;

-- ---------------------------------------------------------------------------
-- Το email αλλάζει μόνο με τον κωδικό.
-- ---------------------------------------------------------------------------
create or replace function guard_users_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'client';
    new.status := 'active';
    new.is_test_account := false;
    new.is_staff_admin := false;
    new.wallet_balance := 0;
    new.phone_verified_at := null;
    new.photo_reviewed_at := null;
    new.deleted_at := null;
    new.deletion_reason := null;
    new.suspension_reason := null;
    return new;
  end if;
  new.role := old.role;
  new.status := old.status;
  new.is_test_account := old.is_test_account;
  new.is_staff_admin := old.is_staff_admin;
  new.wallet_balance := old.wallet_balance;
  new.phone_number := old.phone_number;
  new.email := old.email;
  new.photo_reviewed_at := old.photo_reviewed_at;
  new.phone_verified_at := old.phone_verified_at;
  new.deleted_at := old.deleted_at;
  new.deletion_reason := old.deletion_reason;
  new.suspension_reason := old.suspension_reason;
  return new;
end;
$$;

create or replace function apply_email_change(p_user_id uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := nullif(lower(btrim(p_email)), '');
begin
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;
  perform set_config('platform.trusted', 'true', true);
  update users set email = v_email where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
end;
$$;

revoke execute on function apply_email_change(uuid, text) from public, anon, authenticated;
grant execute on function apply_email_change(uuid, text) to service_role;
