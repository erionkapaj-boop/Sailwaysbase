-- ============================================================================
-- Μοιράζει τους υπάρχοντες δοκιμαστικούς λογαριασμούς (is_test_account =
-- true) σε όλους τους ρόλους της πλατφόρμας, κυκλικά, ώστε να υπάρχει από
-- ένας δοκιμαστικός λογαριασμός για: πελάτης, admin, και κάθε τύπος
-- επαγγελματία (skipper, hostess, cook, deckhand) — 6 θέσεις συνολικά.
--
-- ΔΕΝ δημιουργεί καινούριους λογαριασμούς (θα ήταν χωρίς πραγματική
-- εγγραφή στο Supabase Auth, άρα αδύνατο να γίνει "Σύνδεση ως" σε αυτούς) —
-- αναδιανέμει μόνο όσους ήδη υπάρχουν. Αν είναι λιγότεροι από 6, το
-- μήνυμα στο τέλος λέει πόσους ρόλους δεν πρόλαβε να καλύψει.
--
-- Idempotent: ασφαλές να τρέξει ξανά (θα ξαναμοιράσει με την ίδια σειρά).
-- ============================================================================

do $$
declare
  v_ids uuid[];
  v_n int;
  v_id uuid;
  v_slot int;
  v_role user_role;
  v_crew_role crew_role;
  i int;
begin
  select array_agg(id order by created_at) into v_ids from users where is_test_account = true;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    raise notice 'Δεν βρέθηκε κανένας δοκιμαστικός λογαριασμός (is_test_account = true) — τίποτα να μοιραστεί.';
    return;
  end if;

  perform set_config('platform.trusted', 'true', true);

  for i in 1..v_n loop
    v_id := v_ids[i];
    v_slot := ((i - 1) % 6) + 1;

    case v_slot
      when 1 then v_role := 'client';  v_crew_role := null;
      when 2 then v_role := 'admin';   v_crew_role := null;
      when 3 then v_role := 'skipper'; v_crew_role := 'skipper';
      when 4 then v_role := 'skipper'; v_crew_role := 'hostess';
      when 5 then v_role := 'skipper'; v_crew_role := 'cook';
      when 6 then v_role := 'skipper'; v_crew_role := 'deckhand';
    end case;

    update users set role = v_role where id = v_id;

    if v_crew_role is not null then
      if exists (select 1 from skipper_profiles where user_id = v_id) then
        update skipper_profiles
          set role = v_crew_role, approval_status = 'approved',
              price_per_day = greatest(coalesce(price_per_day, 0), 210)
          where user_id = v_id;
      else
        insert into skipper_profiles (user_id, full_name, license_number, license_type, role, approval_status, price_per_day)
          select id, full_name, 'TEST-' || replace(id::text, '-', ''), 'Α', v_crew_role, 'approved', 210
          from users where id = v_id;
      end if;
    end if;
  end loop;

  if v_n < 6 then
    raise notice 'Βρέθηκαν μόνο % δοκιμαστικοί λογαριασμοί από τους 6 που χρειάζονται για πλήρη κάλυψη (πελάτης, admin, skipper, hostess, cook, deckhand). Λείπουν % — φτιάξε τόσους ακόμα μέσω κανονικής εγγραφής και σήμανέ τους ως δοκιμαστικούς (admin_set_test_account) για να καλυφθεί κάθε ρόλος.',
      v_n, 6 - v_n;
  end if;
end $$;
