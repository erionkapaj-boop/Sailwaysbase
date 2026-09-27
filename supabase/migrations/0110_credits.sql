-- ============================================================================
-- Credits αντί για ευρώ (docs/CREDITS.md).
--
-- Το υπόλοιπο (users.wallet_balance) και οι κινήσεις (wallet_transactions)
-- μετρούν πλέον credits. Τα τέλη στις Ρυθμίσεις (client_request_fee,
-- skipper_claim_fee) είναι credits· οι μεταφορές υπολογίζουν το ποσό σε € και
-- το μετατρέπουν σε credits με την τιμή του credit.
--
-- Τα παλιά ευρώ: κάθε υπόλοιπο γίνεται credits (/50, προς τα πάνω), και το
-- ίδιο κάθε τέλος που είναι καταγεγραμμένο σε αιτήματα και κρατήσεις. Το παλιό
-- ιστορικό κινήσεων μένει ως αρχείο με unit = 'eur' και κλείνει με μία κίνηση
-- μετατροπής. Ξανατρέχει με ασφάλεια: η μετατροπή γίνεται μόνο μία φορά.
-- ============================================================================

alter type wallet_txn_type add value if not exists 'purchase';

alter table wallet_transactions add column if not exists unit text not null default 'credit'
  check (unit in ('credit', 'eur'));
alter table wallet_transactions add column if not exists price_eur numeric check (price_eur is null or price_eur >= 0);

-- ---------------------------------------------------------------------------
-- Ρυθμίσεις
-- ---------------------------------------------------------------------------
insert into platform_settings (key, value) values
  ('credit_price_eur', 50),
  ('package_starter_credits', 2), ('package_starter_price', 90),
  ('package_professional_credits', 5), ('package_professional_price', 200),
  ('package_pro_credits', 10), ('package_pro_price', 350),
  ('signup_credits_professional', 2),
  ('signup_credits_client', 0)
on conflict (key) do nothing;

drop policy if exists "settings public keys readable" on platform_settings;
create policy "settings public keys readable" on platform_settings for select using (
  is_admin() or key in (
    'client_request_fee', 'skipper_claim_fee', 'otp_enabled', 'unclaimed_expiry_hours', 'delivery_expiry_hours',
    'delivery_min_fee', 'delivery_platform_fee_pct', 'delivery_skipper_rate_per_mile',
    'delivery_hostess_rate_per_mile', 'delivery_cook_rate_per_mile', 'delivery_deckhand_rate_per_mile',
    'pro_response_hours', 'credit_price_eur',
    'package_starter_credits', 'package_starter_price',
    'package_professional_credits', 'package_professional_price',
    'package_pro_credits', 'package_pro_price')
);

create or replace function admin_update_setting(p_key text, p_value numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_max numeric;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_value is null or p_value < 0 then raise exception 'invalid_value'; end if;

  v_max := case
    when p_key like '%\_enabled' then 1
    when p_key = 'cancel_full_rate' then 1
    when p_key like '%\_pct' then 100
    when p_key like 'cancel\_weight\_%' then 10
    when p_key like '%\_hours' then 720
    when p_key like '%\_days' then 365
    when p_key like '%\_months' then 120
    when p_key like '%\_rate\_per\_mile' then 100
    when p_key like '%\_price' or p_key = 'credit_price_eur' then 100000
    when p_key in ('client_request_fee', 'skipper_claim_fee') then 100
    when p_key like '%\_credits%' or p_key like 'signup\_credits\_%' then 1000
    when p_key like '%fee%' then 1000
    else 1000 end;
  if p_value > v_max then raise exception 'invalid_value'; end if;
  if p_key like '%\_enabled' and p_value not in (0, 1) then raise exception 'invalid_value'; end if;
  if p_key like '%\_hours' and p_value < 1 then raise exception 'invalid_value'; end if;
  if (p_key like '%credits%' or p_key in ('client_request_fee', 'skipper_claim_fee')) and p_value <> round(p_value) then
    raise exception 'invalid_value';
  end if;
  if p_key = 'credit_price_eur' and p_value < 1 then raise exception 'invalid_value'; end if;

  update platform_settings set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'unknown_setting'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Μετατροπή των ευρώ σε credits — μία φορά (σημάδι: η ρύθμιση credits_converted)
-- ---------------------------------------------------------------------------
do $$
declare v_rate numeric := 50;
begin
  if exists (select 1 from platform_settings where key = 'credits_converted') then return; end if;
  perform set_config('platform.trusted', 'true', true);
  alter table wallet_transactions disable trigger trg_notify_wallet_movement;

  -- Το παλιό ιστορικό μένει ως αρχείο σε ευρώ.
  update wallet_transactions set unit = 'eur';

  -- Κλείσιμο των ευρώ και άνοιγμα σε credits, για όποιον έχει υπόλοιπο.
  insert into wallet_transactions (user_id, type, amount, note, unit)
    select id, 'adjustment', -wallet_balance, 'Μετατροπή σε credits', 'eur'
      from users where wallet_balance <> 0;
  insert into wallet_transactions (user_id, type, amount, note, unit)
    select id, 'adjustment', ceil(wallet_balance / v_rate), 'Μετατροπή σε credits', 'credit'
      from users where wallet_balance > 0;
  update users set wallet_balance = case when wallet_balance > 0 then ceil(wallet_balance / v_rate) else 0 end
   where wallet_balance <> 0;

  -- Καταγεγραμμένα τέλη (για επιστροφές και ιστορικό).
  update booking_requests set fee_amount = ceil(fee_amount / v_rate) where fee_amount > 0;
  update booking_requests set claim_fee_amount = ceil(claim_fee_amount / v_rate) where claim_fee_amount > 0;
  update bookings set skipper_claim_fee_amount = ceil(skipper_claim_fee_amount / v_rate) where skipper_claim_fee_amount > 0;
  update delivery_role_requests set client_fee = ceil(client_fee / v_rate) where client_fee > 0;
  update delivery_role_requests set professional_fee = ceil(professional_fee / v_rate) where professional_fee > 0;
  update delivery_bookings set professional_fee_amount = ceil(professional_fee_amount / v_rate) where professional_fee_amount > 0;

  -- Τα τέλη στις Ρυθμίσεις γίνονται credits.
  update platform_settings set value = 1 where key in ('client_request_fee', 'skipper_claim_fee');

  alter table wallet_transactions enable trigger trg_notify_wallet_movement;
  insert into platform_settings (key, value) values ('credits_converted', 1);
end;
$$;

-- Ειδοποίηση μόνο για κινήσεις σε credits.
create or replace function notify_wallet_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.unit <> 'credit' or new.amount = 0 then return null; end if;
  perform notify_user(
    new.user_id, 'wallet',
    jsonb_build_object('amount', new.amount, 'txn_type', new.type),
    '/platform/wallet'
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Δώρο εγγραφής σε credits, από τις Ρυθμίσεις (χωρίς ημερομηνία λήξης)
-- ---------------------------------------------------------------------------
create or replace function apply_signup_bonus()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_bonus numeric;
begin
  if new.phone_verified_at is null or new.signup_bonus_at is not null then return null; end if;
  if tg_op = 'UPDATE' and old.phone_verified_at is not null then return null; end if;

  v_bonus := case new.role
    when 'client' then (select value from platform_settings where key = 'signup_credits_client')
    when 'skipper' then (select value from platform_settings where key = 'signup_credits_professional')
  end;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + coalesce(v_bonus, 0), signup_bonus_at = now() where id = new.id;
  if coalesce(v_bonus, 0) > 0 then
    insert into wallet_transactions (user_id, type, amount, note) values (new.id, 'deposit', v_bonus, 'Δώρο εγγραφής');
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Αγορά credits, καταχωρημένη από τον διαχειριστή (μέχρι να μπει πληρωμή με
-- κάρτα). Κρατά και το ποσό σε €, για λογιστική.
-- ---------------------------------------------------------------------------
create or replace function admin_record_purchase(p_user_id uuid, p_credits int, p_price_eur numeric, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_balance numeric;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_credit_self'; end if;
  if p_credits is null or p_credits <= 0 or p_credits > 1000 then raise exception 'invalid_amount'; end if;
  if p_price_eur is null or p_price_eur < 0 then raise exception 'invalid_amount'; end if;

  select wallet_balance into v_balance from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_credits where id = p_user_id
    returning wallet_balance into v_balance;
  insert into wallet_transactions (user_id, type, amount, price_eur, note, created_by)
    values (p_user_id, 'purchase', p_credits, p_price_eur, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'credit_wallet', p_user_id,
            'Αγορά ' || p_credits || ' credits (' || p_price_eur || '€)' || coalesce(' · ' || nullif(btrim(coalesce(p_note, '')), ''), ''));
  return v_balance;
end;
$$;
revoke execute on function admin_record_purchase(uuid, int, numeric, text) from public, anon;

-- ---------------------------------------------------------------------------
-- Συναρτήσεις που αλλάζουν (μεταφορά σε credits, δωρεάν αίτημα χωρίς κίνηση)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_delivery_role_request(p_delivery_request_id uuid, p_crew_role crew_role, p_offered_price numeric, p_skipper_ids uuid[])
 RETURNS delivery_role_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dr delivery_requests%rowtype;
  v_rate numeric;
  v_pct numeric;
  v_min_fee numeric;
  v_credit_price numeric;
  v_expiry_hours numeric;
  v_commission_base numeric;
  v_platform_commission numeric;
  v_client_fee numeric;
  v_wallet numeric;
  v_range daterange;
  v_row delivery_role_requests%rowtype;
begin
  select * into v_dr from delivery_requests where id = p_delivery_request_id;
  if not found then raise exception 'delivery_request_not_found'; end if;
  if v_dr.client_id <> auth.uid() then raise exception 'not_owner'; end if;

  if p_offered_price is null or p_offered_price < 0 then raise exception 'invalid_price'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_candidates_selected'; end if;

  v_range := daterange(v_dr.departure_date - v_dr.flexible_days, v_dr.departure_date + v_dr.flexible_days, '[]');

  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_public sp on sp.id = s and sp.role = p_crew_role
    where sp.id is null or not (delivery_net_availability(s, p_crew_role) @> v_range)
  ) then
    raise exception 'invalid_candidate_selection';
  end if;

  v_rate := (select value from platform_settings where key = 'delivery_' || p_crew_role::text || '_rate_per_mile');
  -- greatest()/least() σιωπηλά αγνοούν NULL ορίσματα· χωρίς αυτόν τον έλεγχο
  -- ένα λείπον ρυθμό (typo, μη εφαρμοσμένη migration) θα γινόταν silent
  -- undercharge (client_fee = min_fee) αντί για σφάλμα.
  if v_rate is null then raise exception 'delivery_rate_not_configured'; end if;
  v_pct := (select value from platform_settings where key = 'delivery_platform_fee_pct');
  v_min_fee := (select value from platform_settings where key = 'delivery_min_fee');
  v_expiry_hours := (select value from platform_settings where key = 'delivery_expiry_hours');

  v_commission_base := v_dr.distance_miles * v_rate;
  v_platform_commission := v_commission_base * (v_pct / 100.0);
  v_client_fee := greatest(v_min_fee, v_platform_commission - v_min_fee);
  -- Σε credits (0110): το ποσό σε € διά την τιμή του credit, προς τα πάνω.
  -- Το ίδιο και για τον επαγγελματία (professional_fee = ελάχιστο τέλος).
  v_credit_price := greatest(coalesce((select value from platform_settings where key = 'credit_price_eur'), 50), 1);
  v_client_fee := ceil(v_client_fee / v_credit_price);
  v_min_fee := ceil(v_min_fee / v_credit_price);

  select wallet_balance into v_wallet from users where id = auth.uid() for update;
  if v_wallet < v_client_fee then raise exception 'insufficient_wallet'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance - v_client_fee where id = auth.uid();

  insert into delivery_role_requests (
    delivery_request_id, crew_role, offered_price,
    commission_base, platform_commission, client_fee, professional_fee,
    fee_paid_at, expires_at
  ) values (
    p_delivery_request_id, p_crew_role, p_offered_price,
    v_commission_base, v_platform_commission, v_client_fee, v_min_fee,
    now(), now() + (v_expiry_hours || ' hours')::interval
  ) returning * into v_row;

  insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id)
    values (auth.uid(), 'request_fee', -v_client_fee, v_row.id);

  insert into delivery_role_pings (delivery_role_request_id, skipper_id)
    select v_row.id, s from unnest(p_skipper_ids) as s
    on conflict do nothing;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pay_and_broadcast(p_request_id uuid, p_skipper_ids uuid[])
 RETURNS booking_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_req booking_requests%rowtype; v_uid uuid := auth.uid(); v_wallet numeric;
begin
  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.client_id <> v_uid then raise exception 'not_owner'; end if;
  if v_req.status <> 'open' or v_req.fee_paid_at is not null then raise exception 'already_paid_or_closed'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then raise exception 'no_skippers_selected'; end if;
  -- Ένα τέλος αιτήματος καλύπτει έως 30 επαγγελματίες (0106).
  if (select count(distinct s) from unnest(p_skipper_ids) s) > 30 then
    raise exception 'too_many_professionals';
  end if;
  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_profiles sp on sp.id = s
    left join skipper_secondary_roles ssr
      on ssr.skipper_id = s and ssr.role = v_req.crew_role and ssr.deleted_at is null
    where sp.id is null
       or sp.deleted_at is not null
       or (
         v_req.crew_role = sp.role
           and sp.approval_status <> 'approved'
       )
       or (
         v_req.crew_role <> sp.role
           and (ssr.id is null or ssr.approval_status <> 'approved')
       )
  ) then
    raise exception 'invalid_skipper_selection';
  end if;
  -- Μόνο όσοι είναι διαθέσιμοι για αυτό ακριβώς το αίτημα: στην περιοχή,
  -- όλες τις ημέρες, όχι ήδη κλεισμένοι (0106).
  if v_req.origin = 'client' and exists (
    select 1 from unnest(p_skipper_ids) s
     where not coalesce(net_availability(s, null, v_req.region_id, v_req.crew_role)
                        @> daterange(v_req.start_date, v_req.end_date, '[]'), false)
        or exists (select 1 from bookings b
                    where b.skipper_id = s and b.status in ('confirmed', 'completed')
                      and daterange(b.start_date, b.end_date, '[]') && daterange(v_req.start_date, v_req.end_date, '[]'))
  ) then
    raise exception 'skipper_not_available';
  end if;

  select wallet_balance into v_wallet from users where id = v_uid for update;
  if v_wallet < v_req.fee_amount then
    raise exception 'insufficient_wallet';
  end if;

  perform set_config('platform.trusted', 'true', true);
  -- Με τέλος 0 (δωρεάν περίοδος) καμία κίνηση στο υπόλοιπο (0110).
  if v_req.fee_amount > 0 then
    update users set wallet_balance = wallet_balance - v_req.fee_amount where id = v_uid;
    insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
      values (v_uid, 'request_fee', -v_req.fee_amount, p_request_id);
  end if;

  update booking_requests set fee_paid_at = now() where id = p_request_id returning * into v_req;
  insert into booking_request_pings (booking_request_id, skipper_id)
    select p_request_id, s from unnest(p_skipper_ids) as s
    on conflict do nothing;
  return v_req;
end;
$function$;

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
    'credits_sold_30d',   (select coalesce(sum(amount), 0) from wallet_transactions
                           where type = 'purchase' and created_at > now() - interval '30 days'),
    'pending_verification', (select count(*) from users
                             where phone_verified_at is null and status <> 'deleted' and role <> 'admin'),
    'pending_photos',   (select count(*) from users
                         where photo_url is not null and photo_reviewed_at is null and status <> 'deleted'),
    'suspended_count', (select count(*) from users where status = 'suspended')
  ) end;$function$;

CREATE OR REPLACE FUNCTION public.admin_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := current_date;
begin
  if not is_admin() then return null; end if;

  return jsonb_build_object(
    'expiring', coalesce((
      select jsonb_agg(x order by x->>'expires_at') from (
        select jsonb_build_object(
          'kind', 'crew',
          'id', br.id,
          'client_id', br.client_id,
          'client_name', u.full_name,
          'client_phone', u.phone_number,
          'place', coalesce(nullif(btrim(br.departure_point), ''), p.name),
          'region', r.name,
          'start', br.start_date,
          'end', br.end_date,
          'role', coalesce(br.crew_role, 'skipper'),
          'expires_at', br.expires_at,
          'pinged', (select count(*) from booking_request_pings x where x.booking_request_id = br.id),
          'declined', (select count(*) from booking_request_pings x
                       where x.booking_request_id = br.id and x.declined_at is not null),
          'waiting', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'id', sp.user_id,
                     'name', coalesce(nullif(btrim(sp.full_name), ''), pu.full_name),
                     'phone', pu.phone_number) order by sp.full_name)
            from booking_request_pings x
            join skipper_profiles sp on sp.id = x.skipper_id
            join users pu on pu.id = sp.user_id
            where x.booking_request_id = br.id and x.status = 'pending' and x.declined_at is null
          ), '[]'::jsonb)
        ) as x
        from booking_requests br
        join users u on u.id = br.client_id
        left join ports p on p.id = br.port_id
        left join regions r on r.id = br.region_id
        where br.status = 'open' and br.origin = 'client' and br.fee_paid_at is not null
          and br.expires_at > now() and br.expires_at < now() + interval '12 hours'
        union all
        select jsonb_build_object(
          'kind', 'delivery',
          'id', rr.id,
          'client_id', dr.client_id,
          'client_name', u.full_name,
          'client_phone', u.phone_number,
          'place', dr.origin_point || ' → ' || dr.destination_point,
          'region', null,
          'start', dr.departure_date,
          'end', dr.departure_date,
          'role', rr.crew_role,
          'expires_at', rr.expires_at,
          'pinged', (select count(*) from delivery_role_pings x where x.delivery_role_request_id = rr.id),
          'declined', (select count(*) from delivery_role_pings x
                       where x.delivery_role_request_id = rr.id and x.status = 'declined'),
          'waiting', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'id', sp.user_id,
                     'name', coalesce(nullif(btrim(sp.full_name), ''), pu.full_name),
                     'phone', pu.phone_number) order by sp.full_name)
            from delivery_role_pings x
            join skipper_profiles sp on sp.id = x.skipper_id
            join users pu on pu.id = sp.user_id
            where x.delivery_role_request_id = rr.id and x.status = 'pending'
          ), '[]'::jsonb)
        )
        from delivery_role_requests rr
        join delivery_requests dr on dr.id = rr.delivery_request_id
        join users u on u.id = dr.client_id
        where rr.status = 'open' and rr.expires_at > now() and rr.expires_at < now() + interval '12 hours'
      ) t
    ), '[]'::jsonb),

    'upcoming', coalesce((
      select jsonb_agg(x order by x->>'start', x->>'place') from (
        select jsonb_build_object(
          'kind', 'crew',
          'id', b.id,
          'start', b.start_date,
          'end', b.end_date,
          'place', coalesce(nullif(btrim(b.departure_point), ''), p.name),
          'role', coalesce(b.crew_role, sp.role),
          'client_id', b.client_id,
          'client_name', cu.full_name,
          'pro_id', sp.user_id,
          'pro_name', coalesce(nullif(btrim(sp.full_name), ''), pu.full_name)
        ) as x
        from bookings b
        left join ports p on p.id = b.port_id
        join users cu on cu.id = b.client_id
        join skipper_profiles sp on sp.id = b.skipper_id
        join users pu on pu.id = sp.user_id
        where b.status = 'confirmed' and b.start_date between v_today and v_today + 7
        union all
        select jsonb_build_object(
          'kind', 'delivery',
          'id', db.id,
          'start', db.departure_date,
          'end', db.departure_date,
          'place', db.origin_point || ' → ' || db.destination_point,
          'role', db.crew_role,
          'client_id', db.client_id,
          'client_name', cu.full_name,
          'pro_id', sp.user_id,
          'pro_name', coalesce(nullif(btrim(sp.full_name), ''), pu.full_name)
        )
        from delivery_bookings db
        join users cu on cu.id = db.client_id
        join skipper_profiles sp on sp.id = db.skipper_id
        join users pu on pu.id = sp.user_id
        where db.status = 'confirmed' and db.departure_date between v_today and v_today + 7
      ) t
    ), '[]'::jsonb),

    'lost', coalesce((
      select jsonb_agg(x order by x->>'expires_at' desc) from (
        select jsonb_build_object(
          'id', br.id,
          'client_id', br.client_id,
          'client_name', u.full_name,
          'client_phone', u.phone_number,
          'place', coalesce(nullif(btrim(br.departure_point), ''), p.name),
          'region', r.name,
          'start', br.start_date,
          'end', br.end_date,
          'role', coalesce(br.crew_role, 'skipper'),
          'expires_at', br.expires_at,
          'pinged', (select count(*) from booking_request_pings x where x.booking_request_id = br.id)
        ) as x
        from booking_requests br
        join users u on u.id = br.client_id
        left join ports p on p.id = br.port_id
        left join regions r on r.id = br.region_id
        where br.origin = 'client' and br.fee_paid_at is not null and br.expires_at > now() - interval '7 days'
          and (br.status = 'expired_unclaimed' or (br.status = 'open' and br.expires_at <= now()))
        order by br.expires_at desc
        limit 10
      ) t
    ), '[]'::jsonb),

    'market', (
      select jsonb_agg(jsonb_build_object(
        'role', rl,
        'approved', (
          select count(distinct sp.id) from skipper_profiles sp join users u on u.id = sp.user_id
          where sp.approval_status = 'approved' and sp.deleted_at is null and u.status = 'active'
            and (sp.role = rl or exists (
              select 1 from skipper_secondary_roles s
              where s.skipper_id = sp.id and s.role = rl and s.approval_status = 'approved' and s.deleted_at is null))
        ),
        'available', (
          select count(distinct sp.id) from skipper_profiles sp join users u on u.id = sp.user_id
          where sp.approval_status = 'approved' and sp.deleted_at is null and u.status = 'active'
            and (sp.role = rl or exists (
              select 1 from skipper_secondary_roles s
              where s.skipper_id = sp.id and s.role = rl and s.approval_status = 'approved' and s.deleted_at is null))
            and exists (
              select 1 from availability_windows w
              where w.skipper_id = sp.id
                and (w.crew_role is null or w.crew_role = rl)
                and w.end_date >= v_today and w.start_date <= v_today + 30)
        ),
        'requests', (select count(*) from booking_requests br
                     where br.origin = 'client' and coalesce(br.crew_role, 'skipper') = rl
                       and br.fee_paid_at is not null and br.created_at > now() - interval '30 days'),
        'matched', (select count(*) from booking_requests br
                    where br.origin = 'client' and coalesce(br.crew_role, 'skipper') = rl
                      and br.created_at > now() - interval '30 days' and br.status = 'matched'),
        'lost', (select count(*) from booking_requests br
                 where br.origin = 'client' and coalesce(br.crew_role, 'skipper') = rl
                   and br.fee_paid_at is not null and br.created_at > now() - interval '30 days'
                   and (br.status = 'expired_unclaimed' or (br.status = 'open' and br.expires_at <= now()))),
        'open', (select count(*) from booking_requests br
                 where br.origin = 'client' and coalesce(br.crew_role, 'skipper') = rl
                   and br.fee_paid_at is not null and br.status = 'open' and br.expires_at > now())
      ) order by array_position(enum_range(null::crew_role), rl))
      from unnest(enum_range(null::crew_role)) as rl
    ),

    'regions', coalesce((
      select jsonb_agg(jsonb_build_object('region', name, 'requests', n, 'matched', m, 'lost', l) order by n desc)
      from (
        select r.name, count(*) as n,
               count(*) filter (where br.status = 'matched') as m,
               count(*) filter (where br.status = 'expired_unclaimed'
                                  or (br.status = 'open' and br.expires_at <= now())) as l
        from booking_requests br join regions r on r.id = br.region_id
        where br.origin = 'client' and br.fee_paid_at is not null and br.created_at > now() - interval '30 days'
        group by r.name
      ) t
    ), '[]'::jsonb),

    'week', jsonb_build_object(
      'signups', (select count(*) from users where role <> 'admin' and created_at > now() - interval '7 days'),
      'signups_prev', (select count(*) from users where role <> 'admin'
                       and created_at <= now() - interval '7 days' and created_at > now() - interval '14 days'),
      'requests', (select count(*) from booking_requests where origin = 'client' and fee_paid_at is not null
                   and created_at > now() - interval '7 days')
                  + (select count(*) from delivery_requests where created_at > now() - interval '7 days'),
      'requests_prev', (select count(*) from booking_requests where origin = 'client' and fee_paid_at is not null
                        and created_at <= now() - interval '7 days' and created_at > now() - interval '14 days')
                       + (select count(*) from delivery_requests
                          where created_at <= now() - interval '7 days' and created_at > now() - interval '14 days'),
      'bookings', (select count(*) from bookings where created_at > now() - interval '7 days')
                  + (select count(*) from delivery_bookings where created_at > now() - interval '7 days'),
      'bookings_prev', (select count(*) from bookings
                        where created_at <= now() - interval '7 days' and created_at > now() - interval '14 days')
                       + (select count(*) from delivery_bookings
                          where created_at <= now() - interval '7 days' and created_at > now() - interval '14 days'),
      'fees', (select coalesce(-sum(amount), 0) from wallet_transactions
               where unit = 'credit' and type in ('request_fee', 'claim_fee') and created_at > now() - interval '7 days'),
      'fees_prev', (select coalesce(-sum(amount), 0) from wallet_transactions
                    where unit = 'credit' and type in ('request_fee', 'claim_fee')
                      and created_at <= now() - interval '7 days' and created_at > now() - interval '14 days'),
      'refunds', (select coalesce(sum(amount), 0) from wallet_transactions
                  where unit = 'credit' and type = 'refund_credit' and created_at > now() - interval '7 days'),
      'sales_eur', (select coalesce(sum(price_eur), 0) from wallet_transactions
                    where type = 'purchase' and created_at > now() - interval '7 days'),
      'sales_eur_prev', (select coalesce(sum(price_eur), 0) from wallet_transactions
                         where type = 'purchase'
                           and created_at <= now() - interval '7 days' and created_at > now() - interval '14 days')
    ),

    'dormant_clients', (
      select count(*) from users u
      where u.role = 'client' and u.status = 'active' and u.phone_verified_at is not null
        and u.created_at < now() - interval '3 days'
        and not exists (select 1 from booking_requests br where br.client_id = u.id)
        and not exists (select 1 from delivery_requests dr where dr.client_id = u.id)
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_account_detail(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with u as (
    select * from users where id = p_user_id
  ),
  sp as (
    select * from skipper_profiles where user_id = p_user_id
  ),
  cp as (
    select * from client_profiles where user_id = p_user_id
  ),
  secondary_roles as (
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'role', s.role, 'approval_status', s.approval_status,
      'price_per_day', s.price_per_day, 'license_number', s.license_number,
      'license_type', s.license_type, 'years_experience', s.years_experience,
      'rating_avg', s.rating_avg, 'rating_count', s.rating_count,
      'created_at', s.created_at, 'deleted_at', s.deleted_at
    ) order by s.created_at) as v
    from skipper_secondary_roles s where s.skipper_id = (select id from sp)
  ),
  languages as (
    select jsonb_agg(l.name order by l.name) as v
    from user_languages ul join languages l on l.id = ul.language_id
    where ul.user_id = p_user_id
  ),
  boat_types as (
    select jsonb_agg(b.name order by b.name) as v
    from skipper_boat_types sbt join boat_types b on b.id = sbt.boat_type_id
    where sbt.skipper_id = (select id from sp)
  ),
  availability as (
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'start_date', w.start_date, 'end_date', w.end_date, 'crew_role', w.crew_role,
      'regions', (select jsonb_agg(r.name order by r.name) from availability_window_regions awr
                  join regions r on r.id = awr.region_id where awr.window_id = w.id)
    ) order by w.start_date) as v
    from availability_windows w where w.skipper_id = (select id from sp)
  ),
  requests as (
    select jsonb_agg(jsonb_build_object(
      'id', br.id, 'status', br.status, 'start_date', br.start_date, 'end_date', br.end_date,
      'crew_role', coalesce(br.crew_role, 'skipper'), 'place', booking_place(br.departure_point, br.port_id, br.region_id),
      'fee_amount', br.fee_amount, 'fee_paid_at', br.fee_paid_at, 'expires_at', br.expires_at,
      'origin', br.origin, 'created_at', br.created_at
    ) order by br.created_at desc) as v
    from booking_requests br where br.client_id = p_user_id
  ),
  pings as (
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'status', p.status, 'sent_at', p.sent_at,
      'request', jsonb_build_object(
        'id', br.id, 'status', br.status, 'start_date', br.start_date, 'end_date', br.end_date,
        'crew_role', coalesce(br.crew_role, 'skipper'),
        'place', booking_place(br.departure_point, br.port_id, br.region_id)
      )
    ) order by p.sent_at desc) as v
    from booking_request_pings p join booking_requests br on br.id = p.booking_request_id
    where p.skipper_id = (select id from sp)
  ),
  bookings_client as (
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'status', b.status, 'start_date', b.start_date, 'end_date', b.end_date,
      'crew_role', coalesce(b.crew_role, 'skipper'), 'place', booking_place(b.departure_point, b.port_id, b.region_id),
      'pro_id', sp2.user_id, 'pro_name', coalesce(nullif(btrim(sp2.full_name), ''), pu.full_name),
      'confirmed_at', b.confirmed_at, 'cancelled_at', b.cancelled_at
    ) order by b.created_at desc) as v
    from bookings b
    join skipper_profiles sp2 on sp2.id = b.skipper_id
    join users pu on pu.id = sp2.user_id
    where b.client_id = p_user_id
  ),
  bookings_pro as (
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'status', b.status, 'start_date', b.start_date, 'end_date', b.end_date,
      'crew_role', coalesce(b.crew_role, 'skipper'), 'place', booking_place(b.departure_point, b.port_id, b.region_id),
      'client_id', b.client_id, 'client_name', cu.full_name,
      'confirmed_at', b.confirmed_at, 'cancelled_at', b.cancelled_at
    ) order by b.created_at desc) as v
    from bookings b join users cu on cu.id = b.client_id
    where b.skipper_id = (select id from sp)
  ),
  delivery_requests_out as (
    select jsonb_agg(jsonb_build_object(
      'id', dr.id, 'origin_point', dr.origin_point, 'destination_point', dr.destination_point,
      'distance_miles', dr.distance_miles, 'departure_date', dr.departure_date, 'created_at', dr.created_at,
      'roles', (select jsonb_agg(jsonb_build_object(
                  'id', rr.id, 'crew_role', rr.crew_role, 'status', rr.status,
                  'offered_price', rr.offered_price, 'client_fee', rr.client_fee, 'expires_at', rr.expires_at
                ) order by rr.created_at) from delivery_role_requests rr where rr.delivery_request_id = dr.id)
    ) order by dr.created_at desc) as v
    from delivery_requests dr where dr.client_id = p_user_id
  ),
  delivery_pings as (
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'status', p.status, 'sent_at', p.sent_at,
      'role', rr.crew_role, 'offered_price', rr.offered_price,
      'origin_point', dr.origin_point, 'destination_point', dr.destination_point
    ) order by p.sent_at desc) as v
    from delivery_role_pings p
    join delivery_role_requests rr on rr.id = p.delivery_role_request_id
    join delivery_requests dr on dr.id = rr.delivery_request_id
    where p.skipper_id = (select id from sp)
  ),
  delivery_bookings_client as (
    select jsonb_agg(jsonb_build_object(
      'id', db.id, 'status', db.status, 'crew_role', db.crew_role, 'departure_date', db.departure_date,
      'origin_point', db.origin_point, 'destination_point', db.destination_point, 'offered_price', db.offered_price,
      'pro_id', sp3.user_id, 'pro_name', coalesce(nullif(btrim(sp3.full_name), ''), pu3.full_name),
      'cancelled_at', db.cancelled_at, 'cancelled_by', db.cancelled_by, 'created_at', db.created_at
    ) order by db.created_at desc) as v
    from delivery_bookings db
    join skipper_profiles sp3 on sp3.id = db.skipper_id
    join users pu3 on pu3.id = sp3.user_id
    where db.client_id = p_user_id
  ),
  delivery_bookings_pro as (
    select jsonb_agg(jsonb_build_object(
      'id', db.id, 'status', db.status, 'crew_role', db.crew_role, 'departure_date', db.departure_date,
      'origin_point', db.origin_point, 'destination_point', db.destination_point, 'professional_fee_amount', db.professional_fee_amount,
      'client_id', db.client_id, 'client_name', cu2.full_name,
      'cancelled_at', db.cancelled_at, 'cancelled_by', db.cancelled_by, 'created_at', db.created_at
    ) order by db.created_at desc) as v
    from delivery_bookings db join users cu2 on cu2.id = db.client_id
    where db.skipper_id = (select id from sp)
  ),
  wallet as (
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'type', w.type, 'amount', w.amount, 'unit', w.unit, 'price_eur', w.price_eur, 'created_at', w.created_at
    ) order by w.created_at desc) as v
    from (select * from wallet_transactions where user_id = p_user_id order by created_at desc limit 200) w
  ),
  disputes as (
    select jsonb_agg(jsonb_build_object(
      'id', cr.id, 'booking_id', cr.booking_id, 'at_fault_party', cr.at_fault_party, 'reason', cr.reason,
      'created_at', cr.created_at, 'resolved_at', cr.resolved_at, 'resolution_note', cr.resolution_note,
      'reported_by_self', cr.reported_by = p_user_id,
      'place', booking_place(b.departure_point, b.port_id, b.region_id), 'start_date', b.start_date
    ) order by cr.created_at desc) as v
    from cancellation_reports cr join bookings b on b.id = cr.booking_id
    where cr.reported_by = p_user_id or b.client_id = p_user_id
       or b.skipper_id = (select id from sp)
  ),
  contact_msgs as (
    select jsonb_agg(jsonb_build_object(
      'id', cm.id, 'topic', cm.topic, 'message', cm.message, 'status', cm.status, 'created_at', cm.created_at
    ) order by cm.created_at desc) as v
    from contact_messages cm where cm.user_id = p_user_id
  ),
  flags as (
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'type', f.type, 'detail', f.detail, 'created_at', f.created_at, 'resolved_at', f.resolved_at,
      'related_user_id', f.related_user_id,
      'related_name', ru.full_name
    ) order by f.created_at desc) as v
    from admin_flags f left join users ru on ru.id = f.related_user_id
    where f.user_id = p_user_id or f.related_user_id = p_user_id
  ),
  logins as (
    select jsonb_agg(jsonb_build_object(
      'success', la.success, 'created_at', la.created_at
    ) order by la.created_at desc) as v
    from (select * from login_attempts where phone in (select phone from user_phones where user_id = p_user_id union select phone_number from u) order by created_at desc limit 100) la
  ),
  phones as (
    select jsonb_agg(jsonb_build_object(
      'phone', up.phone, 'added_at', up.added_at, 'retired_at', up.retired_at, 'source', up.source,
      'changed_by_name', coalesce(nullif(btrim(cb.full_name), ''), cb.phone_number)
    ) order by up.retired_at is null desc, up.added_at desc) as v
    from user_phones up left join users cb on cb.id = up.changed_by
    where up.user_id = p_user_id
  ),
  reset_codes as (
    select jsonb_agg(jsonb_build_object(
      'created_at', e.created_at, 'used_at', e.used_at, 'expires_at', e.expires_at
    ) order by e.created_at desc) as v
    from email_reset_codes e where e.user_id = p_user_id
  ),
  actions as (
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'action_type', a.action_type, 'notes', a.notes, 'created_at', a.created_at,
      'actor_id', a.admin_id, 'actor_name', coalesce(nullif(btrim(au.full_name), ''), au.phone_number),
      'self', a.admin_id = p_user_id
    ) order by a.created_at desc) as v
    from (select * from admin_actions where target_user_id = p_user_id order by created_at desc limit 300) a
    join users au on au.id = a.admin_id
  ),
  -- Ενιαίο χρονολογικό ιστορικό — κάθε κλάδος ένα είδος γεγονότος, ίδιο
  -- (kind, at, data) σχήμα με describeNotification. Χωρίς ετικέτες εδώ: το
  -- κείμενο αποφασίζεται στο client (adminAudit.js), για να αλλάζει χωρίς
  -- migration.
  timeline_rows as (
    select 'account_created' as kind, u.created_at as at,
           jsonb_build_object('role', u.role) as data
    from u
    union all
    -- Χωρίς τις «επιτυχημένες συνδέσεις» που δεν έκανε ο ίδιος ο χρήστης: το
    -- reset-pin γράφει μια γραμμή success για να ξεκλειδώσει τον λογαριασμό,
    -- και η «Σύνδεση ως» μπαίνει με το τηλέφωνό του. Και οι δύο φαίνονται ήδη
    -- ως ενέργεια admin — ως «Σύνδεση» του χρήστη θα ήταν ψέμα στο ιστορικό.
    select case when la.success then 'login_success' else 'login_failed' end, la.created_at, '{}'::jsonb
    from login_attempts la
    where la.phone in (select phone from user_phones where user_id = p_user_id union select phone_number from u)
      and not (la.success and exists (
        select 1 from admin_actions a
        where a.target_user_id = p_user_id
          and ((a.action_type = 'reset_pin'
                and la.created_at between a.created_at - interval '5 seconds' and a.created_at + interval '1 second')
            or (a.action_type = 'impersonate_start'
                and la.created_at between a.created_at - interval '5 seconds' and a.created_at + interval '60 seconds'))
      ))
    union all
    select 'request_sent', br.created_at,
           jsonb_build_object('role', coalesce(br.crew_role, 'skipper'), 'place', booking_place(br.departure_point, br.port_id, br.region_id),
                              'start_date', br.start_date, 'end_date', br.end_date, 'status', br.status, 'fee_amount', br.fee_amount)
    from booking_requests br where br.client_id = p_user_id
    union all
    select 'booking_confirmed', b.confirmed_at,
           jsonb_build_object('side', case when b.client_id = p_user_id then 'client' else 'pro' end,
                              'place', booking_place(b.departure_point, b.port_id, b.region_id),
                              'start_date', b.start_date, 'end_date', b.end_date, 'role', coalesce(b.crew_role, 'skipper'),
                              'counterpart', case when b.client_id = p_user_id
                                then coalesce(nullif(btrim(sp4.full_name), ''), pu4.full_name) else cu3.full_name end)
    from bookings b
    join users cu3 on cu3.id = b.client_id
    join skipper_profiles sp4 on sp4.id = b.skipper_id
    join users pu4 on pu4.id = sp4.user_id
    where (b.client_id = p_user_id or b.skipper_id = (select id from sp)) and b.confirmed_at is not null
    union all
    select 'booking_cancelled', b.cancelled_at,
           jsonb_build_object('side', case when b.client_id = p_user_id then 'client' else 'pro' end,
                              'place', booking_place(b.departure_point, b.port_id, b.region_id),
                              'reason', b.cancellation_reason, 'status', b.status)
    from bookings b
    where (b.client_id = p_user_id or b.skipper_id = (select id from sp)) and b.cancelled_at is not null
    union all
    select 'delivery_request_sent', dr.created_at,
           jsonb_build_object('origin_point', dr.origin_point, 'destination_point', dr.destination_point, 'distance_miles', dr.distance_miles)
    from delivery_requests dr where dr.client_id = p_user_id
    union all
    select 'delivery_confirmed', db.created_at,
           jsonb_build_object('side', case when db.client_id = p_user_id then 'client' else 'pro' end,
                              'origin_point', db.origin_point, 'destination_point', db.destination_point, 'role', db.crew_role)
    from delivery_bookings db where db.client_id = p_user_id or db.skipper_id = (select id from sp)
    union all
    select 'delivery_cancelled', db.cancelled_at,
           jsonb_build_object('side', case when db.client_id = p_user_id then 'client' else 'pro' end,
                              'origin_point', db.origin_point, 'destination_point', db.destination_point,
                              'by', db.cancelled_by, 'reason', db.cancellation_reason)
    from delivery_bookings db
    where (db.client_id = p_user_id or db.skipper_id = (select id from sp)) and db.cancelled_at is not null
    union all
    select 'wallet_txn', w.created_at, jsonb_build_object('type', w.type, 'amount', w.amount, 'unit', w.unit, 'price_eur', w.price_eur)
    from wallet_transactions w where w.user_id = p_user_id
    union all
    select 'dispute_reported', cr.created_at,
           jsonb_build_object('self', cr.reported_by = p_user_id, 'reason', cr.reason,
                              'place', booking_place(b.departure_point, b.port_id, b.region_id))
    from cancellation_reports cr join bookings b on b.id = cr.booking_id
    where cr.reported_by = p_user_id or b.client_id = p_user_id or b.skipper_id = (select id from sp)
    union all
    select 'contact_message', cm.created_at, jsonb_build_object('topic', cm.topic, 'status', cm.status)
    from contact_messages cm where cm.user_id = p_user_id
    union all
    select 'email_reset_requested', e.created_at, jsonb_build_object('used', e.used_at is not null)
    from email_reset_codes e where e.user_id = p_user_id
    union all
    select 'admin_flag', f.created_at, jsonb_build_object('type', f.type, 'resolved', f.resolved_at is not null)
    from admin_flags f where f.user_id = p_user_id or f.related_user_id = p_user_id
    union all
    select 'secondary_role_requested', s.created_at, jsonb_build_object('role', s.role)
    from skipper_secondary_roles s where s.skipper_id = (select id from sp)
    union all
    -- Αλλαγή τηλεφώνου από τον ίδιο τον χρήστη. Η αλλαγή από admin φαίνεται
    -- ήδη ως ενέργεια admin (edit_contact) — δεν τη διπλογράφουμε.
    select 'phone_changed', up.added_at, jsonb_build_object('phone', up.phone)
    from user_phones up where up.user_id = p_user_id and up.source = 'self'
    union all
    select 'admin_action', a.created_at,
           jsonb_build_object('action_type', a.action_type, 'notes', a.notes,
                              'actor_name', coalesce(nullif(btrim(au.full_name), ''), au.phone_number),
                              'self', a.admin_id = p_user_id)
    from admin_actions a join users au on au.id = a.admin_id
    where a.target_user_id = p_user_id
  ),
  -- Όριο στα 500 πιο πρόσφατα: συνδέσεις και κινήσεις πορτοφολιού δεν έχουν
  -- άνω όριο, και ένας παλιός, ενεργός λογαριασμός θα φόρτωνε χιλιάδες γραμμές.
  timeline as (
    select jsonb_agg(jsonb_build_object('kind', kind, 'at', at, 'data', data) order by at desc) as v
    from (select * from timeline_rows where at is not null order by at desc limit 500) t
  )
  select jsonb_build_object(
    'user', (select to_jsonb(u) from u),
    'client_profile', (select to_jsonb(cp) from cp),
    'skipper_profile', (select to_jsonb(sp) from sp),
    'secondary_roles', coalesce((select v from secondary_roles), '[]'::jsonb),
    'languages', coalesce((select v from languages), '[]'::jsonb),
    'boat_types', coalesce((select v from boat_types), '[]'::jsonb),
    'availability', coalesce((select v from availability), '[]'::jsonb),
    'requests', coalesce((select v from requests), '[]'::jsonb),
    'pings', coalesce((select v from pings), '[]'::jsonb),
    'bookings_client', coalesce((select v from bookings_client), '[]'::jsonb),
    'bookings_pro', coalesce((select v from bookings_pro), '[]'::jsonb),
    'delivery_requests', coalesce((select v from delivery_requests_out), '[]'::jsonb),
    'delivery_pings', coalesce((select v from delivery_pings), '[]'::jsonb),
    'delivery_bookings_client', coalesce((select v from delivery_bookings_client), '[]'::jsonb),
    'delivery_bookings_pro', coalesce((select v from delivery_bookings_pro), '[]'::jsonb),
    'wallet', coalesce((select v from wallet), '[]'::jsonb),
    'disputes', coalesce((select v from disputes), '[]'::jsonb),
    'contact_messages', coalesce((select v from contact_msgs), '[]'::jsonb),
    'flags', coalesce((select v from flags), '[]'::jsonb),
    'logins', coalesce((select v from logins), '[]'::jsonb),
    'phones', coalesce((select v from phones), '[]'::jsonb),
    'reset_codes', coalesce((select v from reset_codes), '[]'::jsonb),
    'admin_actions', coalesce((select v from actions), '[]'::jsonb),
    'timeline', coalesce((select v from timeline), '[]'::jsonb)
  )
  from u
  where (select is_admin());
$function$;

CREATE OR REPLACE FUNCTION public.admin_credit_wallet(p_user_id uuid, p_amount numeric, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_credit_self'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) or p_amount > 1000 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from users where id = p_user_id) then raise exception 'invalid_role'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_amount where id = p_user_id;
  insert into wallet_transactions (user_id, type, amount, note, created_by)
    values (p_user_id, 'deposit', p_amount, nullif(btrim(p_notes), ''), auth.uid());
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'credit_wallet', p_user_id, coalesce(nullif(btrim(p_notes), ''), '') || ' (+' || p_amount || ' credits)');
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(p_user_id uuid, p_amount numeric, p_reason text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_balance numeric;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_credit_self'; end if;
  if p_amount is null or p_amount = 0 or p_amount <> round(p_amount) then raise exception 'invalid_amount'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  select wallet_balance into v_balance from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_balance + p_amount < 0 then raise exception 'insufficient_wallet'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_amount where id = p_user_id
    returning wallet_balance into v_balance;
  insert into wallet_transactions (user_id, type, amount, note, created_by)
    values (p_user_id, 'adjustment', p_amount, btrim(p_reason), auth.uid());
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'adjust_wallet', p_user_id,
            btrim(p_reason) || ' (' || case when p_amount > 0 then '+' else '' end || p_amount || ' credits)');
  return v_balance;
end;
$function$;
