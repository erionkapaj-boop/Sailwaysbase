-- ============================================================================
-- Community, βήμα 4: διαχείριση (απόφαση ιδιοκτήτη 17/10/2026).
--
--   1. admin_community_list_reports: πλουσιότερη λίστα αναφορών (σημεία και μηνύματα): το περιεχόμενο όπως ήταν
--      (και αν έχει ήδη διαγραφεί), η ομάδα του μηνύματος, ο συντάκτης και αν είναι ήδη περιορισμένος.
--   2. admin_community_list_groups: οι ομάδες με μέλη και ανοιχτές αναφορές (κλείσιμο/άνοιγμα από την οθόνη).
--   3. admin_community_list_restrictions: ενεργοί περιορισμοί μελών (άρση).
--   4. admin_overview: νέος μετρητής community_reports_open για το μενού διαχείρισης.
-- Δεν υπάρχει αυτόματη απόκρυψη μετά από αριθμό αναφορών: μόνο άνθρωπος της διαχείρισης αποφασίζει.
-- ============================================================================

drop function if exists admin_community_list_reports(text);
create function admin_community_list_reports(p_status text default 'open')
returns table (
  id uuid, target_type text, point_id uuid, message_id uuid, group_id uuid, group_name text, group_name_en text, group_status text,
  reporter_id uuid, reporter_name text, reason text, note text, status text, created_at timestamptz, resolved_at timestamptz,
  target_author_id uuid, target_author_name text, target_category text, target_title text, target_body text, target_removed boolean,
  author_restricted_until timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select r.id, r.target_type, r.point_id, r.message_id, g.id, g.name, g.name_en, g.status,
           r.reporter_id, (select u.full_name from users u where u.id = r.reporter_id),
           r.reason, r.note, r.status, r.created_at, r.resolved_at,
           coalesce(p.author_id, m.author_id),
           (select u.full_name from users u where u.id = coalesce(p.author_id, m.author_id)),
           p.category,
           p.title,
           case when r.target_type = 'point' then p.description else m.body end,
           coalesce(p.status = 'removed', m.deleted_at is not null, false),
           (select cr.until from community_restrictions cr where cr.user_id = coalesce(p.author_id, m.author_id) and cr.until > now())
      from community_reports r
      left join community_points p on p.id = r.point_id
      left join community_messages m on m.id = r.message_id
      left join community_groups g on g.id = m.group_id
     where p_status is null
        or (p_status = 'open' and r.status = 'open')
        or (p_status = 'closed' and r.status <> 'open')
        or r.status = p_status
     order by r.created_at desc
     limit 200;
end;
$$;
revoke execute on function admin_community_list_reports(text) from public, anon;
grant execute on function admin_community_list_reports(text) to authenticated;

create or replace function admin_community_list_groups()
returns table (id uuid, slug text, name text, name_en text, status text, closed_reason text, member_count int, message_count int, open_reports int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select g.id, g.slug, g.name, g.name_en, g.status, g.closed_reason,
           (select count(*)::int from community_group_members m where m.group_id = g.id),
           (select count(*)::int from community_messages x where x.group_id = g.id and x.deleted_at is null),
           (select count(*)::int from community_reports r join community_messages x on x.id = r.message_id
             where x.group_id = g.id and r.status = 'open')
      from community_groups g
     order by g.sort_order, g.name;
end;
$$;
revoke execute on function admin_community_list_groups() from public, anon;
grant execute on function admin_community_list_groups() to authenticated;

create or replace function admin_community_list_restrictions()
returns table (user_id uuid, user_name text, until timestamptz, reason text, set_by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select cr.user_id, (select u.full_name from users u where u.id = cr.user_id), cr.until, cr.reason,
           (select u.full_name from users u where u.id = cr.set_by), cr.created_at
      from community_restrictions cr
     where cr.until > now()
     order by cr.until;
end;
$$;
revoke execute on function admin_community_list_restrictions() from public, anon;
grant execute on function admin_community_list_restrictions() to authenticated;

-- Μετρητής για το μενού της διαχείρισης (ίδια συνάρτηση με το 0116 + community_reports_open).
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
    'health_open', (select count(*) from health_issues where status = 'open'),
    'community_reports_open', (select count(*) from community_reports where status = 'open')
  ) end;$function$;
