-- ============================================================================
-- Ο διαχειριστής προτείνει δουλειά σε συγκεκριμένα άτομα· εκείνα αποδέχονται.
--
-- Δύο ανάγκες, μία μηχανή:
--
--   1. ΑΝΤΙΚΑΤΑΣΤΑΣΗ. Ένας επαγγελματίας ακύρωσε και ο πελάτης έμεινε χωρίς
--      πλήρωμα. Η άμεση ανάθεση (0024) καλύπτει την περίπτωση που το έκλεισες
--      στο τηλέφωνο, αλλά δεν καλύπτει την κανονική: στέλνεις τη δουλειά σε
--      μερικούς, την παίρνει όποιος προλάβει, και πληρώνει.
--
--   2. ΔΙΚΟ ΣΟΥ ΝΑΥΛΟ. Ψάχνεις σκίπερ ή χόστες για δική σου δουλειά. Ανοίγεις
--      ποιοι είναι ελεύθεροι τη βδομάδα, διαλέγεις, τους κάνεις αίτηση. Όποιος
--      αποδεχτεί, πληρώνει το ίδιο τέλος διεκδίκησης — αλλιώς η πλατφόρμα θα
--      ήταν δωρεάν ακριβώς για τη δουλειά που περνάει από τα χέρια σου.
--
-- ---------------------------------------------------------------------------
-- Γιατί ΔΕΝ φτιάχνεται καινούριος πίνακας «προτάσεων».
--
-- Μια πρόταση είναι ήδη αίτημα με χειροκίνητα διαλεγμένους παραλήπτες — που
-- είναι ακριβώς τι είναι ένα booking_request με pings. Ξαναχρησιμοποιώντας το:
-- η πρόταση πέφτει στα υπάρχοντα «Εισερχόμενα αιτήματα» του επαγγελματία, το
-- «Δεν με ενδιαφέρει» δουλεύει, ο ρυθμός απόκρισης τη μετράει, η ειδοποίηση
-- φεύγει από το ίδιο trigger, και ο αγώνας ταχύτητας μεταξύ παραληπτών είναι ο
-- ίδιος κώδικας που έχει ήδη δοκιμαστεί. Ένας δεύτερος πίνακας θα σήμαινε
-- δεύτερο inbox, δεύτερο race, δεύτερη ειδοποίηση — και μια μέρα που η μία
-- διαδρομή θα διορθωνόταν και η άλλη όχι.
--
-- Αυτό που αλλάζει είναι η *προέλευση* και ποιος πληρώνει τι.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Τι κάνει ένα αίτημα διαφορετικό όταν το γράφει ο διαχειριστής.
--
-- text με check αντί για enum: μια νέα τιμή enum δεν μπορεί να χρησιμοποιηθεί
-- στην ίδια συναλλαγή που τη δημιουργεί, πράγμα που κάνει τα enum δύσκολα σε
-- σενάρια που τρέχουν με ένα paste — το ίδιο σκεπτικό με το declined_at στο 0018.
-- ----------------------------------------------------------------------------
alter table booking_requests add column if not exists origin text not null default 'client';
alter table booking_requests drop constraint if exists booking_requests_origin_check;
alter table booking_requests add constraint booking_requests_origin_check
  check (origin in ('client', 'admin_replacement', 'admin_direct'));

alter table booking_requests add column if not exists created_by uuid references users(id);
alter table booking_requests add column if not exists replaces_booking_id uuid references bookings(id);
alter table booking_requests add column if not exists note text;
alter table booking_requests add column if not exists crew_role crew_role;

-- null = «όσο λέει η ρύθμιση της πλατφόρμας». Ρητό 0 = δωρεάν, και φαίνεται ως
-- τέτοιο στον επαγγελματία πριν αποδεχτεί. Δεν είναι boolean «δωρεάν ναι/όχι»
-- επειδή μια πρόταση τελευταίας στιγμής μπορεί κάλλιστα να αξίζει άλλο ποσό.
alter table booking_requests add column if not exists claim_fee_amount numeric
  check (claim_fee_amount is null or claim_fee_amount >= 0);

create index if not exists booking_requests_origin_idx
  on booking_requests (origin, status) where origin <> 'client';

-- Η κράτηση που προκύπτει από πρόταση αντικατάστασης πρέπει να δείχνει ποια
-- καλύπτει, αλλιώς η οθόνη κάλυψης θα τη ζητούσε για πάντα.
alter table bookings add column if not exists replaces_booking_id uuid references bookings(id);
alter table bookings add column if not exists assigned_by uuid references users(id);

-- Ο διαχειριστής γίνεται και πελάτης, γιατί για τα δικά του ναύλα είναι.
-- Το 0019 έδωσε πελατική πλευρά σε client/skipper· ο admin έμεινε απ' έξω, και
-- booking_requests.client_id δείχνει σε client_profiles — χωρίς γραμμή, δεν
-- μπορεί να ζητήσει πλήρωμα για τον εαυτό του.
insert into client_profiles (user_id)
select u.id from users u
where u.role = 'admin'
  and not exists (select 1 from client_profiles cp where cp.user_id = u.id)
on conflict do nothing;

create or replace function ensure_client_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into client_profiles (user_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- Δημιουργία πρότασης.
--
-- Μία κλήση: φτιάχνει το αίτημα και το στέλνει στους επιλεγμένους. Δύο βήματα
-- θα άφηναν αίτημα χωρίς παραλήπτες αν έσκαγε το δεύτερο — αόρατο σε όλους και
-- ζωντανό μέχρι να λήξει.
-- ----------------------------------------------------------------------------
create or replace function admin_create_offer(
  p_skipper_ids uuid[],
  p_role crew_role default 'skipper',
  p_start date default null,
  p_end date default null,
  p_port_id uuid default null,
  p_boat_type_id uuid default null,
  p_replaces_booking_id uuid default null,
  p_claim_fee numeric default null,
  p_note text default null,
  p_expires_hours int default 24
)
returns booking_requests
language plpgsql security definer set search_path = public as $$
declare
  v_old bookings%rowtype;
  v_req booking_requests%rowtype;
  v_client uuid;
  v_origin text;
  v_start date := p_start;
  v_end date := p_end;
  v_port uuid := p_port_id;
  v_boat uuid := p_boat_type_id;
  v_role crew_role := p_role;
  v_expires timestamptz;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_skipper_ids is null or array_length(p_skipper_ids, 1) is null then
    raise exception 'no_skippers_selected';
  end if;

  if p_replaces_booking_id is not null then
    -- Τα στοιχεία της δουλειάς έρχονται από την ακυρωμένη κράτηση, όχι από τη
    -- φόρμα: ο αντικαταστάτης πρέπει να καλύψει *αυτή* τη δουλειά, όχι μια
    -- παρόμοια.
    select * into v_old from bookings where id = p_replaces_booking_id for update;
    if not found then raise exception 'booking_not_found'; end if;
    if v_old.status <> 'cancelled_by_skipper' then raise exception 'not_awaiting_cover'; end if;
    if exists (
      select 1 from bookings r
      where r.replaces_booking_id = p_replaces_booking_id and r.status in ('confirmed', 'completed')
    ) then
      raise exception 'already_covered';
    end if;
    -- Μία ανοιχτή πρόταση ανά ακύρωση. Δύο θα σήμαιναν δύο νικητές για μία
    -- θέση, και ο δεύτερος θα πλήρωνε για κράτηση που το exclude constraint
    -- δεν θα άφηνε καν να γραφτεί.
    if exists (
      select 1 from booking_requests br
      where br.replaces_booking_id = p_replaces_booking_id and br.status = 'open'
    ) then
      raise exception 'offer_already_open';
    end if;

    v_client := v_old.client_id;
    v_origin := 'admin_replacement';
    v_start := v_old.start_date;
    v_end := v_old.end_date;
    v_port := v_old.port_id;
    v_boat := v_old.boat_type_id;
    select sp.role into v_role
      from skipper_profiles sp where sp.id = v_old.skipper_id;
    -- Χωρίς coalesce μετά το select, ένα διαγραμμένο προφίλ θα άφηνε v_role
    -- null· τότε ο έλεγχος ιδιότητας παρακάτω γίνεται null (ποτέ true) και θα
    -- περνούσε οποιονδήποτε αθόρυβα.
    v_role := coalesce(v_role, 'skipper'::crew_role);
  else
    -- Δικό σου ναύλο: πελάτης είσαι εσύ, με το όνομά σου. Ο επαγγελματίας
    -- βλέπει από ποιον ήρθε, που είναι ακριβώς το νόημα όταν οι παραλήπτες
    -- είναι συνεργάτες σου.
    v_client := auth.uid();
    v_origin := 'admin_direct';
    if v_start is null or v_end is null or v_port is null or v_boat is null then
      raise exception 'missing_job_details';
    end if;
    if v_end < v_start then raise exception 'invalid_date_range'; end if;
    insert into client_profiles (user_id) values (v_client) on conflict do nothing;
  end if;

  if exists (
    select 1 from unnest(p_skipper_ids) s
    left join skipper_profiles sp on sp.id = s
    where sp.id is null or sp.approval_status <> 'approved' or sp.deleted_at is not null
  ) then
    raise exception 'invalid_skipper_selection';
  end if;

  -- Η ιδιότητα του αιτήματος είναι αυτή που θα διαβάσει ο παραλήπτης· αν δεν
  -- ταιριάζει με τη δική του, το αίτημα λέει ψέματα σε κάποιον.
  if exists (
    select 1 from skipper_profiles sp
    where sp.id = any(p_skipper_ids) and sp.role <> v_role
  ) then
    raise exception 'role_mismatch';
  end if;

  -- Ποτέ μετά την έναρξη της δουλειάς: μια πρόταση που «ισχύει» ενώ το ναύλο
  -- έχει ήδη φύγει δεν είναι πρόταση.
  v_expires := now() + make_interval(hours => greatest(coalesce(p_expires_hours, 24), 1));
  if v_expires > v_start::timestamptz then
    v_expires := greatest(now() + interval '30 minutes', v_start::timestamptz);
  end if;

  insert into booking_requests (
    client_id, start_date, end_date, port_id, boat_type_id,
    fee_amount, fee_paid_at, status, expires_at,
    origin, created_by, replaces_booking_id, claim_fee_amount, note, crew_role
  ) values (
    v_client, v_start, v_end, v_port, v_boat,
    -- Δεν χρεώνεται τέλος αιτήματος. Στην αντικατάσταση ο πελάτης έχει ήδη
    -- πληρώσει μία φορά για αυτή ακριβώς τη δουλειά· στο δικό σου ναύλο θα
    -- χρεωνόσουν στον εαυτό σου.
    0, now(), 'open', v_expires,
    v_origin, auth.uid(), p_replaces_booking_id, p_claim_fee, nullif(btrim(coalesce(p_note, '')), ''), v_role
  ) returning * into v_req;

  insert into booking_request_pings (booking_request_id, skipper_id)
    select v_req.id, s from unnest(p_skipper_ids) as s
    on conflict do nothing;

  insert into admin_actions (admin_id, action_type, target_booking_id, notes)
  values (
    auth.uid(), 'edit_booking', p_replaces_booking_id,
    case when v_origin = 'admin_replacement' then 'Πρόταση αντικατάστασης' else 'Απευθείας πρόταση εργασίας' end
    || ' σε ' || array_length(p_skipper_ids, 1) || ' άτομα'
  );

  return v_req;
end;
$$;
grant execute on function admin_create_offer(uuid[], crew_role, date, date, uuid, uuid, uuid, numeric, text, int) to authenticated;

-- ----------------------------------------------------------------------------
-- Απόσυρση πρότασης.
--
-- Status 'cancelled', όχι λήξη: ο ρυθμός απόκρισης μετράει ως «αγνόησε» μόνο
-- τα pending σε αιτήματα που έληξαν αδιεκδίκητα. Αν η απόσυρση περνούσε από
-- εκεί, θα χρέωνε στους παραλήπτες μια σιωπή που εσύ επέβαλες.
-- ----------------------------------------------------------------------------
create or replace function admin_cancel_offer(p_request_id uuid)
returns booking_requests
language plpgsql security definer set search_path = public as $$
declare v_req booking_requests%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.origin = 'client' then raise exception 'not_an_offer'; end if;
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;

  update booking_requests set status = 'cancelled' where id = p_request_id returning * into v_req;
  return v_req;
end;
$$;
grant execute on function admin_cancel_offer(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Τι έχει σταλεί και περιμένει απάντηση.
-- ----------------------------------------------------------------------------
create or replace function admin_list_offers(p_include_closed boolean default false)
returns table(
  request_id uuid,
  origin text,
  status booking_request_status,
  crew_role crew_role,
  start_date date,
  end_date date,
  port_name text,
  boat_type_name text,
  note text,
  claim_fee_amount numeric,
  expires_at timestamptz,
  created_at timestamptz,
  client_name text,
  replaces_booking_id uuid,
  recipients int,
  pending int,
  declined int,
  claimed_by text
)
language sql stable security definer set search_path = public as $$
  select
    br.id, br.origin, br.status, br.crew_role,
    br.start_date, br.end_date, p.name, bt.name,
    br.note,
    -- Το ποσό που θα πληρώσει όποιος αποδεχτεί, όχι το «null σημαίνει
    -- προεπιλογή»: η οθόνη πρέπει να δείχνει νούμερο, όχι κανόνα.
    coalesce(br.claim_fee_amount, (select value from platform_settings where key = 'skipper_claim_fee')),
    br.expires_at, br.created_at,
    u.full_name, br.replaces_booking_id,
    (select count(*)::int from booking_request_pings x where x.booking_request_id = br.id),
    (select count(*)::int from booking_request_pings x where x.booking_request_id = br.id and x.status = 'pending'),
    (select count(*)::int from booking_request_pings x where x.booking_request_id = br.id and x.declined_at is not null),
    (select sp.full_name from bookings b
       join skipper_profiles sp on sp.id = b.skipper_id
      where b.booking_request_id = br.id and b.status in ('confirmed', 'completed')
      limit 1)
  from booking_requests br
  left join ports p on p.id = br.port_id
  left join boat_types bt on bt.id = br.boat_type_id
  left join users u on u.id = br.client_id
  where is_admin()
    and br.origin <> 'client'
    and (p_include_closed or br.status = 'open')
  order by br.status = 'open' desc, br.start_date;
$$;
grant execute on function admin_list_offers(boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Η διεκδίκηση μαθαίνει τρία πράγματα.
--
--   * το τέλος μπορεί να είναι ανά αίτημα, όχι πάντα η ρύθμιση·
--   * μηδενικό τέλος δεν αγγίζει καθόλου πορτοφόλι — ούτε έλεγχο υπολοίπου
--     ούτε κίνηση 0€ στο ταμείο κάποιου·
--   * μια κράτηση από πρόταση αντικατάστασης κουβαλάει ποια καλύπτει.
--
-- Όλα τα υπόλοιπα (advisory lock, for update, exclude constraint) μένουν
-- ακριβώς όπως ήταν: είναι ο αγώνας ταχύτητας και δεν έχει λόγο να αλλάξει.
-- ----------------------------------------------------------------------------
create or replace function claim_booking_request(p_request_id uuid, p_skipper_id uuid) returns bookings
language plpgsql security definer set search_path = public as $$
declare
  v_req booking_requests%rowtype;
  v_ping booking_request_pings%rowtype;
  v_skipper skipper_profiles%rowtype;
  v_booking bookings%rowtype;
  v_claim_fee numeric;
  v_overlap boolean;
begin
  if not exists (select 1 from skipper_profiles where id = p_skipper_id and user_id = auth.uid()) then
    raise exception 'not_owner';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_skipper_id::text));

  select * into v_req from booking_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.status <> 'open' then raise exception 'request_not_open'; end if;
  if v_req.fee_paid_at is null then raise exception 'fee_not_paid'; end if;
  -- Η λήξη ελέγχεται εδώ και όχι μόνο από το σκούπισμα: ανάμεσα στην ώρα
  -- λήξης και στο επόμενο τρέξιμο του expire_stale_booking_requests, ένα
  -- ληγμένο αίτημα ήταν ακόμη διεκδικήσιμο. Σε πρόταση με προθεσμία λίγων
  -- ωρών αυτό το παράθυρο είναι μεγαλύτερο από την ίδια την προθεσμία.
  if v_req.expires_at <= now() then raise exception 'request_expired'; end if;

  select * into v_ping from booking_request_pings
    where booking_request_id = p_request_id and skipper_id = p_skipper_id for update;
  if not found then raise exception 'not_pinged'; end if;
  if v_ping.status <> 'pending' then raise exception 'already_resolved'; end if;

  select * into v_skipper from skipper_profiles where id = p_skipper_id for update;
  if v_skipper.approval_status <> 'approved' or v_skipper.deleted_at is not null then
    raise exception 'skipper_not_eligible';
  end if;

  -- Η αντικατάσταση μπορεί να έχει καλυφθεί με άμεση ανάθεση όσο η πρόταση
  -- ήταν στον αέρα. Χωρίς αυτό, ο επαγγελματίας θα πλήρωνε για δουλειά που
  -- κάνει ήδη κάποιος άλλος.
  if v_req.replaces_booking_id is not null and exists (
    select 1 from bookings r
    where r.replaces_booking_id = v_req.replaces_booking_id
      and r.status in ('confirmed', 'completed')
  ) then
    update booking_requests set status = 'cancelled' where id = p_request_id;
    raise exception 'already_covered';
  end if;

  select exists (
    select 1 from bookings
    where skipper_id = p_skipper_id
      and status in ('confirmed', 'completed')
      and daterange(start_date, end_date, '[]') && daterange(v_req.start_date, v_req.end_date, '[]')
  ) into v_overlap;
  if v_overlap then
    update booking_request_pings set status = 'missed' where id = v_ping.id;
    raise exception 'date_overlap';
  end if;

  v_claim_fee := coalesce(
    v_req.claim_fee_amount,
    (select value from platform_settings where key = 'skipper_claim_fee')
  );
  if v_claim_fee > 0 and v_skipper.wallet_balance < v_claim_fee then
    raise exception 'insufficient_wallet';
  end if;

  insert into bookings (
    booking_request_id, client_id, skipper_id, start_date, end_date, port_id, boat_type_id,
    skipper_claim_fee_amount, skipper_claim_paid_at, confirmed_at, status,
    replaces_booking_id, assigned_by
  ) values (
    p_request_id, v_req.client_id, p_skipper_id, v_req.start_date, v_req.end_date, v_req.port_id, v_req.boat_type_id,
    v_claim_fee, now(), now(), 'confirmed',
    v_req.replaces_booking_id, v_req.created_by
  ) returning * into v_booking;

  if v_claim_fee > 0 then
    perform set_config('platform.trusted', 'true', true);
    update skipper_profiles set wallet_balance = wallet_balance - v_claim_fee where id = p_skipper_id;
    insert into wallet_transactions (user_id, type, amount, related_booking_request_id, related_booking_id)
      values (v_skipper.user_id, 'claim_fee', -v_claim_fee, p_request_id, v_booking.id);
  end if;

  update booking_request_pings set status = 'claimed' where id = v_ping.id;
  update booking_request_pings set status = 'missed'
    where booking_request_id = p_request_id and id <> v_ping.id and status = 'pending';
  update booking_requests set status = 'matched' where id = p_request_id;

  return v_booking;
end;
$$;

-- Καμία επιστροφή 0€. Οι προτάσεις έχουν fee_amount 0, οπότε χωρίς αυτό κάθε
-- πρόταση που έληγε άφηνε μια κίνηση 0€ στο ταμείο — θόρυβος σε ένα σημείο
-- που πρέπει να διαβάζεται με μια ματιά.
create or replace function expire_stale_booking_requests() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_count int := 0;
begin
  perform set_config('platform.trusted', 'true', true);
  for r in
    select * from booking_requests where status = 'open' and expires_at < now() for update
  loop
    update booking_requests set status = 'expired_unclaimed' where id = r.id;
    if r.fee_paid_at is not null and r.fee_amount > 0 then
      update client_profiles set wallet_balance = wallet_balance + r.fee_amount where user_id = r.client_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
        values (r.client_id, 'refund_credit', r.fee_amount, r.id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- Η ειδοποίηση λέει τι είδους αίτημα είναι.
--
-- «Νέο αίτημα» και «σου προτείνω αυτή τη δουλειά» δεν είναι το ίδιο μήνυμα,
-- και το δεύτερο αξίζει να ανοιχτεί πιο γρήγορα.
-- ----------------------------------------------------------------------------
create or replace function notify_request_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_req booking_requests%rowtype; v_port text; v_fee numeric;
begin
  select user_id into v_uid from skipper_profiles where id = new.skipper_id;
  select * into v_req from booking_requests where id = new.booking_request_id;
  select name into v_port from ports where id = v_req.port_id;
  v_fee := coalesce(v_req.claim_fee_amount, (select value from platform_settings where key = 'skipper_claim_fee'));
  perform notify_user(
    v_uid,
    case when v_req.origin = 'client' then 'request_received' else 'offer_received' end,
    jsonb_build_object(
      'port', v_port, 'start', v_req.start_date, 'end', v_req.end_date,
      'origin', v_req.origin, 'fee', v_fee, 'note', v_req.note
    ),
    '/platform/skipper'
  );
  return null;
end;
$$;

-- Η κάλυψη θεωρείται τακτοποιημένη μόλις υπάρχει *ανοιχτή πρόταση* γι' αυτήν,
-- όχι μόνο όταν κάποιος έχει ήδη αποδεχτεί. Αλλιώς η ίδια ακύρωση θα φώναζε
-- «χρειάζεται ενέργεια» ενώ η ενέργεια έχει γίνει και περιμένει απάντηση.
create or replace function admin_coverage_needed()
returns table(
  booking_id uuid,
  client_id uuid,
  client_name text,
  client_phone text,
  port_id uuid,
  port_name text,
  start_date date,
  end_date date,
  crew_role crew_role,
  cancelled_at timestamptz,
  cancellation_reason text,
  offer_request_id uuid,
  offer_pending int
)
language sql stable security definer set search_path = public as $$
  select
    b.id, b.client_id, u.full_name, u.phone_number,
    b.port_id, p.name, b.start_date, b.end_date,
    coalesce(sp.role, 'skipper'::crew_role),
    b.cancelled_at, b.cancellation_reason,
    o.id,
    coalesce((select count(*)::int from booking_request_pings x
              where x.booking_request_id = o.id and x.status = 'pending'), 0)
  from bookings b
  join users u on u.id = b.client_id
  left join ports p on p.id = b.port_id
  left join skipper_profiles sp on sp.id = b.skipper_id
  left join lateral (
    select br.id from booking_requests br
    where br.replaces_booking_id = b.id and br.status = 'open'
    limit 1
  ) o on true
  where is_admin()
    and b.status = 'cancelled_by_skipper'
    and b.end_date >= current_date
    and not exists (
      select 1 from bookings r
      where r.replaces_booking_id = b.id
        and r.status in ('confirmed', 'completed')
    )
  order by b.start_date;
$$;
grant execute on function admin_coverage_needed() to authenticated;

-- «Χρειάζονται ενέργεια» σημαίνει ότι δεν έχει γίνει τίποτα ακόμα. Οι
-- ακυρώσεις με πρόταση στον αέρα μετριούνται χωριστά, γιατί περιμένουν
-- απάντηση και όχι εσένα.
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
    'wallet_clients',     (select coalesce(sum(wallet_balance), 0) from client_profiles),
    'wallet_pros',        (select coalesce(sum(wallet_balance), 0) from skipper_profiles),
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
