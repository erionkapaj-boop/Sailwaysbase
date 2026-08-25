-- ============================================================================
-- The reveal never actually worked. Both directions were broken.
--
-- The only SELECT policy on `users` is `id = auth.uid() or is_admin()` (0003)
-- — nobody else can read anybody else's row, full stop. That breaks the
-- reveal in ways that were never caught because each direction fails quietly
-- rather than with an error:
--
--   * Πελάτης -> skipper: getRevealedSkipper() reads skipper_profiles (whose
--     own policy DOES allow a client with a confirmed+ booking to read it,
--     0003) with an EMBEDDED users(phone_number,email). The embed is subject
--     to users' OWN policy, which the client fails — so the name showed
--     (it comes straight from skipper_profiles.full_name) but the phone
--     number was always silently empty.
--
--   * Skipper -> πελάτη: getRevealedClient() reads straight from `users`,
--     which the professional never has any policy allowing. RLS filters the
--     row out entirely — not just the phone, the whole reveal came back
--     null. And even if it had returned something, the query never selected
--     full_name in the first place, and BookingPanel.js hardcoded "—" for
--     this direction regardless of what came back. Three failures stacked
--     on top of each other, and every one of them was invisible: a filtered
--     RLS row and a missing column both come back as "no data", not an
--     error, so nothing before this ever surfaced it.
--
-- One function replaces both call sites, symmetric: given a booking, return
-- the OTHER side's name and phone once payment on both ends has happened —
-- confirmed, completed, or cancelled by either party (cancelling doesn't
-- erase a reveal that already happened, and either side may still need to
-- reach the other about it). SECURITY DEFINER, so it can read `users`
-- directly and enforce participation + booking status itself instead of
-- leaning on row-level policies that can only gate whole rows, never "just
-- these two columns, only for this one booking".
-- ============================================================================

-- user_id travels alongside name/phone because BookingPanel needs it for a
-- third thing besides display: submitReview() takes a reviewee_id, which for
-- "client reviews skipper" is the skipper's *login* account, not their
-- skipper_profiles.id. v_counterpart_uid below is already exactly that value
-- in both directions, so returning it here means the caller never has to
-- work out which id means what depending on which side it's looking from.
create or replace function get_booking_counterpart(p_booking_id uuid)
returns table(user_id uuid, full_name text, phone_number text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_uid uuid := auth.uid();
  v_counterpart_uid uuid;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found'; end if;

  if v_booking.status not in ('confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_skipper') then
    raise exception 'not_revealed';
  end if;

  if v_uid = v_booking.client_id then
    select sp.user_id into v_counterpart_uid from skipper_profiles sp where sp.id = v_booking.skipper_id;
  -- Aliased and qualified (sp.user_id), not bare `user_id`: the function's
  -- own return column is also named user_id, and unqualified inside a
  -- PL/pgSQL body that resolves to the OUT parameter, not the table column
  -- — exactly the trap 0027 already hit once with cancellation_load.
  elsif exists (select 1 from skipper_profiles sp where sp.id = v_booking.skipper_id and sp.user_id = v_uid) then
    v_counterpart_uid := v_booking.client_id;
  else
    raise exception 'not_participant';
  end if;

  return query select u.id, u.full_name, u.phone_number from users u where u.id = v_counterpart_uid;
end;
$$;
grant execute on function get_booking_counterpart(uuid) to authenticated;

-- ============================================================================
-- Second, related bug, found while tracing what happens once a review lands
-- on the account this migration just fixed the reveal for.
--
-- recalc_user_rating() decided which profile to update by checking
-- users.role = 'skipper' or 'client' — but that stopped being a safe way to
-- ask "does this account have a skipper_profiles / client_profiles row" back
-- in 0019, the moment a skipper-role account could ALSO act as a client
-- (hiring other crew) and receive a review in that capacity: their role is
-- fixed at 'skipper', so a review received AS A CLIENT matched neither
-- branch and client_profiles.rating_avg silently never updated. 0028 made it
-- worse by adding a role ('admin') that matches neither branch at all — an
-- admin's own skipper_profiles rating would now be permanently stuck,
-- reviews or not.
--
-- The actual question was never "what is this account's primary role" — it
-- was "which profile tables does this account happen to have a row in".
--
-- That reframing surfaced a second, sharper problem while testing it:
-- reviews.reviewee_id names a PERSON, not a CAPACITY, and a person can be
-- reviewed as crew on one booking and as a client on another. The old query
-- — avg(rating) over every review where reviewee_id = p_user_id, full stop —
-- blends both into one number. Confirmed by testing: a professional who also
-- hires crew for themselves (possible since 0019 — "anyone can book") got a
-- 5-star professional review and a 3-star client review, and the *client*
-- review dragged their *professional* rating down to 4.0, the number a
-- client deciding whether to hire them would see. That was already true
-- before this migration touched anything; it was just invisible, because the
-- old role-gated write only ever landed the blended number in ONE of the two
-- tables, so nobody could compare it against the other and notice the
-- contamination.
--
-- What actually distinguishes the two is the BOOKING each review belongs to,
-- not the review row itself: if p_user_id was the client on that booking,
-- the review is about their behaviour as a client; if they were the crew
-- (their user_id matches the booking's skipper_profiles.user_id), it's about
-- their work as a professional. Never both — self-hire is blocked at the
-- ping (0019) — so every review sorts into exactly one bucket once it's
-- looked up through its booking instead of taken at face value.
-- ============================================================================

create or replace function recalc_user_rating(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_skipper_avg numeric; v_skipper_count int;
  v_client_avg numeric; v_client_count int;
begin
  if p_user_id is null then return; end if;

  select round(avg(r.rating)::numeric, 2), count(*)
    into v_skipper_avg, v_skipper_count
    from reviews r
    join bookings b on b.id = r.booking_id
    join skipper_profiles sp on sp.id = b.skipper_id
    where r.reviewee_id = p_user_id and sp.user_id = p_user_id;

  select round(avg(r.rating)::numeric, 2), count(*)
    into v_client_avg, v_client_count
    from reviews r
    join bookings b on b.id = r.booking_id
    where r.reviewee_id = p_user_id and b.client_id = p_user_id;

  perform set_config('platform.trusted', 'true', true);

  update skipper_profiles set rating_avg = v_skipper_avg, rating_count = coalesce(v_skipper_count, 0)
    where user_id = p_user_id;
  update client_profiles set rating_avg = v_client_avg, rating_count = coalesce(v_client_count, 0)
    where user_id = p_user_id;
end;
$$;

-- One-off repair: recompute everyone who has ever been reviewed, in case the
-- role-gated version above already left someone's rating stuck or blended.
do $$
declare r record;
begin
  for r in select distinct reviewee_id from reviews loop
    perform recalc_user_rating(r.reviewee_id);
  end loop;
end;
$$;

-- The notification for a new review has the identical bug: it picked the
-- link ('/platform/skipper' vs '/platform/client') from users.role, so a
-- review landing on someone's client side would still open their skipper
-- dashboard if their role happened to be 'skipper' (or open neither
-- correctly for an admin). Same fix, same reasoning: ask the booking which
-- capacity this specific review is about, not the account's role.
create or replace function notify_review_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_link text;
begin
  select case when b.client_id = new.reviewee_id then '/platform/client' else '/platform/skipper' end
    into v_link
  from bookings b where b.id = new.booking_id;

  perform notify_user(
    new.reviewee_id, 'review_received',
    jsonb_build_object('rating', new.rating),
    coalesce(v_link, '/platform/client')
  );
  return null;
end;
$$;

-- Wallet notifications have the same users.role problem, confirmed the same
-- way: gave an admin account a claim_fee transaction (always the crew
-- wallet) and a request_fee transaction (always the client wallet), and both
-- landed on '/platform/client' regardless.
--
-- Unlike a review, a wallet_transactions row doesn't need a role lookup at
-- all — `type` already says which wallet moved for claim_fee and
-- request_fee (they only ever happen on one side), and refund_credit can be
-- traced back through its booking the same way reviews now are. The one gap
-- left standing: a bare 'deposit' with no related booking carries no signal
-- anywhere about which of an account's two wallets it topped up, short of
-- adding a column that records that at the point of deposit. Rare — an
-- admin-confirmed top-up, not an automatic charge — and not something this
-- migration invents a fix for; it keeps the previous default (client) for
-- that one case rather than guess.
create or replace function notify_wallet_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_link text;
begin
  v_link := case
    when new.type = 'claim_fee' then '/platform/skipper/wallet'
    when new.type = 'request_fee' then '/platform/client'
    when new.related_booking_id is not null then (
      select case when b.client_id = new.user_id then '/platform/client' else '/platform/skipper/wallet' end
      from bookings b where b.id = new.related_booking_id
    )
    -- A booking_request only ever has a client, never a crew side.
    when new.related_booking_request_id is not null then '/platform/client'
    else '/platform/client'
  end;

  perform notify_user(
    new.user_id, 'wallet',
    jsonb_build_object('amount', new.amount, 'txn_type', new.type),
    coalesce(v_link, '/platform/client')
  );
  return null;
end;
$$;
