-- ============================================================================
-- Backing for the admin console.
--
-- The admin screen was a row of tabs over four independent lists, each fetched
-- whole and read top to bottom. That works while there are five bookings. It
-- stops working the moment the question becomes "what needs me today", which
-- is the only question an operations screen actually has to answer.
--
-- Three things are added here:
--   * one call that returns every headline figure, so the overview is a single
--     round trip rather than six list queries the page then counts client-side
--   * a resolved state on cancellation reports, so disputes are a queue that
--     empties instead of an append-only log
--   * settings become editable, since fees and expiry windows are exactly the
--     numbers an operator needs to change without a deploy
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Disputes become a queue.
-- ----------------------------------------------------------------------------
alter table cancellation_reports add column if not exists resolved_at timestamptz;
alter table cancellation_reports add column if not exists resolved_by uuid references users(id);
alter table cancellation_reports add column if not exists resolution_note text;

create index if not exists cancellation_reports_open_idx
  on cancellation_reports (created_at desc) where resolved_at is null;

create or replace function admin_resolve_report(p_report_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  update cancellation_reports
  set resolved_at = now(), resolved_by = auth.uid(), resolution_note = p_note
  where id = p_report_id and resolved_at is null;

  if not found then raise exception 'report_not_open'; end if;

  insert into admin_actions (admin_id, action_type, notes)
  values (auth.uid(), 'resolve_dispute', p_note);
end;
$$;
grant execute on function admin_resolve_report(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Settings an operator can change without waiting for a deploy.
-- ----------------------------------------------------------------------------
create or replace function admin_update_setting(p_key text, p_value numeric)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_value is null or p_value < 0 then raise exception 'invalid_value'; end if;

  update platform_settings set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'unknown_setting'; end if;
end;
$$;
grant execute on function admin_update_setting(text, numeric) to authenticated;

create or replace function admin_list_settings()
returns setof platform_settings
language sql stable security definer set search_path = public as $$
  select * from platform_settings where is_admin() order by key;
$$;
grant execute on function admin_list_settings() to authenticated;

-- ----------------------------------------------------------------------------
-- Every headline figure in one call.
--
-- Returned as jsonb rather than a wide row so adding a figure later is a
-- change to this function alone — no signature to keep in step with the page,
-- and no migration needed on the client to start reading it.
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

    'requests_open',      (select count(*) from booking_requests where status = 'open'),
    'requests_unclaimed_7d', (select count(*) from booking_requests
                              where status = 'expired_unclaimed' and created_at > now() - interval '7 days'),

    'bookings_confirmed', (select count(*) from bookings where status = 'confirmed'),
    'bookings_upcoming',  (select count(*) from bookings where status = 'confirmed' and start_date >= current_date),
    'bookings_completed', (select count(*) from bookings where status = 'completed'),
    'bookings_cancelled_30d', (select count(*) from bookings
                               where status in ('cancelled_by_client','cancelled_by_skipper')
                                 and created_at > now() - interval '30 days'),

    -- Money the platform is holding on behalf of users, split by side. Not
    -- revenue — these are liabilities, and an operator confusing the two is
    -- the sort of mistake this screen exists to prevent.
    'wallet_clients',     (select coalesce(sum(wallet_balance), 0) from client_profiles),
    'wallet_pros',        (select coalesce(sum(wallet_balance), 0) from skipper_profiles),

    -- Fees actually collected: negative amounts on the ledger are money that
    -- left a user and stayed with the platform.
    'fees_30d',           (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee') and created_at > now() - interval '30 days'),
    'fees_all_time',      (select coalesce(-sum(amount), 0) from wallet_transactions
                           where type in ('request_fee','claim_fee')),
    'refunds_30d',        (select coalesce(sum(amount), 0) from wallet_transactions
                           where type = 'refund_credit' and created_at > now() - interval '30 days'),

    'profiles_invisible', (select count(*) from skipper_profiles sp
                           where sp.approval_status = 'approved' and sp.deleted_at is null
                             and not has_future_availability(sp.id))
  ) end;
$$;
grant execute on function admin_overview() to authenticated;

-- Recent activity across the platform, for the overview's timeline.
create or replace function admin_recent_activity(p_limit int default 20)
returns table(kind text, at timestamptz, label text, detail text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'booking'::text, b.created_at, coalesce(p.name, 'Κράτηση'),
           b.start_date::text || ' → ' || b.end_date::text
    from bookings b left join ports p on p.id = b.port_id
    where is_admin()
    union all
    select 'signup', u.created_at, coalesce(u.full_name, u.phone_number), u.role::text
    from users u where is_admin() and u.role <> 'admin'
    union all
    select 'dispute', cr.created_at, 'Αναφορά ακύρωσης', cr.reason
    from cancellation_reports cr where is_admin()
  ) t(kind, at, label, detail)
  order by at desc
  limit p_limit;
$$;
grant execute on function admin_recent_activity(int) to authenticated;
