-- ΠΛΗΡΕΣ FORMAT (απόφαση ιδιοκτήτη 16/10/2026): μένει ΜΟΝΟ ο λογαριασμός του ιδιοκτήτη.
-- Σβήνονται όλοι οι άλλοι λογαριασμοί (πραγματικοί και δοκιμαστικοί) και όλα τα δεδομένα δραστηριότητας:
-- αιτήματα, κρατήσεις, μεταφορές, μηνύματα, αξιολογήσεις, ειδοποιήσεις, κινήσεις και αγορές credits, επικοινωνία,
-- αρχεία καταγραφής. Μένουν οι λίστες και οι ρυθμίσεις (περιοχές, λιμάνια, γλώσσες, τύποι σκαφών, ρυθμίσεις
-- πλατφόρμας, θέσεις μερών στον χάρτη). Ο ιδιοκτήτης κρατά τον λογαριασμό και το προφίλ του, με υπόλοιπο 0 και
-- μηδενισμένες αξιολογήσεις. ΔΕΝ ΓΥΡΙΖΕΙ ΠΙΣΩ: πρώτα αντίγραφο ασφαλείας.
--
-- Ασφάλεια: αν δεν βρεθεί ΑΚΡΙΒΩΣ ένας λογαριασμός ιδιοκτήτη με αυτό το τηλέφωνο, σταματά χωρίς να σβήσει τίποτα.
-- Τρέχει ως μία συναλλαγή: αν κάτι αποτύχει, δεν αλλάζει τίποτα. Δεν σβήνει αρχεία φωτογραφιών (Storage).
do $$
declare
  v_keep uuid;
  v_owners int;
  v_list text := '';
  v_tbl text;
  v_col text;
  v_left int;
  v_wipe text[] := array[
    'admin_actions', 'admin_flags', 'availability_blocks', 'availability_window_regions', 'availability_windows',
    'booking_request_pings', 'booking_requests', 'bookings', 'cancellation_reports', 'contact_messages',
    'credit_purchase_requests', 'delivery_availability_windows', 'delivery_bookings', 'delivery_open_claims',
    'delivery_requests', 'delivery_role_pings', 'delivery_role_requests', 'email_reset_codes', 'flow_events',
    'health_events', 'health_issues', 'login_attempts', 'messages', 'notifications', 'open_request_claims',
    'place_search_misses', 'push_outbox', 'push_subscriptions', 'request_drafts', 'reviews', 'skipper_availability',
    'wallet_transactions'
  ];
begin
  select count(*) into v_owners from public.users where is_owner and phone_number = '+306983427643';
  if v_owners <> 1 then
    raise exception 'wipe aborted: expected exactly one owner account, found %', v_owners;
  end if;
  select id into v_keep from public.users where is_owner and phone_number = '+306983427643';

  perform set_config('platform.trusted', 'true', true);

  -- 1. Όλα τα δεδομένα δραστηριότητας (όσοι πίνακες υπάρχουν· ένας άγνωστος πίνακας που δένεται με αυτούς σταματά τη διαδικασία).
  foreach v_tbl in array v_wipe loop
    if to_regclass('public.' || v_tbl) is not null then
      v_list := v_list || case when v_list = '' then '' else ', ' end || format('public.%I', v_tbl);
    end if;
  end loop;
  execute 'truncate table ' || v_list;

  -- 2. Αναφορές σε λογαριασμούς που φεύγουν, μέσα σε πίνακες που μένουν.
  update public.place_positions set updated_by = null where updated_by is not null;

  -- 3. Όλοι οι άλλοι λογαριασμοί (προφίλ, τηλέφωνα, γλώσσες φεύγουν μαζί) και οι ταυτότητες σύνδεσης.
  delete from public.skipper_profiles where user_id <> v_keep;
  delete from public.client_profiles where user_id <> v_keep;
  delete from auth.users where id <> v_keep;

  -- 4. Ο ιδιοκτήτης: καθαρό υπόλοιπο και μηδενισμένες αξιολογήσεις (οι αξιολογήσεις σβήστηκαν).
  update public.users set wallet_balance = 0 where id = v_keep;
  update public.client_profiles
     set rating_avg = null, rating_count = 0, completed_bookings_count = 0, cancellation_flag_count = 0
   where user_id = v_keep;
  update public.skipper_profiles
     set rating_avg = null, rating_count = 0, completed_bookings_count = 0, cancellation_flag_count = 0, approved_by = null
   where user_id = v_keep;
  for v_col in
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'skipper_profiles' and column_name like 'rating\_avg\_%'
  loop
    execute format('update public.skipper_profiles set %I = null where user_id = %L', v_col, v_keep);
  end loop;
  update public.skipper_secondary_roles set approved_by = null where approved_by is not null;

  -- 5. Έλεγχος: μένει ένας λογαριασμός, παντού.
  select count(*) into v_left from public.users;
  if v_left <> 1 then raise exception 'wipe failed: % accounts left in public.users', v_left; end if;
  select count(*) into v_left from auth.users;
  if v_left <> 1 then raise exception 'wipe failed: % accounts left in auth.users', v_left; end if;
end
$$;
