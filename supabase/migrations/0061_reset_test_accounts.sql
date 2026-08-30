-- ============================================================================
-- Επαναφορά όλων των δοκιμαστικών λογαριασμών (is_test_account = true) σε
-- καθαρή κατάσταση: υπόλοιπο 300€, μηδενικό ιστορικό (καμία κράτηση, αίτημα,
-- μήνυμα, αξιολόγηση, κίνηση πορτοφολιού ή ειδοποίηση).
--
-- Ο ίδιος ο λογαριασμός/προφίλ ΔΕΝ διαγράφεται — μόνο η δραστηριότητά του.
-- Idempotent: ασφαλές να τρέξει ξανά.
-- ============================================================================

do $$
declare v_ids uuid[]; v_request_ids uuid[];
begin
  select array_agg(id) into v_ids from users where is_test_account = true;
  if v_ids is null then return; end if;

  perform set_config('platform.trusted', 'true', true);

  -- Κάθε αίτημα που αγγίζει δοκιμαστικό λογαριασμό, είτε ως πελάτης είτε
  -- (μέσω ping/κράτησης) ως επαγγελματίας — π.χ. ένας πραγματικός πελάτης
  -- που έκλεισε δοκιμαστικό επαγγελματία δεν αξίζει να μείνει με ένα
  -- "matched" αίτημα χωρίς την πίσω του κράτηση.
  select array_agg(distinct r.id) into v_request_ids
  from booking_requests r
  left join bookings b on b.booking_request_id = r.id
  left join booking_request_pings p on p.booking_request_id = r.id
  where r.client_id = any(v_ids)
     or b.skipper_id in (select id from skipper_profiles where user_id = any(v_ids))
     or p.skipper_id in (select id from skipper_profiles where user_id = any(v_ids));

  -- Σειρά διαγραφής όπως επιβάλλουν τα foreign keys: πρώτα ό,τι δείχνει σε
  -- bookings/booking_requests, μετά τα ίδια.
  delete from wallet_transactions
    where user_id = any(v_ids) or related_booking_request_id = any(v_request_ids);

  delete from messages where booking_id in (
    select id from bookings where booking_request_id = any(v_request_ids)
  );
  delete from reviews where booking_id in (
    select id from bookings where booking_request_id = any(v_request_ids)
  ) or reviewer_id = any(v_ids) or reviewee_id = any(v_ids);
  delete from cancellation_reports where booking_id in (
    select id from bookings where booking_request_id = any(v_request_ids)
  ) or reported_by = any(v_ids) or resolved_by = any(v_ids);

  delete from bookings where booking_request_id = any(v_request_ids);

  -- booking_request_pings καθαρίζει αυτόματα (ON DELETE CASCADE) όταν φύγει
  -- το booking_requests παρακάτω· η ρητή διαγραφή εδώ καλύπτει μόνο pings
  -- προς δοκιμαστικό επαγγελματία πάνω σε αίτημα που ΔΕΝ διαγράφεται (π.χ.
  -- ένας πραγματικός πελάτης που έστειλε σε πολλούς, ένας εκ των οποίων
  -- ήταν δοκιμαστικός, αλλά τελικά διάλεξε άλλον).
  delete from booking_request_pings
    where skipper_id in (select id from skipper_profiles where user_id = any(v_ids));

  delete from booking_requests where id = any(v_request_ids);

  delete from notifications where user_id = any(v_ids);

  -- Υπόλοιπο και μετρητές/βαθμολογίες πίσω σε καθαρή, μηδενική κατάσταση.
  update users set wallet_balance = 300 where id = any(v_ids);

  update client_profiles set
    completed_bookings_count = 0, cancellation_flag_count = 0,
    rating_avg = null, rating_count = 0,
    rating_avg_boat_respect = null, rating_avg_responsibility = null, rating_avg_cooperation = null,
    rating_avg_consistency = null, rating_avg_conduct = null, rating_avg_tidiness = null
  where user_id = any(v_ids);

  update skipper_profiles set
    completed_bookings_count = 0, cancellation_flag_count = 0,
    rating_avg = null, rating_count = 0,
    rating_avg_safety = null, rating_avg_seamanship = null, rating_avg_professionalism = null,
    rating_avg_cleanliness = null, rating_avg_communication = null, rating_avg_hospitality = null,
    rating_avg_cooking = null, rating_avg_service = null, rating_avg_taste = null,
    rating_avg_variety = null, rating_avg_presentation = null, rating_avg_adaptability = null,
    rating_avg_organization = null, rating_avg_maintenance = null, rating_avg_teamwork = null,
    rating_avg_diligence = null
  where user_id = any(v_ids);
end $$;
