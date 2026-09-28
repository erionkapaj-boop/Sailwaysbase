-- ============================================================================
-- Αιτήματα αγοράς credits.
--
-- Ο χρήστης διαλέγει πακέτο (ή αριθμό credits) και στέλνει αίτημα· η τιμή
-- υπολογίζεται εδώ, από τις Ρυθμίσεις, ποτέ από τον browser. Κάθε αίτημα
-- έχει κωδικό (CR-XXXXXX) για να αναγνωρίζεται η πληρωμή. Ο ιδιοκτήτης το
-- επιβεβαιώνει όταν δει την πληρωμή και τα credits πιστώνονται· ή το
-- απορρίπτει. Ένα ανοιχτό αίτημα τη φορά ανά χρήστη.
--
-- Όταν συνδεθεί τράπεζα/πάροχος πληρωμών, την επιβεβαίωση θα την κάνει
-- αυτόματα το webhook με την ίδια συνάρτηση.
-- ============================================================================

create table if not exists credit_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  reference text not null unique,
  package_key text check (package_key in ('starter', 'professional', 'pro')),
  credits int not null check (credits > 0),
  price_eur numeric not null check (price_eur >= 0),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  cancelled_by text check (cancelled_by in ('user', 'admin')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references users(id) on delete set null,
  wallet_transaction_id uuid references wallet_transactions(id) on delete set null
);
create unique index if not exists credit_purchase_one_pending
  on credit_purchase_requests (user_id) where status = 'pending';
create index if not exists credit_purchase_status on credit_purchase_requests (status, created_at desc);

alter table credit_purchase_requests enable row level security;
revoke all on credit_purchase_requests from anon, authenticated;
grant select on credit_purchase_requests to authenticated;
drop policy if exists "purchase requests own or owner" on credit_purchase_requests;
create policy "purchase requests own or owner" on credit_purchase_requests for select
  using (user_id = auth.uid() or is_owner_admin());

-- Ειδοποιήσεις προς διαχειριστές: και ο ιδιοκτήτης χωρίς σημαία υπαλλήλου.
create or replace function notify_admins(p_kind text, p_data jsonb, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin record;
begin
  for v_admin in
    select id from users
    where (role = 'admin' or is_staff_admin or is_owner) and status not in ('deleted', 'suspended')
  loop
    perform notify_user(v_admin.id, p_kind, p_data, p_link);
  end loop;
end;
$$;

-- Μόνο προς τον ιδιοκτήτη (τα χρήματα δεν είναι δουλειά υπαλλήλου).
create or replace function notify_owners(p_kind text, p_data jsonb, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner record;
begin
  for v_owner in
    select id from users where (role = 'admin' or is_owner) and status not in ('deleted', 'suspended')
  loop
    perform notify_user(v_owner.id, p_kind, p_data, p_link);
  end loop;
end;
$$;
revoke execute on function notify_owners(text, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ο χρήστης στέλνει αίτημα: πακέτο ('starter' | 'professional' | 'pro'), ή
-- 'custom' με αριθμό credits στην τιμή του μεμονωμένου credit.
-- ---------------------------------------------------------------------------
create or replace function request_credit_purchase(p_package text, p_credits int default null)
returns credit_purchase_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_credits int;
  v_price numeric;
  v_ref text;
  v_row credit_purchase_requests%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from users where id = v_uid and status = 'active') then raise exception 'account_inactive'; end if;
  if exists (select 1 from credit_purchase_requests where user_id = v_uid and status = 'pending') then
    raise exception 'purchase_request_pending';
  end if;

  if p_package in ('starter', 'professional', 'pro') then
    v_credits := (select value from platform_settings where key = 'package_' || p_package || '_credits');
    v_price := (select value from platform_settings where key = 'package_' || p_package || '_price');
    if coalesce(v_credits, 0) <= 0 or v_price is null then raise exception 'invalid_package'; end if;
  elsif p_package = 'custom' then
    if p_credits is null or p_credits < 1 or p_credits > 100 then raise exception 'invalid_amount'; end if;
    v_credits := p_credits;
    v_price := p_credits * (select value from platform_settings where key = 'credit_price_eur');
    if v_price is null then raise exception 'invalid_package'; end if;
  else
    raise exception 'invalid_package';
  end if;

  loop
    v_ref := 'CR-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from credit_purchase_requests where reference = v_ref);
  end loop;

  insert into credit_purchase_requests (user_id, reference, package_key, credits, price_eur)
    values (v_uid, v_ref, nullif(p_package, 'custom'), v_credits, v_price)
    returning * into v_row;

  perform notify_owners('admin_credit_purchase',
    jsonb_build_object('name', (select full_name from users where id = v_uid), 'credits', v_credits,
                       'price', v_price, 'reference', v_ref),
    '/platform/admin/finance');
  return v_row;
end;
$$;
revoke execute on function request_credit_purchase(text, int) from public, anon;
grant execute on function request_credit_purchase(text, int) to authenticated;

-- Ο χρήστης ακυρώνει το δικό του ανοιχτό αίτημα.
create or replace function cancel_credit_purchase_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update credit_purchase_requests
     set status = 'cancelled', cancelled_by = 'user', handled_at = now()
   where id = p_request_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'request_not_pending'; end if;
end;
$$;
revoke execute on function cancel_credit_purchase_request(uuid) from public, anon;
grant execute on function cancel_credit_purchase_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Ο ιδιοκτήτης επιβεβαιώνει την πληρωμή: τα credits πιστώνονται μία φορά.
-- ---------------------------------------------------------------------------
create or replace function admin_complete_credit_purchase(p_request_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_req credit_purchase_requests%rowtype;
  v_balance numeric;
  v_txn uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  select * into v_req from credit_purchase_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.status <> 'pending' then raise exception 'request_not_pending'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + v_req.credits where id = v_req.user_id
    returning wallet_balance into v_balance;
  insert into wallet_transactions (user_id, type, amount, price_eur, note, created_by)
    values (v_req.user_id, 'purchase', v_req.credits, v_req.price_eur, v_req.reference, auth.uid())
    returning id into v_txn;
  update credit_purchase_requests
     set status = 'completed', handled_at = now(), handled_by = auth.uid(), wallet_transaction_id = v_txn
   where id = p_request_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'credit_wallet', v_req.user_id,
            'Αγορά ' || v_req.credits || ' credits (' || v_req.price_eur || '€) · ' || v_req.reference);
  return v_balance;
end;
$$;
revoke execute on function admin_complete_credit_purchase(uuid) from public, anon;

create or replace function admin_cancel_credit_purchase(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_req credit_purchase_requests%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  select * into v_req from credit_purchase_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.status <> 'pending' then raise exception 'request_not_pending'; end if;
  update credit_purchase_requests
     set status = 'cancelled', cancelled_by = 'admin', handled_at = now(), handled_by = auth.uid()
   where id = p_request_id;
  perform notify_user(v_req.user_id, 'credit_purchase_cancelled',
    jsonb_build_object('reference', v_req.reference, 'credits', v_req.credits), '/platform/wallet');
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'credit_wallet', v_req.user_id, 'Απόρριψη αιτήματος αγοράς · ' || v_req.reference);
end;
$$;
revoke execute on function admin_cancel_credit_purchase(uuid) from public, anon;

-- Ανοιχτά αιτήματα για τον ιδιοκτήτη, με όνομα και τηλέφωνο.
create or replace function admin_list_credit_purchases()
returns table (id uuid, user_id uuid, full_name text, phone_number text, reference text, package_key text,
               credits int, price_eur numeric, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  return query
    select r.id, r.user_id, u.full_name, u.phone_number, r.reference, r.package_key, r.credits, r.price_eur, r.created_at
      from credit_purchase_requests r join users u on u.id = r.user_id
     where r.status = 'pending'
     order by r.created_at;
end;
$$;
revoke execute on function admin_list_credit_purchases() from public, anon;

-- ---------------------------------------------------------------------------
-- Μετρητής για το μενού (Οικονομικά)
-- ---------------------------------------------------------------------------
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
    'suspended_count', (select count(*) from users where status = 'suspended')
  ) end;$function$;
