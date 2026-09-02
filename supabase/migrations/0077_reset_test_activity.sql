-- ============================================================================
-- 1) Διόρθωση πραγματικού bug στο complete_registration: το full_name στο
--    skipper_profiles συγχρονιζόταν με το νέο όνομα εγγραφής ΜΟΝΟ όταν το
--    ίδιο το skipper_profiles ήταν σημειωμένο deleted_at (αναβίωση). Αν ο
--    λογαριασμός (users) αναβίωνε με νέο όνομα αλλά το skipper_profiles του
--    δεν είχε ποτέ γίνει deleted_at (π.χ. προϋπήρχε από demo seed), το
--    skipper_profiles.full_name έμενε για πάντα στο παλιό όνομα — αυτό
--    ακριβώς παρατηρήθηκε: "συνδέθηκα ως Φανούρης Ντιπ, βγάζει Κώστας
--    Ιωάννου" (το header/προφίλ διαβάζει πρώτα skipper_profiles.full_name).
--    Τώρα το full_name συγχρονίζεται πάντα, ανεξάρτητα από deleted_at.
-- ============================================================================

create or replace function complete_registration(
  p_full_name text, p_email text, p_phone text, p_crew_role crew_role default null,
  p_phone_verified boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_pro boolean := p_crew_role is not null;
  v_role user_role := case when v_is_pro then 'skipper' else 'client' end;
  v_status user_status := case when v_is_pro then 'draft' else 'active' end;
  v_verified_at timestamptz := case when p_phone_verified then now() else null end;
  v_existing_user users%rowtype;
  v_existing_sp skipper_profiles%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(btrim(p_full_name), '') = '' then raise exception 'name_required'; end if;

  perform set_config('platform.trusted', 'true', true);

  select * into v_existing_user from users where id = v_uid;

  if not found then
    insert into users (id, role, full_name, email, phone_number, phone_verified_at, status)
      values (v_uid, v_role, btrim(p_full_name), nullif(btrim(p_email), ''), p_phone, v_verified_at, v_status);
  elsif v_existing_user.status = 'deleted' then
    update users set role = v_role, full_name = btrim(p_full_name),
      email = nullif(btrim(p_email), ''), phone_verified_at = v_verified_at, status = v_status
      where id = v_uid;
  else
    -- Ζωντανός λογαριασμός ήδη — δεν είναι αναβίωση, οπότε ρόλος/κατάσταση/
    -- επαλήθευση μένουν όπως είναι. Το όνομα/email όμως πρέπει να ακολουθούν
    -- ό,τι μόλις υποβλήθηκε, όχι να μένουν κολλημένα σε ό,τι υπήρχε πριν —
    -- αλλιώς ξαναγράφοντας με νέο όνομα πάνω σε ήδη ζωντανό λογαριασμό
    -- (π.χ. δοκιμαστικό τηλέφωνο Ghost Mode) το όνομα έμενε σιωπηλά το παλιό.
    update users set full_name = btrim(p_full_name), email = nullif(btrim(p_email), '')
      where id = v_uid;
  end if;

  if not v_is_pro then
    insert into client_profiles (user_id) values (v_uid) on conflict do nothing;
    return;
  end if;

  if p_crew_role in ('skipper', 'hostess', 'cook', 'deckhand') then
    select * into v_existing_sp from skipper_profiles where user_id = v_uid;
    if not found then
      insert into skipper_profiles (user_id, role, full_name, price_per_day)
        values (v_uid, p_crew_role, btrim(p_full_name), 210);
    elsif v_existing_sp.deleted_at is not null then
      update skipper_profiles set deleted_at = null, role = p_crew_role,
        full_name = btrim(p_full_name), approval_status = 'pending',
        approved_by = null, approved_at = null
        where id = v_existing_sp.id;
    else
      -- Ζωντανό προφίλ ήδη υπάρχει (π.χ. προϋπήρχε από demo seed) — δεν
      -- αγγίζουμε ρόλο/έγκριση (δεν είναι αναβίωση), αλλά το όνομα πρέπει
      -- να ακολουθεί το πιο πρόσφατο, όχι να μένει κολλημένο στο παλιό.
      update skipper_profiles set full_name = btrim(p_full_name)
        where id = v_existing_sp.id;
    end if;
  end if;
end;
$$;

-- Εφάπαξ διόρθωση για ήδη υπάρχουσα ασυμφωνία σε δοκιμαστικούς λογαριασμούς
-- (π.χ. ακριβώς η περίπτωση Φανούρης Ντιπ / Κώστας Ιωάννου παραπάνω).
update skipper_profiles sp set full_name = u.full_name
from users u
where u.id = sp.user_id and u.is_test_account = true
  and sp.full_name is distinct from u.full_name;

-- ============================================================================
-- 2) Καθαρό ξεκίνημα: μηδενικό ιστορικό (κρατήσεις, αιτήματα, μεταφορές,
--    μηνύματα, αξιολογήσεις, κινήσεις πορτοφολιού, ειδοποιήσεις) και
--    υπόλοιπο 200€ για κάθε δοκιμαστικό λογαριασμό (is_test_account = true).
--    Ίδια λογική με το 0061, επεκτεταμένη να καλύπτει και boat delivery
--    (δεν υπήρχε ακόμα όταν γράφτηκε το 0061) — πραγματικοί λογαριασμοί δεν
--    αγγίζονται καθόλου.
-- ============================================================================

do $$
declare v_ids uuid[]; v_request_ids uuid[]; v_delivery_request_ids uuid[];
begin
  select array_agg(id) into v_ids from users where is_test_account = true;
  if v_ids is null then return; end if;

  perform set_config('platform.trusted', 'true', true);

  -- --- Κανονικές κρατήσεις/αιτήματα (πλήρωμα) ---
  select array_agg(distinct r.id) into v_request_ids
  from booking_requests r
  left join bookings b on b.booking_request_id = r.id
  left join booking_request_pings p on p.booking_request_id = r.id
  where r.client_id = any(v_ids)
     or b.skipper_id in (select id from skipper_profiles where user_id = any(v_ids))
     or p.skipper_id in (select id from skipper_profiles where user_id = any(v_ids));

  -- --- Μεταφορές σκάφους (boat delivery) ---
  select array_agg(distinct dr.id) into v_delivery_request_ids
  from delivery_requests dr
  left join delivery_role_requests drr on drr.delivery_request_id = dr.id
  left join delivery_role_pings drp on drp.delivery_role_request_id = drr.id
  left join delivery_bookings db on db.delivery_request_id = dr.id
  where dr.client_id = any(v_ids)
     or db.skipper_id in (select id from skipper_profiles where user_id = any(v_ids))
     or drp.skipper_id in (select id from skipper_profiles where user_id = any(v_ids));

  -- Σειρά διαγραφής όπως επιβάλλουν τα foreign keys: πρώτα ό,τι δείχνει σε
  -- bookings/booking_requests/delivery_bookings/delivery_requests, μετά τα ίδια.
  delete from wallet_transactions
    where user_id = any(v_ids)
       or related_booking_request_id = any(v_request_ids)
       or related_delivery_role_request_id in (
            select id from delivery_role_requests where delivery_request_id = any(v_delivery_request_ids))
       or related_delivery_booking_id in (
            select id from delivery_bookings where delivery_request_id = any(v_delivery_request_ids));

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

  delete from booking_request_pings
    where skipper_id in (select id from skipper_profiles where user_id = any(v_ids));

  delete from booking_requests where id = any(v_request_ids);

  -- delivery_bookings δεν διαγράφεται αυτόματα (cascade) όταν φύγει το
  -- delivery_role_requests του — πρέπει να φύγει πρώτο.
  delete from delivery_bookings
    where delivery_request_id = any(v_delivery_request_ids)
       or skipper_id in (select id from skipper_profiles where user_id = any(v_ids));

  -- delivery_role_requests -> delivery_role_pings καθαρίζουν αυτόματα
  -- (ON DELETE CASCADE) μαζί με το delivery_requests.
  delete from delivery_requests where id = any(v_delivery_request_ids);

  delete from notifications where user_id = any(v_ids);

  -- --- Υπόλοιπο και μετρητές/βαθμολογίες πίσω σε καθαρή κατάσταση ---
  update users set wallet_balance = 200 where id = any(v_ids);

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

  -- Δεν υπήρχε ακόμα (0065) όταν γράφτηκε το 0061 — δευτερεύοντες ρόλοι
  -- πολυ-ρολων επαγγελματιών έχουν τη δική τους βαθμολογία, ξεχωριστή.
  update skipper_secondary_roles set
    rating_avg = null, rating_count = 0,
    rating_avg_safety = null, rating_avg_seamanship = null, rating_avg_professionalism = null,
    rating_avg_cleanliness = null, rating_avg_communication = null, rating_avg_hospitality = null,
    rating_avg_cooking = null, rating_avg_service = null, rating_avg_taste = null,
    rating_avg_variety = null, rating_avg_presentation = null, rating_avg_adaptability = null,
    rating_avg_organization = null, rating_avg_maintenance = null, rating_avg_teamwork = null,
    rating_avg_diligence = null
  where skipper_id in (select id from skipper_profiles where user_id = any(v_ids));
end $$;
