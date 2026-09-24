-- ============================================================================
-- Η Επισκόπηση του admin, σε μία κλήση.
--
-- Η παλιά Επισκόπηση απαντούσε μόνο στο «έχω να κάνω κάτι τώρα;» και από
-- κάτω έδειχνε σύνολα (χρήστες, ολοκληρωμένες, ενεργοί 30 ημ.) που δεν
-- οδηγούσαν πουθενά. Η δουλειά του admin σε αυτή την πλατφόρμα είναι να μη
-- χάνεται κανένα ταξίδι και να υπάρχουν αρκετοί επαγγελματίες εκεί που
-- υπάρχει ζήτηση. Αυτή η συνάρτηση φέρνει ακριβώς αυτό:
--
--   expiring   — ανοιχτά αιτήματα (πλήρωμα και μεταφορά) που λήγουν τις
--                επόμενες 12 ώρες χωρίς να τα έχει αποδεχτεί κανείς, μαζί με
--                όσους επαγγελματίες δεν έχουν απαντήσει ακόμα (waiting) — ο
--                admin προλαβαίνει να πάρει τηλέφωνο τον πελάτη ή αυτούς.
--   upcoming   — κρατήσεις και μεταφορές που ξεκινούν τις επόμενες 7 μέρες.
--   lost       — αιτήματα πελατών που έληξαν χωρίς απάντηση τις τελευταίες 7
--                μέρες (ποιος, πού, τι ζητούσε).
--   market     — ανά ιδιότητα: πόσοι εγκεκριμένοι επαγγελματίες έχουν δηλώσει
--                διαθεσιμότητα τις επόμενες 30 μέρες, απέναντι στα αιτήματα
--                των τελευταίων 30 ημερών (πόσα βρήκαν, πόσα χάθηκαν).
--   regions    — το ίδιο ανά περιοχή, μόνο για περιοχές με αιτήματα.
--   week       — τελευταίες 7 μέρες και οι 7 πριν, για σύγκριση.
--   dormant_clients — επαληθευμένοι πελάτες άνω των 3 ημερών που δεν
--                έστειλαν ποτέ αίτημα.
--
-- Τα αιτήματα που έληξαν μαρκάρονται expired_unclaimed μία φορά τη νύχτα
-- (cron), οπότε ένα 'open' με expires_at στο παρελθόν μετράει ήδη ως χαμένο.
--
-- Μόνο ανάγνωση, security definer με έλεγχο is_admin() — ίδιο μοτίβο με
-- admin_overview (που μένει ως έχει για τους μετρητές του μενού).
-- ============================================================================

create or replace function admin_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
        where br.status = 'open' and br.origin = 'client'
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
        where br.origin = 'client' and br.expires_at > now() - interval '7 days'
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
                       and br.created_at > now() - interval '30 days'),
        'matched', (select count(*) from booking_requests br
                    where br.origin = 'client' and coalesce(br.crew_role, 'skipper') = rl
                      and br.created_at > now() - interval '30 days' and br.status = 'matched'),
        'lost', (select count(*) from booking_requests br
                 where br.origin = 'client' and coalesce(br.crew_role, 'skipper') = rl
                   and br.created_at > now() - interval '30 days'
                   and (br.status = 'expired_unclaimed' or (br.status = 'open' and br.expires_at <= now()))),
        'open', (select count(*) from booking_requests br
                 where br.origin = 'client' and coalesce(br.crew_role, 'skipper') = rl
                   and br.status = 'open' and br.expires_at > now())
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
        where br.origin = 'client' and br.created_at > now() - interval '30 days'
        group by r.name
      ) t
    ), '[]'::jsonb),

    'week', jsonb_build_object(
      'signups', (select count(*) from users where role <> 'admin' and created_at > now() - interval '7 days'),
      'signups_prev', (select count(*) from users where role <> 'admin'
                       and created_at <= now() - interval '7 days' and created_at > now() - interval '14 days'),
      'requests', (select count(*) from booking_requests where origin = 'client' and created_at > now() - interval '7 days')
                  + (select count(*) from delivery_requests where created_at > now() - interval '7 days'),
      'requests_prev', (select count(*) from booking_requests where origin = 'client'
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
               where type in ('request_fee', 'claim_fee') and created_at > now() - interval '7 days'),
      'fees_prev', (select coalesce(-sum(amount), 0) from wallet_transactions
                    where type in ('request_fee', 'claim_fee')
                      and created_at <= now() - interval '7 days' and created_at > now() - interval '14 days'),
      'refunds', (select coalesce(sum(amount), 0) from wallet_transactions
                  where type = 'refund_credit' and created_at > now() - interval '7 days')
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
$$;
grant execute on function admin_dashboard() to authenticated;
