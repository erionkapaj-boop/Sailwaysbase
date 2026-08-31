-- ============================================================================
-- Η μεταφορά σκάφους (0067) επέτρεπε μόνο skipper (υποχρεωτικό) + ναύτη
-- (προαιρετικό) — συνειδητή απόφαση τότε, με το σκεπτικό ότι μια μεταφορά
-- χρειάζεται μόνο πλήρωμα πλοήγησης, όχι φιλοξενίας. Ζητήθηκε ρητά να ανοίξει
-- και σε hostess/μάγειρα — ο πελάτης αποφασίζει ο ίδιος ποιο πλήρωμα θέλει
-- για τη συγκεκριμένη μεταφορά, όχι η πλατφόρμα για λογαριασμό του.
--
-- Το crew_role enum έχει ήδη και τις 4 τιμές (0012) — ο μόνος περιορισμός
-- ήταν το CHECK constraint σε δύο πίνακες και η ρητή απόρριψη στο RPC.
-- Αφαιρούνται και τα δύο· ο ρυθμός ανά μίλι κάθε ρόλου γίνεται δικιά του
-- εγγραφή στο platform_settings (ζητήθηκε ρητά να είναι όλα ρυθμιζόμενα από
-- το admin settings, όχι hardcoded) και η αναζήτηση ρυθμού γίνεται πλέον με
-- το όνομα του ρόλου αντί για case-statement 2 επιλογών.
--
-- Οι default τιμές για hostess/μάγειρα (1€/μίλι, ίδιο με ναύτη) είναι απλώς
-- ένα εύλογο σημείο εκκίνησης — προσαρμόζονται ελεύθερα από το admin
-- settings, όπως και τα υπόλοιπα.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Νέες ρυθμίσεις ρυθμού ανά μίλι.
-- ----------------------------------------------------------------------------
insert into platform_settings (key, value) values
  ('delivery_hostess_rate_per_mile', 1),
  ('delivery_cook_rate_per_mile', 1)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Άνοιγμα των δύο CHECK constraints σε όλους τους ρόλους πληρώματος. Το
-- enum type είναι ήδη ο μόνος περιορισμός που χρειάζεται.
-- ----------------------------------------------------------------------------
alter table delivery_role_requests drop constraint if exists delivery_role_requests_crew_role_check;
alter table delivery_availability_windows drop constraint if exists delivery_availability_windows_crew_role_check;

-- ----------------------------------------------------------------------------
-- 3. create_delivery_role_request — αφαίρεση του invalid_role guard (το enum
-- type ήδη εγγυάται έγκυρη τιμή) και ρυθμός ανά μίλι με βάση το όνομα του
-- ρόλου αντί για case-statement δύο επιλογών.
-- ----------------------------------------------------------------------------
create or replace function create_delivery_role_request(
  p_delivery_request_id uuid,
  p_crew_role crew_role,
  p_offered_price numeric,
  p_skipper_ids uuid[]
) returns delivery_role_requests
language plpgsql security definer set search_path = public as $$
declare
  v_dr delivery_requests%rowtype;
  v_rate numeric;
  v_pct numeric;
  v_min_fee numeric;
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
$$;
